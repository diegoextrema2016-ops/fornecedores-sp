// Garante que as páginas públicas geradas (HTML estático para o Google) nunca carregam dados de contato.
// Os contatos (WhatsApp, e-mail, endereço completo) ficam só no banco, protegidos por RLS.
// Fixture inventada: nenhum dado real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as seo from '../scripts/seo.mjs';

const PRIVATE = {
  whatsapp: '5511987650001',
  whatsappUrl: 'https://wa.me/5511987650001',
  email: 'contato.teste@exemplo.invalido',
  address: 'Rua Exemplo Inventada',
  number: '4242',
  complement: 'Sala Teste',
  cep: '01000-999',
  responsible: 'Pessoa Teste',
};

const supplier = {
  id: 's-1', slug: 'loja-teste', name: 'Loja Teste', description: 'Descrição pública de teste.',
  category: 'moda-feminina', bairro: 'bras', city: 'São Paulo', state: 'SP', supplier_type: 'atacadista',
  sale_wholesale: true, sale_retail: false, sale_resellers: false, ships_other_cities: false,
  min_order: '', hours: '', tags: [], views: 0, approval_status: 'approved', verified: false, featured: false,
  instagram: 'loja_teste', site: '', logo: '', photos: [], ...PRIVATE,
};
const category = { id: 'c-1', slug: 'moda-feminina', name: 'Moda feminina', description: 'Teste' };
const region = { slug: 'bras', name: 'Brás', description: 'Teste' };
const regionName = (slug) => (slug === 'bras' ? 'Brás' : '');

const FORBIDDEN = [PRIVATE.whatsapp, PRIVATE.email, PRIVATE.address, PRIVATE.number, PRIVATE.complement, PRIVATE.cep, PRIVATE.responsible, 'wa.me/5511987650001'];

test('página de fornecedor pré-gerada não contém WhatsApp, e-mail nem endereço completo', () => {
  const html = seo.supplierPage({ supplier, category, regionName, related: [] });
  for (const secret of FORBIDDEN) assert.ok(!html.includes(secret), `vazou: ${secret}`);
});

test('página inicial pré-gerada não contém dados de contato de fornecedores', () => {
  const html = seo.homePage({ categories: [category], regions: [region], suppliers: [supplier], featured: [supplier] });
  for (const secret of FORBIDDEN) assert.ok(!html.includes(secret), `vazou: ${secret}`);
});

test('página de categoria e de bairro pré-geradas não contêm dados de contato', () => {
  const cat = seo.categoryPage({ category, suppliers: [supplier], regionName });
  const reg = seo.regionPage({ region, suppliers: [supplier], categoryName: () => 'Moda feminina' });
  for (const html of [cat, reg]) {
    for (const secret of FORBIDDEN) assert.ok(!html.includes(secret), `vazou: ${secret}`);
  }
});

// Listagens estáticas (o que aparece antes do site carregar) mostram o mesmo que o visitante vê:
// nem nome, nem @ do Instagram, nem logo. O nome só aparece na ficha do fornecedor.
