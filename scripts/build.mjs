// Build do site para a Vercel: gera em dist/ as páginas HTML públicas, o sitemap e o robots.txt.
// Lê apenas dados públicos (categorias, bairros e fornecedores aprovados), com a chave publicável.
// Nenhuma chave secreta é usada. Se a leitura falhar, o build para e a Vercel mantém a versão anterior.
//
// Teste local sem internet: SEO_FIXTURE=caminho/dados.json npm run build
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPABASE } from '../js/config.js';
import * as seo from './seo.mjs';
import { GUIAS } from '../js/conteudo.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');
const PAGE_SIZE = 1000;

async function fetchAll(resource, query) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = `${SUPABASE.url}/rest/v1/${resource}?${query}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}` } });
    if (!res.ok) throw new Error(`Falha ao ler ${resource} (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadData() {
  if (process.env.SEO_FIXTURE) {
    return JSON.parse(await readFile(process.env.SEO_FIXTURE, 'utf8'));
  }
  const [categories, regions, suppliers] = await Promise.all([
    fetchAll('categories', 'select=id,slug,name,description,status,sort_order&order=sort_order.asc,name.asc'),
    fetchAll('regions', 'select=slug,name,description,sort_order&order=sort_order.asc,name.asc'),
    fetchAll(
      'suppliers',
      'select=id,slug,name,description,category_id,subcategory,supplier_type,bairro,city,state,sale_wholesale,sale_retail,sale_resellers,ships_other_cities,min_order,hours,tags,logo_url,verified,featured,is_demo,approval_status,supplier_photos(url,position)' +
        '&approval_status=eq.approved&is_demo=eq.false&order=id.asc',
    ),
  ]);
  return { categories, regions, suppliers };
}

async function write(relPath, content) {
  const file = join(OUT, relPath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
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
  const suppliers = data.suppliers.filter((s) => s.approval_status === 'approved' && !s.is_demo);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const regionBySlug = new Map(regions.map((r) => [r.slug, r]));
  const regionName = (slug) => regionBySlug.get(slug)?.name || '';
  const categoryName = (id) => catById.get(id)?.name || '';
  const byCat = new Map();
  const byRegion = new Map();
  for (const s of suppliers) {
    if (!byCat.has(s.category_id)) byCat.set(s.category_id, []);
    byCat.get(s.category_id).push(s);
    if (!byRegion.has(s.bairro)) byRegion.set(s.bairro, []);
    byRegion.get(s.bairro).push(s);
  }
  const listed = (c) => !seo.RESTRICTED_CATEGORY_SLUGS.includes(c.slug) && (byCat.get(c.id)?.length || 0) > 0;
  const listedCategories = categories.filter(listed);
  const listedRegions = regions.filter((r) => (byRegion.get(r.slug)?.length || 0) > 0);
  const sitemap = [];
  const featured = suppliers.filter((s) => s.featured).slice(0, 12);
  const sortedByName = (arr) => arr.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  // Início, listagens e páginas institucionais
  await write('site/index.html', seo.homePage({ categories: listedCategories, regions: listedRegions, suppliers, featured }));
  sitemap.push({ path: '/site' });
  sitemap.push({ path: '/' });

  await write('categorias/index.html', seo.categoriesIndexPage({
    categories: listedCategories,
    counts: Object.fromEntries(listedCategories.map((c) => [c.id, byCat.get(c.id)?.length || 0])),
  }));

  await write('fornecedores/index.html', seo.suppliersIndexPage({ suppliers: sortedByName(suppliers), regionName, categoryName }));

  await write('mapa/index.html', seo.mapPage({
    regions,
    suppliersByRegion: Object.fromEntries(regions.map((r) => [r.slug, sortedByName(byRegion.get(r.slug) || [])])),
  }));

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

  // Categorias (inclusive as sem fornecedores e a restrita, que ficam noindex)
  for (const cat of categories) {
    const list = sortedByName(byCat.get(cat.id) || []);
    await write(`categorias/${cat.slug}/index.html`, seo.categoryPage({ category: cat, suppliers: list, regionName }));
  }

  // Regiões (bairros). Só entram no sitemap as que têm fornecedores de São Paulo.
  for (const region of regions) {
    const list = sortedByName(byRegion.get(region.slug) || []);
    await write(`regiao/${region.slug}/index.html`, seo.regionPage({ region, suppliers: list, categoryName }));
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

  // Fichas dos fornecedores aprovados: geradas para o site, mas NÃO entram no sitemap nem são indexadas.
  for (const s of suppliers) {
    const category = catById.get(s.category_id);
    const related = sortedByName((byCat.get(s.category_id) || []).filter((o) => o.id !== s.id)).slice(0, 6);
    await write(`fornecedor/${s.slug}/index.html`, seo.supplierPage({
      supplier: s,
      category,
      regionName,
      related,
    }));
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

  console.log(`Build OK: ${sitemap.length} URLs no sitemap, ${suppliers.length} fichas de fornecedores, ${listedCategories.length} categorias listadas, ${listedRegions.length} bairros com fornecedores.`);
}

main().catch((err) => {
  console.error(`Build falhou: ${err.message}`);
  process.exit(1);
});
