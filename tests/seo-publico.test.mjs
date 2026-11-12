import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as seo from '../scripts/seo.mjs';
import { GUIAS, REGIAO_TEXTO, regiaoPrep } from '../js/conteudo.js';
import { PLANS } from '../js/config.js';

const raiz = new URL('..', import.meta.url).pathname;

const cat = { id: 'c1', slug: 'moda-feminina', name: 'Moda feminina', description: 'Vestuário feminino.' };
const bras = { slug: 'bras', name: 'Brás', description: 'Polo de atacado.' };
const ceara = { slug: 'fortaleza-ce', name: 'Ceará', description: '' };
const regionName = (slug) => (slug === 'bras' ? 'Brás' : '');
const supplier = {
  id: 's1', slug: 'vazevedo-modas', name: 'Vazevedo Modas', description: 'Roupas femininas para revenda.',
  category_id: 'c1', subcategory: '', supplier_type: 'atacadista', bairro: 'bras', city: 'São Paulo', state: 'SP',
  sale_wholesale: true, sale_retail: false, sale_resellers: false, ships_other_cities: true,
  min_order: '', hours: '', tags: [], logo_url: null, verified: false, featured: false, supplier_photos: [],
};
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => m[1]).join('\n');

test('ficha de fornecedor não é indexada (noindex) e o nome não vai para dados estruturados da listagem', () => {
  const html = seo.supplierPage({ supplier, category: cat, regionName, related: [] });
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
});

test('sitemap nunca inclui fichas de fornecedores', () => {
  const xml = seo.sitemapXml([{ path: '/' }, { path: '/categorias/moda-feminina' }, { path: '/regiao/bras' }]);
  assert.ok(!xml.includes('/fornecedor/'));
});

test('mapa público lista bairros e quantidades, sem nomes de fornecedores', () => {
  const html = seo.mapPage({ regions: [bras], suppliersByRegion: { bras: [supplier] } });
  assert.ok(!html.includes('Vazevedo'), 'nome do fornecedor não pode aparecer no mapa');
  assert.ok(!html.includes('/fornecedor/'), 'mapa não pode linkar fichas');
  assert.ok(html.includes('1 fornecedor aprovado.'));
});

test('dados estruturados da categoria e da região não têm nomes de fornecedores', () => {
  const c = jsonLd(seo.categoryPage({ category: cat, suppliers: [supplier], regionName }));
  const r = jsonLd(seo.regionPage({ region: bras, suppliers: [supplier], categoryName: () => 'Moda feminina' }));
  assert.ok(!c.includes('Vazevedo') && !c.includes('ItemList'));
  assert.ok(!r.includes('Vazevedo') && !r.includes('ItemList'));
});

test('região fora de SP fica noindex (o texto fala de São Paulo)', () => {
  const ce = { ...supplier, state: 'CE', bairro: 'fortaleza-ce' };
  const html = seo.regionPage({ region: ceara, suppliers: [ce], categoryName: () => 'Moda' });
  assert.ok(html.includes('noindex'));
  assert.equal(seo.isSpRegion([ce]), false);
  assert.equal(seo.isSpRegion([supplier]), true);
});

test('preposição certa no nome da região', () => {
  assert.equal(regiaoPrep('Brás'), 'no');
  assert.equal(regiaoPrep('Bom Retiro'), 'no');
  assert.equal(regiaoPrep('25 de Março'), 'na');
  assert.equal(regiaoPrep('Santa Ifigênia'), 'na');
  const html = seo.regionPage({ region: { slug: '25-de-marco', name: '25 de Março', description: '' }, suppliers: [supplier], categoryName: () => 'Moda' });
  assert.ok(html.includes('<h1>Fornecedores na 25 de Março, São Paulo</h1>'));
});

test('região com texto próprio mostra o texto na página', () => {
  const html = seo.regionPage({ region: bras, suppliers: [supplier], categoryName: () => 'Moda' });
  assert.ok(html.includes(REGIAO_TEXTO.bras.slice(0, 40)));
});

test('página de planos mostra os preços de PLANS e o botão de planos', () => {
  const html = seo.planosPage();
  const mensal = PLANS.find((p) => p.id === 'mensal');
  assert.ok(html.includes('R$' + ' ' + '29,90') || html.includes('29,90'), 'preço do plano mensal');
  assert.ok(html.includes(mensal.name));
  assert.ok(html.includes('data-action="unlock"'));
  assert.ok(html.includes('<link rel="canonical" href="https://www.fornecedoresdesp.com.br/planos">'));
});

test('planos não mostram planos antigos sem venda (offered: false)', () => {
  const html = seo.planosPage();
  const antigo = PLANS.find((p) => p.offered === false);
  if (antigo) assert.ok(!html.includes(antigo.name));
});

test('textos públicos não citam número inventado de fornecedores', () => {
  const todos = [seo.planosPage(), seo.guiasIndexPage(), ...GUIAS.map((g) => seo.guiaPage(g)), ...Object.values(REGIAO_TEXTO)].join(' ');
  assert.ok(!/5\.?000/.test(todos), 'não pode citar 5.000 fornecedores');
  assert.ok(!/\bmil fornecedores\b/i.test(todos));
});

test('cada guia tem título, descrição com até 160 caracteres, H1 e link para planos', () => {
  for (const g of GUIAS) {
    assert.ok(g.title.length <= 70, `título longo: ${g.title}`);
    assert.ok(g.description.length <= 160, `descrição longa: ${g.slug}`);
    const html = seo.guiaPage(g);
    assert.ok(html.includes(`<h1>${g.h1}</h1>`), `H1 do guia ${g.slug}`);
    assert.ok(html.includes('href="/planos"'), `link para planos em ${g.slug}`);
    assert.ok(html.includes('"@type":"Article"'), `Article em ${g.slug}`);
  }
});

test('índice de guias lista todos os guias', () => {
  const html = seo.guiasIndexPage();
  for (const g of GUIAS) assert.ok(html.includes(`/guias/${g.slug}`), g.slug);
});

test('redirecionamentos 301 das URLs de exemplo apontam para as regiões', () => {
  const cfg = JSON.parse(readFileSync(join(raiz, 'vercel.json'), 'utf8'));
  const map = Object.fromEntries(cfg.redirects.map((r) => [r.source, r]));
  assert.equal(map['/fornecedores/bras'].destination, '/regiao/bras');
  assert.equal(map['/fornecedores/bom-retiro'].destination, '/regiao/bom-retiro');
  assert.equal(map['/fornecedores/25-de-marco'].destination, '/regiao/25-de-marco');
  assert.equal(map['/fornecedores/pari'].destination, '/regiao/pari');
  for (const r of cfg.redirects) assert.equal(r.permanent, true);
});
