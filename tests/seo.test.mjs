import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as seo from '../scripts/seo.mjs';
import { SITE } from '../js/config.js';

const cat = { id: 'c1', slug: 'moda-feminina', name: 'Moda feminina', description: 'Vestuário feminino.' };
const restricted = { id: 'c2', slug: 'vapers-e-acessorios', name: 'Vapers e acessórios', description: '' };
const region = { slug: 'bras', name: 'Brás', description: 'Polo de atacado.' };

test('esc protege caracteres especiais', () => {
  assert.equal(seo.esc('<a href="x">Tom & Jerry\'s</a>'), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
});

test('URLs absolutas usam o domínio oficial', () => {
  assert.equal(seo.absUrl('/planos'), `${SITE.url}/planos`);
  assert.equal(seo.absUrl('/'), `${SITE.url}/`);
});

test('robots.txt bloqueia áreas privadas, mas não bloqueia CSS, JS nem imagens', () => {
  const txt = seo.robotsTxt();
  for (const p of ['/admin', '/login', '/registro', '/cadastro', '/favoritos', '/sair']) {
    assert.ok(txt.includes(`Disallow: ${p}`), `falta Disallow ${p}`);
  }
  assert.ok(!/Disallow: \/(css|js|img)/.test(txt));
  assert.ok(txt.includes(`Sitemap: ${SITE.url}/sitemap.xml`));
});

test('sitemap contém só as URLs passadas, em domínio oficial e sem #', () => {
  const xml = seo.sitemapXml([{ path: '/' }, { path: '/planos' }]);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, [`${SITE.url}/`, `${SITE.url}/planos`]);
  assert.ok(!xml.includes('#'));
});

test('categoria fica noindex mesmo sem fornecedores (catálogo fechado)', () => {
  const html = seo.categoryPage({ category: cat });
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
  assert.ok(html.includes(`<link rel="canonical" href="${SITE.url}/categorias/moda-feminina">`));
});

test('categoria restrita também fica noindex', () => {
  assert.ok(seo.categoryPage({ category: restricted }).includes('noindex'));
});

test('página de categoria tem só nome e descrição: sem fornecedores, fotos, contagens nem fichas', () => {
  const html = seo.categoryPage({ category: cat });
  assert.ok(html.includes('<h1>Fornecedores de Moda feminina</h1>'));
  assert.ok(!/\d+\s+fornecedores/.test(html), 'não pode haver contagem de fornecedores');
  assert.ok(!html.includes('href="/fornecedor/'), 'não pode linkar fichas');
  assert.ok(!html.includes('supplier-card'));
});

test('lista de categorias não mostra contagem por categoria (D2)', () => {
  const html = seo.categoriesIndexPage({ categories: [cat, restricted] });
  assert.ok(html.includes('<strong>Moda feminina</strong>'));
  assert.ok(!/\d+\s+fornecedores/.test(html));
  assert.ok(html.includes('noindex'));
});

test('ficha de fornecedor não é gerada pelo build (é servida pelo app)', () => {
  assert.equal(typeof seo.supplierPage, 'undefined');
  assert.equal(typeof seo.suppliersIndexPage, 'undefined');
  assert.equal(typeof seo.visitorCardHtml, 'undefined');
});

test('páginas geradas não têm links com #', () => {
  const outputs = [
    seo.categoryPage({ category: cat }),
    seo.regionPage({ region }),
    seo.catalogShellPage({ path: '/mapa', title: 'Mapa', h1: 'Mapa' }),
    seo.homePage({ categories: [cat], regions: [region] }),
    seo.notFoundPage(),
  ];
  for (const html of outputs) assert.ok(!/href="#/.test(html), 'achou link com #');
});

test('home tem título e H1 do plano de SEO', () => {
  const html = seo.homePage({ categories: [cat], regions: [region] });
  assert.ok(html.includes('<title>Fornecedores de SP | Brás, Moda, Tênis e Eletrônicos</title>'));
  // H1 igual ao da home do site (a troca da versão pré-gerada para o site não pode mudar o título).
  assert.ok(html.includes('<h1>Encontre fornecedores de atacado em São Paulo</h1>'));
  assert.ok(html.includes('fornecedores de atacado'), 'palavra-chave continua no título da página');
  // Banner da home removido: a home não deve mais renderizar a faixa de banners.
  assert.ok(!html.includes('banner-section'), 'home não deve mais ter banner');
  assert.ok(html.includes('"@type":"Organization"'));
  assert.ok(html.includes('"@type":"WebSite"'));
});

test('páginas de área restrita são noindex', () => {
  const html = seo.noindexShell({ path: '/login', title: 'Entrar' });
  assert.ok(html.includes('noindex, nofollow'));
});

test('404 é noindex', () => {
  assert.ok(seo.notFoundPage().includes('noindex'));
});
