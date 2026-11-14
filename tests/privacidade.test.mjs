// Garante que as páginas públicas geradas (HTML estático para o Google) nunca carregam dados de fornecedores:
// nem contato (WhatsApp, e-mail), nem endereço, nem @ do Instagram, nem nome.
// O catálogo inteiro fica no banco, protegido por RLS, e só chega a assinantes pelo app.
// Fixture inventada: nenhum dado real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as seo from '../scripts/seo.mjs';

const PRIVATE = {
  name: 'Loja Teste Privada',
  instagram: 'loja_teste_privada',
  whatsapp: '5511987650001',
  whatsappUrl: 'https://wa.me/5511987650001',
  email: 'contato.teste@exemplo.invalido',
  address: 'Rua Exemplo Inventada',
  number: '4242',
  complement: 'Sala Teste',
  cep: '01000-999',
  responsible: 'Pessoa Teste',
};

const category = { id: 'c-1', slug: 'moda-feminina', name: 'Moda feminina', description: 'Teste' };
const region = { slug: 'bras', name: 'Brás', description: 'Teste' };

// Tudo o que o build publica como HTML estático (sem fornecedores, como manda o catálogo fechado).
function paginasPublicas() {
  return [
    seo.homePage({ categories: [category], regions: [region] }),
    seo.categoriesIndexPage({ categories: [category] }),
    seo.categoryPage({ category }),
    seo.regionPage({ region }),
    seo.catalogShellPage({ path: '/fornecedores', title: 'Fornecedores', h1: 'Fornecedores' }),
    seo.catalogShellPage({ path: '/mapa', title: 'Mapa', h1: 'Mapa de fornecedores por bairro' }),
    seo.planosPage(),
    seo.guiasIndexPage(),
    seo.notFoundPage(),
  ];
}

const FORBIDDEN = [
  PRIVATE.name, PRIVATE.instagram, PRIVATE.whatsapp, PRIVATE.email, PRIVATE.address, PRIVATE.number,
  PRIVATE.complement, PRIVATE.cep, PRIVATE.responsible, 'wa.me/5511987650001',
];

test('nenhuma página pública gerada contém contato, endereço, nome ou Instagram de fornecedor', () => {
  for (const html of paginasPublicas()) {
    for (const secret of FORBIDDEN) assert.ok(!html.includes(secret), `vazou: ${secret}`);
  }
});

test('nenhuma página pública gerada mostra @ visível (handle de Instagram)', () => {
  for (const html of paginasPublicas()) {
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    const visible = main.replace(/href="[^"]*"/g, '');
    assert.ok(!visible.includes('@'), 'há @ visível em uma página pública');
  }
});

test('fichas e cartões de fornecedor não existem no gerador público', () => {
  assert.equal(typeof seo.supplierPage, 'undefined');
  assert.equal(typeof seo.suppliersIndexPage, 'undefined');
  for (const html of paginasPublicas()) assert.ok(!html.includes('supplier-card'));
});
