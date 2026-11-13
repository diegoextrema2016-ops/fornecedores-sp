// Regras de indexação e de categorias visíveis (usadas pelo build e pelo app).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deveSerIndexado, categoriaVisivel, ordenarCategorias, tituloHome, RESTRICTED_CATEGORY_SLUGS } from '../js/conteudo.js';
import * as seo from '../scripts/seo.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('ficha de fornecedor nunca é indexada, nem pelo app nem pelo HTML pré-gerado', () => {
  assert.equal(deveSerIndexado('/fornecedor/lacelore-bolsas', {}), false);
  // Mesmo que a página tente dizer o contrário, o caminho /fornecedor/ vence.
  assert.equal(deveSerIndexado('/fornecedor/lacelore-bolsas', { noindex: false }), false);
  const supplier = { id: 's1', slug: 'loja', name: 'Loja', status: 'approved', category: 'moda-feminina', category_id: 'c1', bairro: 'bras', state: 'SP', city: 'São Paulo', approval_status: 'approved' };
  const html = seo.supplierPage({ supplier, category: { name: 'Moda' }, regionName: () => 'Brás', related: [] });
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
});

test('páginas de conta e painel ficam fora do Google', () => {
  for (const p of ['/admin', '/admin/fornecedores', '/login', '/registro', '/cadastro', '/favoritos', '/sair']) {
    assert.equal(deveSerIndexado(p, {}), false, p);
  }
});

test('só páginas comerciais e institucionais são indexáveis', () => {
  for (const p of ['/', '/site', '/sobre', '/contato', '/privacidade', '/termos', '/planos', '/guias', '/guias/atacado-ou-varejo-diferencas']) {
    assert.equal(deveSerIndexado(p, {}), true, p);
  }
});

test('catálogo inteiro fica fora do Google: categorias, regiões, mapa, listagens e fichas', () => {
  for (const p of ['/categorias', '/categorias/moda-feminina', '/categorias/tenis', '/categorias/mais-acessados', '/regiao/bras', '/mapa', '/fornecedores', '/fornecedores?q=bolsa', '/fornecedor/lacelore-bolsas']) {
    assert.equal(deveSerIndexado(p, {}), false, p);
  }
});

test('HTML pré-gerado: catálogo com noindex e páginas comerciais indexáveis', () => {
  const cat = { id: 'c1', slug: 'moda', name: 'Moda', sortOrder: 1 };
  const sup = { id: 's1', slug: 'loja', name: 'Loja', status: 'approved', category: 'moda', category_id: 'c1', bairro: 'bras', state: 'SP', city: 'São Paulo', approval_status: 'approved' };
  const robots = (html) => (html.match(/<meta name="robots" content="([^"]+)"/) || [])[1];
  assert.equal(robots(seo.categoriesIndexPage({ categories: [cat], counts: { c1: 1 } })), 'noindex, nofollow');
  assert.equal(robots(seo.categoryPage({ category: cat, suppliers: [sup], regionName: () => 'Brás' })), 'noindex, nofollow');
  assert.equal(robots(seo.regionPage({ region: { slug: 'bras', name: 'Brás' }, suppliers: [sup], categoryName: () => 'Moda' })), 'noindex, nofollow');
  assert.equal(robots(seo.mapPage({ regions: [], suppliersByRegion: {} })), 'noindex, nofollow');
  assert.equal(robots(seo.suppliersIndexPage({ suppliers: [sup], regionName: () => 'Brás', categoryName: () => 'Moda' })), 'noindex, nofollow');
  assert.equal(robots(seo.supplierPage({ supplier: sup, category: cat, regionName: () => 'Brás', related: [] })), 'noindex, nofollow');
  assert.equal(robots(seo.planosPage()), 'index, follow');
  assert.equal(robots(seo.guiasIndexPage()), 'index, follow');
  assert.equal(robots(seo.staticInfoPage({ path: '/sobre', title: 'Como funciona', description: 'd', h1: 'Como funciona' })), 'index, follow');
});

test('sitemap do build só lista páginas comerciais e institucionais', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, SEO_FIXTURE: 'tests/fixtures-seo.json' }, stdio: 'pipe' });
  const xml = readFileSync(new URL('../dist/sitemap.xml', import.meta.url), 'utf8');
  const paths = [...xml.matchAll(/<loc>https?:\/\/[^/<]+(\/[^<]*)<\/loc>/g)].map((m) => m[1].replace(/\/$/, '') || '/');
  assert.ok(paths.length > 0);
  for (const p of paths) assert.equal(deveSerIndexado(p, {}), true, 'sitemap tem página não indexável: ' + p);
  assert.ok(!paths.some((p) => /^\/(categorias|regiao|fornecedor|fornecedores|mapa)/.test(p)), 'catálogo no sitemap');
});

test('página com noindex declarado continua sem índice', () => {
  assert.equal(deveSerIndexado('/categorias/tenis', { noindex: true }), false);
});

test('categoria só fica visível com fornecedores e sem restrição', () => {
  assert.equal(categoriaVisivel({ slug: 'tenis' }, 0), false, 'vazia não aparece');
  assert.equal(categoriaVisivel({ slug: 'tenis' }, 3), true, 'com fornecedor aparece');
  assert.equal(categoriaVisivel({ slug: RESTRICTED_CATEGORY_SLUGS[0] }, 5), false, 'restrita nunca aparece');
});

test('ordem das categorias: sortOrder e depois nome', () => {
  const lista = [{ name: 'Tênis', sortOrder: 2 }, { name: 'Bolsas', sortOrder: 1 }, { name: 'Calçados' }];
  assert.deepEqual(ordenarCategorias(lista).map((c) => c.name), ['Calçados', 'Bolsas', 'Tênis']);
});

test('título da home cita no máximo três categorias visíveis', () => {
  assert.equal(tituloHome([]), 'Fornecedores Atacado SP | Brás');
  assert.equal(tituloHome(['Moda']), 'Fornecedores Atacado SP | Brás, Moda');
  assert.equal(tituloHome(['Moda', 'Perfumes']), 'Fornecedores Atacado SP | Brás, Moda e Perfumes');
  assert.equal(tituloHome(['A', 'B', 'C', 'D']), 'Fornecedores Atacado SP | Brás, A, B e C');
});

test('home pré-gerada não cita tênis quando a categoria está vazia', () => {
  const moda = { id: 'c1', slug: 'moda', name: 'Moda', sortOrder: 1 };
  const html = seo.homePage({ categories: [moda], regions: [], suppliers: [], featured: [] });
  assert.ok(!html.includes('Tênis'), 'nem título, nem atalho, nem descrição');
  assert.ok(html.includes('<title>Fornecedores Atacado SP | Brás, Moda</title>'));
});

test('landing da raiz usa a marca Fornecedores Atacado SP no título', () => {
  const landing = readFileSync(new URL('../apresentacao/index.html', import.meta.url), 'utf8');
  assert.ok(landing.includes('<title>Fornecedores Atacado SP |'));
  assert.ok(!/<title>FORNECEDORES DE SP/.test(landing));
});
