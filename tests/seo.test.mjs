import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as seo from '../scripts/seo.mjs';
import { SITE } from '../js/config.js';

const cat = { id: 'c1', slug: 'moda-feminina', name: 'Moda feminina', description: 'Vestuário feminino.' };
const restricted = { id: 'c2', slug: 'vapers-e-acessorios', name: 'Vapers e acessórios', description: '' };
const region = { slug: 'bras', name: 'Brás', description: 'Polo de atacado.' };
const regionName = (slug) => (slug === 'bras' ? 'Brás' : '');

const supplier = {
  id: 's1',
  slug: 'vazevedo-modas',
  name: 'Vazevedo Modas',
  description: 'Roupas femininas para revenda.',
  category_id: 'c1',
  subcategory: '',
  supplier_type: 'atacadista',
  bairro: 'bras',
  city: 'São Paulo',
  state: 'SP',
  sale_wholesale: true,
  sale_retail: false,
  sale_resellers: false,
  ships_other_cities: true,
  min_order: '',
  hours: '',
  tags: [],
  logo_url: null,
  verified: false,
  featured: false,
  supplier_photos: [],
};

test('esc protege caracteres especiais', () => {
  assert.equal(seo.esc('<a href="x">Tom & Jerry\'s</a>'), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
});

test('URLs absolutas usam o domínio oficial', () => {
  assert.equal(seo.absUrl('/fornecedor/x'), `${SITE.url}/fornecedor/x`);
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
  const xml = seo.sitemapXml([{ path: '/' }, { path: '/fornecedor/x' }]);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, [`${SITE.url}/`, `${SITE.url}/fornecedor/x`]);
  assert.ok(!xml.includes('#'));
});

test('categoria restrita fica fora do Google (noindex)', () => {
  const html = seo.categoryPage({ category: restricted, suppliers: [supplier], regionName });
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
});

test('categoria sem fornecedores fica noindex', () => {
  const html = seo.categoryPage({ category: cat, suppliers: [], regionName });
  assert.ok(html.includes('noindex'));
});

test('categoria com fornecedores é indexável, com canonical próprio e H1', () => {
  const html = seo.categoryPage({ category: cat, suppliers: [supplier], regionName });
  assert.ok(html.includes('<meta name="robots" content="index, follow">'));
  assert.ok(html.includes(`<link rel="canonical" href="${SITE.url}/categorias/moda-feminina">`));
  assert.ok(html.includes('<h1>Fornecedores de Moda feminina em São Paulo</h1>'));
});

test('texto da categoria usa só números reais', () => {
  const two = [supplier, { ...supplier, id: 's2', slug: 'b', sale_wholesale: false, ships_other_cities: false }];
  const [first] = seo.categorySeoText(cat, two, regionName);
  assert.ok(first.includes('os 2 fornecedores aprovados'));
  const paragraphs = seo.categorySeoText(cat, two, regionName).join(' ');
  assert.ok(paragraphs.includes('1 vende no atacado'));
  assert.ok(paragraphs.includes('1 envia para outras cidades'));
  assert.ok(!paragraphs.includes('3 fornecedores'));
});

test('ficha não mostra campos vazios (nada inventado)', () => {
  const html = seo.supplierPage({ supplier, category: cat, regionName, related: [] });
  assert.ok(!html.includes('Pedido mínimo'));
  assert.ok(!html.includes('Horário de funcionamento'));
  assert.ok(!html.includes('Fornecedor verificado'));
  assert.ok(html.includes('Tipo de fornecedor'));
  assert.ok(html.includes('<dd>Atacadista</dd>'));
});

test('ficha mostra selo de verificado quando o admin marcou', () => {
  const html = seo.supplierPage({ supplier: { ...supplier, verified: true }, category: cat, regionName, related: [] });
  assert.ok(html.includes('Fornecedor verificado'));
});

test('logo não vira foto e foto não vira logo', () => {
  const withPhoto = seo.supplierPage({ supplier: { ...supplier, supplier_photos: [{ url: 'https://x.test/f.webp', position: 0 }] }, category: cat, regionName, related: [] });
  assert.ok(!withPhoto.includes('Logo de Vazevedo'));
  assert.ok(withPhoto.includes('alt="Foto de Vazevedo Modas"'));
  const withLogo = seo.supplierPage({ supplier: { ...supplier, logo_url: 'https://x.test/logo.webp' }, category: cat, regionName, related: [] });
  assert.ok(withLogo.includes('alt="Logo de Vazevedo Modas"'));
});

test('ficha não expõe contatos (WhatsApp e Instagram não estão nos dados públicos)', () => {
  const html = seo.supplierPage({ supplier: { ...supplier, whatsapp: '11912345678', instagram: 'loja' }, category: cat, regionName, related: [] });
  assert.ok(!html.includes('11912345678'));
  assert.ok(!html.includes('instagram.com/loja'));
});

test('breadcrumb e JSON-LD estão presentes na ficha', () => {
  const html = seo.supplierPage({ supplier, category: cat, regionName, related: [] });
  assert.ok(html.includes('"@type":"BreadcrumbList"'));
  assert.ok(html.includes(`"item":"${SITE.url}/fornecedor/vazevedo-modas"`));
});

test('JSON-LD não quebra o HTML com </script> no texto', () => {
  const html = seo.supplierPage({ supplier: { ...supplier, name: 'Loja </script><b>' }, category: cat, regionName, related: [] });
  assert.ok(!html.includes('</script><b>'));
});

test('páginas geradas não têm links com #', () => {
  const outputs = [
    seo.categoryPage({ category: cat, suppliers: [supplier], regionName }),
    seo.supplierPage({ supplier, category: cat, regionName, related: [] }),
    seo.regionPage({ region, suppliers: [supplier], categoryName: () => 'Moda feminina' }),
    seo.homePage({ categories: [cat], regions: [region], suppliers: [supplier], featured: [] }),
    seo.notFoundPage(),
  ];
  for (const html of outputs) assert.ok(!/href="#/.test(html), 'achou link com #');
});

test('home tem título e H1 do plano de SEO', () => {
  const html = seo.homePage({ categories: [cat], regions: [region], suppliers: [supplier], featured: [] });
  assert.ok(html.includes('<title>Fornecedores Atacado SP | Brás, Moda, Tênis e Eletrônicos</title>'));
  assert.ok(html.includes('<h1>Fornecedores de atacado em São Paulo</h1>'));
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
