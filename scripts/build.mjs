// Build do site para a Vercel: gera em dist/ as páginas HTML públicas, o sitemap e o robots.txt.
//
// Catálogo fechado: o build NÃO lê fornecedores. Só lê categorias e bairros (nomes públicos, decisão D1),
// que o banco libera a visitantes. Nenhum fornecedor, foto, contato ou contagem entra no dist/.
// Quem tem assinatura vê o catálogo no app, depois do login, pelo banco.
// O build também confere o resultado (scripts/verifica-dist.mjs) e falha se achar dado de fornecedor.
//
// Teste local sem internet: SEO_FIXTURE=caminho/dados.json npm run build (os fornecedores do arquivo são ignorados)
import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPABASE } from '../js/config.js';
import * as seo from './seo.mjs';
import { GUIAS } from '../js/conteudo.js';
import { ehPrevia, configuracaoDePrevia, referenciasDeProducao, PROD_SUPABASE_URL, PROD_SITE } from './preview-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');
const PAGE_SIZE = 1000;
const EXTENSOES_DE_TEXTO = /\.(html|js|mjs|json|xml|txt|css)$/;

// Na prévia (Vercel, ambiente Preview) o alvo é o projeto DEV; em produção, o de js/config.js.
// configuracaoDePrevia falha fechada: se algo estiver errado, o build para antes de ler ou publicar qualquer coisa.
const PREVIA = ehPrevia(process.env) ? configuracaoDePrevia(process.env, SUPABASE.anonKey) : null;
const ALVO = PREVIA ? { url: PREVIA.supabaseUrl, anonKey: PREVIA.anonKey } : { url: SUPABASE.url, anonKey: SUPABASE.anonKey };

async function fetchAll(resource, query) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = `${ALVO.url}/rest/v1/${resource}?${query}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: ALVO.anonKey, Authorization: `Bearer ${ALVO.anonKey}` } });
    if (!res.ok) throw new Error(`Falha ao ler ${resource} (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

// Só categorias e bairros. Nada de fornecedores.
async function loadData() {
  if (process.env.SEO_FIXTURE) {
    const fixture = JSON.parse(await readFile(process.env.SEO_FIXTURE, 'utf8'));
    return { categories: fixture.categories || [], regions: fixture.regions || [] };
  }
  const [categories, regions] = await Promise.all([
    fetchAll('categories', 'select=id,slug,name,description,status,sort_order&order=sort_order.asc,name.asc'),
    fetchAll('regions', 'select=slug,name,description,sort_order&order=sort_order.asc,name.asc'),
  ]);
  return { categories, regions };
}

async function write(relPath, content) {
  const file = join(OUT, relPath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
}

async function listarTextos(dir) {
  const achados = [];
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...(await listarTextos(caminho)));
    else if (EXTENSOES_DE_TEXTO.test(entrada.name)) achados.push(caminho);
  }
  return achados;
}

// Prévia: troca o projeto, a chave e o domínio de produção pelos da prévia, pede que os buscadores não indexem
// e confere que nada de produção restou. Se restar algo, o build falha e nada é publicado.
async function aplicarPrevia(previa) {
  const trocas = [[PROD_SUPABASE_URL, previa.supabaseUrl], [SUPABASE.anonKey, previa.anonKey], [PROD_SITE, previa.siteUrl]];
  const arquivos = await listarTextos(OUT);
  for (const arquivo of arquivos) {
    let texto = await readFile(arquivo, 'utf8');
    for (const [de, para] of trocas) texto = texto.split(de).join(para);
    if (arquivo.endsWith('.html')) texto = texto.split('<meta name="robots" content="index, follow">').join('<meta name="robots" content="noindex, nofollow">');
    await writeFile(arquivo, texto, 'utf8');
  }
  await writeFile(join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
  const lidos = [];
  for (const arquivo of await listarTextos(OUT)) lidos.push({ nome: relative(OUT, arquivo), texto: await readFile(arquivo, 'utf8') });
  const achados = referenciasDeProducao(lidos, SUPABASE.anonKey);
  if (achados.length) throw new Error(`prévia recusada: referências de produção restaram em ${achados.join(', ')}`);
  console.log(`Prévia: ${arquivos.length} arquivos apontados para o projeto DEV (${previa.supabaseUrl}), sem indexação, sem nenhuma referência de produção.`);
}

async function main() {
  const data = await loadData();
  if (!data.categories?.length || !data.regions?.length) {
    throw new Error('Categorias ou bairros vieram vazios. Verifique as regras de leitura pública do banco antes de publicar.');
  }

  // Ícone do index.html, para usar em todas as páginas.
  const indexSrc = await readFile(join(ROOT, 'index.html'), 'utf8');
  seo.setFavicon(indexSrc.match(/<link rel="icon"[^>]*>/)?.[0] || '');

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  // Assets do app (copiados como estão).
  for (const dir of ['css', 'js', 'img']) {
    if (existsSync(join(ROOT, dir))) await cp(join(ROOT, dir), join(OUT, dir), { recursive: true });
  }
  // Landing de apresentação: é a página inicial do domínio (/). A home completa fica em /site.
  await mkdir(join(OUT, 'apresentacao'), { recursive: true });
  await cp(join(ROOT, 'apresentacao', 'landing.css'), join(OUT, 'apresentacao', 'landing.css'));
  await cp(join(ROOT, 'apresentacao', 'landing.js'), join(OUT, 'apresentacao', 'landing.js'));
  await cp(join(ROOT, 'apresentacao', 'index.html'), join(OUT, 'index.html'));

  const categories = data.categories.filter((c) => c.status !== 'inactive');
  const regions = data.regions;
  const sitemap = [];

  // Início (só nomes de categorias e bairros) e páginas institucionais: são as únicas indexadas.
  await write('site/index.html', seo.homePage({ categories, regions }));
  sitemap.push({ path: '/site' });
  sitemap.push({ path: '/' });

  // Lista do catálogo e mapa: apresentação sem nenhum dado, fora do Google.
  await write('categorias/index.html', seo.categoriesIndexPage({ categories }));
  await write('fornecedores/index.html', seo.catalogShellPage({ path: '/fornecedores', title: 'Fornecedores', h1: 'Fornecedores', description: 'Catálogo de fornecedores de São Paulo, exclusivo para assinantes.' }));
  await write('mapa/index.html', seo.catalogShellPage({ path: '/mapa', title: 'Mapa de fornecedores', h1: 'Mapa de fornecedores por bairro', description: 'Mapa de fornecedores por bairro em São Paulo, exclusivo para assinantes.' }));

  const info = [
    { path: '/sobre', title: 'Como funciona', h1: 'Como funciona', description: 'Conheça o Fornecedores de SP e como funciona o portal.' },
    { path: '/contato', title: 'Contato', h1: 'Contato', description: 'Fale com a equipe do Fornecedores de SP.' },
    { path: '/privacidade', title: 'Privacidade', h1: 'Política de privacidade', description: 'Como o Fornecedores de SP trata os dados de visitantes e de quem cadastra fornecedores.' },
    { path: '/termos', title: 'Termos de uso', h1: 'Termos de uso', description: 'Regras de uso do Fornecedores de SP para visitantes e fornecedores cadastrados.' },
  ];
  for (const page of info) {
    await write(`${page.path.slice(1)}/index.html`, seo.staticInfoPage(page));
    sitemap.push({ path: page.path });
  }

  // Categorias e bairros: só nome e descrição, fora do Google (noindex). Sem contagens.
  for (const cat of categories) {
    await write(`categorias/${cat.slug}/index.html`, seo.categoryPage({ category: cat }));
  }
  for (const region of regions) {
    await write(`regiao/${region.slug}/index.html`, seo.regionPage({ region }));
  }

  // Planos e guias (conteúdo público próprio)
  await write('planos/index.html', seo.planosPage());
  sitemap.push({ path: '/planos' });
  await write('guias/index.html', seo.guiasIndexPage());
  sitemap.push({ path: '/guias' });
  for (const g of GUIAS) {
    await write(`guias/${g.slug}/index.html`, seo.guiaPage(g));
    sitemap.push({ path: `/guias/${g.slug}` });
  }

  // Fichas de fornecedores: NÃO são geradas. /fornecedor/<slug> é servido pelo app (vercel.json),
  // com X-Robots-Tag noindex, e a ficha só aparece para assinantes.

  // Áreas que não devem aparecer no Google (o app carrega o conteúdo)
  const shells = [
    { path: '/login', title: 'Entrar' },
    { path: '/registro', title: 'Criar conta' },
    { path: '/cadastro', title: 'Cadastrar fornecedor' },
    { path: '/favoritos', title: 'Favoritos' },
    { path: '/sair', title: 'Sair' },
    // Telas dos links de e-mail e da conta (o app carrega o conteúdo; o endereço precisa existir no servidor).
    { path: '/esqueci-senha', title: 'Recuperar senha' },
    { path: '/redefinir-senha', title: 'Nova senha' },
    { path: '/reenviar-confirmacao', title: 'Reenviar confirmação' },
    { path: '/conta', title: 'Minha conta' },
    { path: '/conta/retorno', title: 'Confirmação' },
    { path: '/admin', title: 'Painel administrativo' },
  ];
  for (const shell of shells) {
    await write(`${shell.path.slice(1)}/index.html`, seo.noindexShell(shell));
  }

  await write('404.html', seo.notFoundPage());
  await write('robots.txt', seo.robotsTxt());
  await write('sitemap.xml', seo.sitemapXml(sitemap));

  if (PREVIA) await aplicarPrevia(PREVIA);

  console.log(`Build OK: ${sitemap.length} URLs no sitemap, ${categories.length} categorias e ${regions.length} bairros (só nomes). Nenhum fornecedor foi lido nem publicado.`);
}

main().catch((err) => {
  console.error(`Build falhou: ${err.message}`);
  process.exit(1);
});
