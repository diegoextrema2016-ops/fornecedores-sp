import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  supplierFromRow, supplierToRow, contactToRow, categoryFromRow, categoryToRow,
  regionFromRow, regionToRow, uniqueSlug, authErrorMessage, subscriptionFromRow,
} from '../js/mapping.js';

const ID_CAT = 'c-1';
const slugs = new Map([[ID_CAT, 'bolsas']]);

const row = {
  id: 's-1',
  owner_id: 'u-1',
  name: 'Loja Teste',
  slug: 'loja-teste',
  description: 'Descrição fictícia.',
  category_id: ID_CAT,
  subcategory: 'Mochilas',
  supplier_type: 'atacadista',
  bairro: 'bras',
  city: 'São Paulo',
  state: 'SP',
  sale_wholesale: true,
  sale_retail: false,
  sale_resellers: true,
  ships_other_cities: false,
  min_order: '12',
  hours: 'Seg a sáb',
  tags: ['bolsa'],
  logo_url: 'https://cdn.exemplo/logo.webp',
  approval_status: 'approved',
  verified: true,
  featured: false,
  is_demo: false,
  views: 7,
  created_at: '2026-10-01T10:00:00Z',
  supplier_photos: [
    { url: 'https://cdn.exemplo/b.webp', position: 1 },
    { url: 'https://cdn.exemplo/a.webp', position: 0 },
  ],
};

test('fornecedor sem contatos legíveis não expõe nenhum contato', () => {
  const s = supplierFromRow({ ...row, supplier_contacts: [] }, slugs);
  assert.equal(s.contactsVisible, false);
  assert.equal(s.whatsapp, undefined);
  assert.equal(s.email, undefined);
});

test('fornecedor com contato legível traz os campos de contato', () => {
  const s = supplierFromRow({
    ...row,
    supplier_contacts: [{ responsible: 'Ana', email: 'ana@exemplo.com', whatsapp: '5511999990001', whatsapp_url: null, instagram: 'lojateste', site: null, address: 'Rua Exemplo', number: '10', complement: '', cep: '01000000' }],
  }, slugs);
  assert.equal(s.contactsVisible, true);
  assert.equal(s.whatsapp, '5511999990001');
  assert.equal(s.address, 'Rua Exemplo');
  assert.equal(s.cep, '01000000');
});

test('converte colunas snake_case para o formato das páginas', () => {
  const s = supplierFromRow({ ...row, supplier_contacts: [] }, slugs);
  assert.equal(s.category, 'bolsas');
  assert.equal(s.status, 'approved');
  assert.equal(s.saleWholesale, true);
  assert.equal(s.saleResellers, true);
  assert.equal(s.minOrder, '12');
  assert.equal(s.logo, 'https://cdn.exemplo/logo.webp');
  assert.equal(s.isDemo, false);
});

test('fotos saem na ordem de posição', () => {
  const s = supplierFromRow({ ...row, supplier_contacts: [] }, slugs);
  assert.deepEqual(s.photos, ['https://cdn.exemplo/a.webp', 'https://cdn.exemplo/b.webp']);
});

test('categoria desconhecida vira vazia, sem quebrar', () => {
  const s = supplierFromRow({ ...row, category_id: 'outra', supplier_contacts: [] }, slugs);
  assert.equal(s.category, '');
});

test('usuário comum não envia campos de controle ao salvar', () => {
  const out = supplierToRow({ name: 'X', slug: 'x', status: 'approved', verified: true, category: 'bolsas' }, { categoryId: ID_CAT, asAdmin: false });
  assert.equal('approval_status' in out, false);
  assert.equal('verified' in out, false);
  assert.equal(out.category_id, ID_CAT);
});

test('administrador envia status, selo e demonstração', () => {
  const out = supplierToRow({ name: 'X', slug: 'x', status: 'rejected', verified: true, featured: true, isDemo: false }, { asAdmin: true });
  assert.equal(out.approval_status, 'rejected');
  assert.equal(out.verified, true);
  assert.equal(out.featured, true);
  assert.equal(out.is_demo, false);
});

test('estado vira duas letras maiúsculas e tipo vazio vira null', () => {
  const out = supplierToRow({ name: 'X', slug: 'x', state: 'sp', supplierType: '' });
  assert.equal(out.state, 'SP');
  assert.equal(out.supplier_type, null);
});

test('contato guarda só dígitos de WhatsApp e CEP, e instagram sem @', () => {
  const c = contactToRow({ whatsapp: '(11) 99999-0001', cep: '01001-000', instagram: '@loja.teste', responsible: 'Ana' }, 's-1');
  assert.equal(c.whatsapp, '11999990001');
  assert.equal(c.cep, '01001000');
  assert.equal(c.instagram, 'loja.teste');
  assert.equal(c.supplier_id, 's-1');
});

test('contato sem WhatsApp grava null, não string vazia', () => {
  assert.equal(contactToRow({}, 's-1').whatsapp, null);
  assert.equal(contactToRow({}, 's-1').instagram, null);
});

test('slug repetido ganha sufixo numérico', () => {
  const list = [{ id: 'a', slug: 'loja' }, { id: 'b', slug: 'loja-2' }];
  assert.equal(uniqueSlug(list, 'loja', 'novo'), 'loja-3');
  assert.equal(uniqueSlug(list, 'outra', 'novo'), 'outra');
  assert.equal(uniqueSlug(list, 'loja', 'a'), 'loja');
});

test('categoria e bairro fazem ida e volta sem perder campos', () => {
  const cat = categoryFromRow({ id: 'c', slug: 'tenis', name: 'Tênis', description: 'x', icon: '👟', status: 'active', sort_order: 3 }, [{ name: 'Esportivo' }]);
  assert.deepEqual(cat.subcategories, ['Esportivo']);
  const back = categoryToRow(cat);
  assert.equal(back.sort_order, 3);
  assert.equal(back.status, 'active');
  const reg = regionFromRow({ slug: 'bras', name: 'Brás', description: '', sort_order: 2 });
  assert.equal(regionToRow(reg).sort_order, 2);
});

test('mensagens de erro do login ficam em português', () => {
  assert.equal(authErrorMessage({ message: 'Invalid login credentials' }), 'E-mail ou senha incorretos.');
  assert.match(authErrorMessage({ message: 'Email not confirmed' }), /Confirme seu e-mail/);
  // Não confirma se o e-mail já tem conta (evita descobrir quem é cliente).
  assert.match(authErrorMessage({ message: 'User already registered' }), /recupere a senha/);
  assert.doesNotMatch(authErrorMessage({ message: 'User already registered' }), /Já existe uma conta/);
  assert.match(authErrorMessage({ message: 'coisa estranha' }), /Não foi possível/);
});

test('assinatura converte prazo e status', () => {
  const sub = subscriptionFromRow({ id: 'x', plan: 'anual', amount: '29.90', status: 'active', starts_at: '2026-10-01', expires_at: '2027-10-01', payment_note: '', created_at: '2026-10-01' });
  assert.equal(sub.amount, 29.9);
  assert.equal(sub.planId, 'anual');
  assert.equal(sub.expiresAt, '2027-10-01');
});
