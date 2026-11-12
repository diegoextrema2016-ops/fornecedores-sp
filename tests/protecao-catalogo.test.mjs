// Catálogo exclusivo: páginas para visitantes não mostram nada do catálogo e ficam fora do Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as seo from '../scripts/seo.mjs';

const dados = JSON.parse(await readFile(new URL('./fixtures-seo.json', import.meta.url), 'utf8'));
const categoria = dados.categories[0];
const regiao = dados.regions[0];
const fornecedor = dados.suppliers[0];
const regiaoNome = () => regiao.name;
const categoriaNome = () => categoria.name;

// Textos do catálogo que não podem aparecer para visitantes.
const sensiveis = [
  fornecedor.name, fornecedor.description, categoria.name, regiao.name,
  ...dados.suppliers.map((s) => s.name), ...dados.categories.map((c) => c.name), ...dados.regions.map((r) => r.name),
].filter((t) => t && t.length > 3);

function paginas() {
  return {
    home: seo.homePage(),
    categoriasIndex: seo.categoriesIndexPage(),
    categoria: seo.categoryPage({ category: categoria, suppliers: dados.suppliers, regionName: regiaoNome }),
    regiao: seo.regionPage({ region: regiao, suppliers: dados.suppliers, categoryName: categoriaNome }),
    fornecedores: seo.suppliersIndexPage({ suppliers: dados.suppliers, regionName: regiaoNome, categoryName: categoriaNome }),
    ficha: seo.supplierPage({ supplier: fornecedor, category: categoria, regionName: regiaoNome, related: dados.suppliers }),
    mapa: seo.mapPage({ regions: dados.regions, suppliers: dados.suppliers }),
  };
}

test('nenhuma página do catálogo sai indexável', () => {
  for (const [nome, html] of Object.entries(paginas())) {
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/, `${nome} está indexável`);
  }
});

test('nenhuma página do catálogo mostra nome, descrição, categoria ou bairro de fornecedor', () => {
  for (const [nome, html] of Object.entries(paginas())) {
    for (const termo of sensiveis) {
      assert.ok(!html.includes(termo), `${nome} expõe "${termo}"`);
    }
  }
});

test('nenhuma página do catálogo mostra contagem de fornecedores', () => {
  for (const [nome, html] of Object.entries(paginas())) {
    assert.doesNotMatch(html, /\b\d+\s+fornecedor(es)?\b/i, `${nome} mostra contagem`);
  }
});

test('nenhuma página do catálogo mostra foto, logo nem link para ficha', () => {
  for (const [nome, html] of Object.entries(paginas())) {
    assert.ok(!/<img /.test(html), `${nome} mostra imagem`);
    assert.ok(!/href="\/fornecedor\//.test(html), `${nome} linka ficha`);
  }
});

test('a página de planos continua indexável e sem dados do catálogo', () => {
  const html = seo.planosPage();
  assert.match(html, /<meta name="robots" content="index, follow">/);
  for (const termo of sensiveis) assert.ok(!html.includes(termo), `planos expõe "${termo}"`);
});
