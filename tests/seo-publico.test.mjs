import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as seo from '../scripts/seo.mjs';
import { GUIAS, REGIAO_TEXTO, regiaoPrep } from '../js/conteudo.js';
import { PLANS } from '../js/config.js';
import { fileURLToPath } from 'node:url';
const raiz = fileURLToPath(new URL('..', import.meta.url));
const fixture = JSON.parse(readFileSync(join(raiz, 'tests/fixtures-seo.json'), 'utf8'));

const cat = { id: 'c1', slug: 'moda-feminina', name: 'Moda feminina', description: 'Vestuário feminino.' };
const bras = { slug: 'bras', name: 'Brás', description: 'Polo de atacado.' };

// Todas as páginas estáticas que o build gera (com dados de exemplo, nenhum fornecedor).
function todasAsPaginas() {
  return [
    seo.homePage({ categories: [cat], regions: [bras] }),
    seo.categoriesIndexPage({ categories: [cat] }),
    seo.categoryPage({ category: cat }),
    seo.regionPage({ region: bras }),
    seo.catalogShellPage({ path: '/fornecedores', title: 'Fornecedores', h1: 'Fornecedores' }),
    seo.catalogShellPage({ path: '/mapa', title: 'Mapa', h1: 'Mapa de fornecedores por bairro' }),
    seo.planosPage(),
    seo.guiasIndexPage(),
    ...GUIAS.map((g) => seo.guiaPage(g)),
    seo.notFoundPage(),
    seo.sitemapXml([{ path: '/' }, { path: '/planos' }]),
    seo.robotsTxt(),
  ];
}

test('nenhuma página gerada contém nome, slug ou contato de fornecedor do banco', () => {
  const saida = todasAsPaginas().join('\n').toLowerCase();
  for (const s of fixture.suppliers || []) {
    assert.ok(!saida.includes(String(s.name).toLowerCase()), `nome de fornecedor vazou: ${s.name}`);
    assert.ok(!saida.includes(`/fornecedor/${s.slug}`), `link para ficha vazou: ${s.slug}`);
  }
  assert.ok(!/supabase\.co\/storage|\/object\/public\//.test(saida), 'URL de Storage no HTML estático');
});

test('nenhuma página gerada tem cartão de fornecedor nem contagem por categoria ou bairro', () => {
  const saida = todasAsPaginas().join('\n');
  assert.ok(!saida.includes('supplier-card'));
  assert.ok(!/\d+\s+fornecedores? (aprovados?|encontrados?|cadastrados?)/.test(saida), 'contagem de fornecedores');
});

test('sitemap nunca inclui fichas de fornecedores nem páginas de catálogo', () => {
  const xml = seo.sitemapXml([{ path: '/' }, { path: '/site' }, { path: '/planos' }, { path: '/guias' }]);
  assert.ok(!xml.includes('/fornecedor/'));
  assert.ok(!xml.includes('/categorias/'));
  assert.ok(!xml.includes('/regiao/'));
});

test('páginas de catálogo ficam noindex, mas são rastreáveis (robots não bloqueia o noindex)', () => {
  const txt = seo.robotsTxt();
  assert.ok(!/Disallow: \/(fornecedor|categorias|regiao|mapa)/.test(txt), 'bloquear rastreio impede o Google de ver o noindex');
  assert.ok(seo.categoryPage({ category: cat }).includes('noindex'));
  assert.ok(seo.regionPage({ region: bras }).includes('noindex'));
  assert.ok(seo.catalogShellPage({ path: '/mapa', title: 'Mapa', h1: 'Mapa' }).includes('noindex'));
});

test('região: título com a preposição certa e texto próprio', () => {
  assert.equal(regiaoPrep('Brás'), 'no');
  assert.equal(regiaoPrep('Bom Retiro'), 'no');
  assert.equal(regiaoPrep('25 de Março'), 'na');
  assert.equal(regiaoPrep('Santa Ifigênia'), 'na');
  const html = seo.regionPage({ region: { slug: '25-de-marco', name: '25 de Março', description: '' } });
  assert.ok(html.includes('<h1>Fornecedores na 25 de Março, São Paulo</h1>'));
  const brasHtml = seo.regionPage({ region: bras });
  assert.ok(brasHtml.includes(REGIAO_TEXTO.bras.slice(0, 40)));
});

test('página de planos mostra os preços de PLANS e o botão de planos', () => {
  const html = seo.planosPage();
  const mensal = PLANS.find((p) => p.id === 'mensal');
  assert.ok(html.includes('29,90'), 'preço do plano mensal');
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

test('página de entrada: divulga "Mais de 600 fornecedores" e não cita 5.000', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../apresentacao/index.html', import.meta.url), 'utf8');
  assert.ok(!/5\.?000/.test(html), 'a página de entrada não pode citar 5.000 fornecedores');
  assert.equal((html.match(/Mais de 600 fornecedores/g) || []).length, 4, 'texto, meta description, Open Graph e dados estruturados');
});
