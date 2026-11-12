// Build do site para a Vercel: gera em dist/ as páginas públicas, o sitemap e o robots.txt.
// Lê do banco apenas os slugs do catálogo (papel build_publico, que só executa catalogo_slugs()).
// Nenhum nome, descrição, foto ou dado de fornecedor entra no build. As páginas do catálogo são cascas
// genéricas com noindex, fora do sitemap. Se a leitura falhar, o build para e a Vercel mantém a versão anterior.
//
// Teste local sem internet: SEO_FIXTURE=caminho/dados.json npm run build
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as seo from './seo.mjs';
import { GUIAS } from '../js/conteudo.js';
import { loadData } from './dados.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');

async function write(relPath, content) {
  const file = join(OUT, relPath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
}

async function main() {
  // Lança erro se o banco não responder ou se os slugs vierem fora do formato (validação em dados.mjs).
  const { categories, regions, suppliers } = await loadData();

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

  const sitemap = [];

  // Início e páginas do catálogo: cascas genéricas, todas com noindex.
  const homeHtml = seo.homePage();
  await write('site/index.html', homeHtml);
  // /categorias/mais-acessados não é categoria do banco: é uma rota do app. Recebe a casca da home
  // para continuar respondendo 200 sem reescrita genérica. Fica fora do sitemap.
  await write('categorias/mais-acessados/index.html', homeHtml);
  sitemap.push({ path: '/' });

  await write('categorias/index.html', seo.categoriesIndexPage());
  await write('fornecedores/index.html', seo.suppliersIndexPage());
  await write('mapa/index.html', seo.mapPage());

  // Páginas institucionais (indexáveis).
  const info = [
    { path: '/sobre', title: 'Como funciona', h1: 'Como funciona', description: 'Conheça o Fornecedores Atacado SP e como funciona o portal.' },
    { path: '/contato', title: 'Contato', h1: 'Contato', description: 'Fale com a equipe do Fornecedores Atacado SP.' },
    { path: '/privacidade', title: 'Privacidade', h1: 'Política de privacidade', description: 'Como o Fornecedores Atacado SP trata os dados de visitantes e de quem cadastra fornecedores.' },
    { path: '/termos', title: 'Termos de uso', h1: 'Termos de uso', description: 'Regras de uso do Fornecedores Atacado SP para visitantes e fornecedores cadastrados.' },
  ];
  for (const page of info) {
    await write(`${page.path.slice(1)}/index.html`, seo.staticInfoPage(page));
    sitemap.push({ path: page.path });
  }

  // Categorias, bairros e fichas: uma casca por slug, todas com noindex e fora do sitemap.
  for (const category of categories) {
    await write(`categorias/${category.slug}/index.html`, seo.categoryPage({ category }));
  }
  for (const region of regions) {
    await write(`regiao/${region.slug}/index.html`, seo.regionPage({ region }));
  }
  for (const supplier of suppliers) {
    await write(`fornecedor/${supplier.slug}/index.html`, seo.supplierPage({ supplier }));
  }

  // Planos e guias (conteúdo público próprio, indexável)
  await write('planos/index.html', seo.planosPage());
  sitemap.push({ path: '/planos' });
  await write('guias/index.html', seo.guiasIndexPage());
  sitemap.push({ path: '/guias' });
  for (const g of GUIAS) {
    await write(`guias/${g.slug}/index.html`, seo.guiaPage(g));
    sitemap.push({ path: `/guias/${g.slug}` });
  }

  // Áreas que não devem aparecer no Google (o app carrega o conteúdo)
  const shells = [
    { path: '/login', title: 'Entrar' },
    { path: '/registro', title: 'Criar conta' },
    { path: '/cadastro', title: 'Cadastrar fornecedor' },
    { path: '/favoritos', title: 'Favoritos' },
    { path: '/sair', title: 'Sair' },
    { path: '/admin', title: 'Painel administrativo' },
  ];
  for (const shell of shells) {
    await write(`${shell.path.slice(1)}/index.html`, seo.noindexShell(shell));
  }

  await write('404.html', seo.notFoundPage());
  await write('robots.txt', seo.robotsTxt());
  await write('sitemap.xml', seo.sitemapXml(sitemap));

  console.log(`Build OK: ${sitemap.length} URLs no sitemap, ${categories.length} categorias, ${regions.length} bairros, ${suppliers.length} fichas protegidas (noindex, fora do sitemap).`);
}

main().catch((err) => {
  console.error(`Build falhou: ${err.message}`);
  process.exit(1);
});
