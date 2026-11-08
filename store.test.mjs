import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';

// Storage falso compatível com localStorage (apenas os métodos usados).
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

let store;
beforeEach(() => {
  store = createStore(fakeStorage());
  store.init();
});

test('init carrega fornecedores e categorias de demonstração', () => {
  assert.ok(store.suppliers.list().length >= 10);
  assert.equal(store.categories.list().length, 20);
  assert.ok(store.suppliers.list().every((s) => s.isDemo === true));
});

test('cadastro público entra como pendente e não aparece na listagem aprovada', () => {
  const before = store.suppliers.approved().length;
  const s = store.suppliers.save({ name: 'Loja Nova Teste', category: 'bolsas', bairro: 'bras' });
  assert.equal(s.status, 'pending');
  assert.equal(store.suppliers.approved().length, before);
  assert.equal(store.suppliers.list({ status: 'pending' }).length, 1);
});

test('usuário comum não consegue se aprovar sozinho', () => {
  const s = store.suppliers.save({ name: 'Tentativa', category: 'bolsas' });
  const updated = store.suppliers.save({ ...s, status: 'approved', verified: true });
  assert.equal(updated.status, 'pending');
  assert.equal(updated.verified, false);
});

test('admin aprova e marca como verificado', () => {
  const s = store.suppliers.save({ name: 'Aprovada', category: 'bolsas' });
  store.suppliers.setStatus(s.id, 'approved');
  store.suppliers.setFlag(s.id, 'verified', true);
  const got = store.suppliers.findBySlug(s.slug);
  assert.equal(got.status, 'approved');
  assert.equal(got.verified, true);
});

test('slugs duplicados ganham sufixo numérico', () => {
  const a = store.suppliers.save({ name: 'Mesma Loja', category: 'bolsas' });
  const b = store.suppliers.save({ name: 'Mesma Loja', category: 'bolsas' });
  assert.notEqual(a.slug, b.slug);
  assert.equal(b.slug, 'mesma-loja-2');
});

test('categoria em uso não pode ser excluída', () => {
  const r = store.categories.remove('tenis');
  assert.equal(r.ok, false);
  const free = store.categories.save({ name: 'Categoria Vazia' });
  assert.equal(store.categories.remove(free.slug).ok, true);
});

test('favoritos: alternar, listar e separar por conta', () => {
  const id = store.suppliers.list()[0].id;
  assert.equal(store.favorites.toggle(id, 'guest'), true);
  assert.ok(store.favorites.has(id, 'guest'));
  assert.equal(store.favorites.has(id, 'outra@x.com'), false);
  assert.equal(store.favorites.toggle(id, 'guest'), false);
  assert.deepEqual(store.favorites.list('guest'), []);
});

test('favoritos de visitante são mesclados na conta ao logar', () => {
  const [a, b] = store.suppliers.list();
  store.favorites.toggle(a.id, 'guest');
  store.favorites.toggle(b.id, 'eu@x.com');
  store.favorites.mergeGuestInto('eu@x.com');
  assert.deepEqual(new Set(store.favorites.list('eu@x.com')), new Set([a.id, b.id]));
  assert.deepEqual(store.favorites.list('guest'), []);
});

test('usuário: cadastro, e-mail duplicado bloqueado, tipo alterável', async () => {
  const r1 = store.users.register({ name: 'Ana', email: 'ANA@x.com', passwordHash: 'h' });
  assert.equal(r1.ok, true);
  assert.equal(r1.user.email, 'ana@x.com');
  assert.equal(store.users.register({ name: 'Outra', email: 'ana@x.com', passwordHash: 'h' }).ok, false);
  store.users.setType(r1.user.id, 'fornecedor');
  assert.equal(store.users.findByEmail('ana@x.com').type, 'fornecedor');
});

test('sessão guarda papel e favoritos usam o e-mail logado', () => {
  store.session.set({ email: 'ana@x.com', name: 'Ana' }, 'user');
  const id = store.suppliers.list()[1].id;
  store.favorites.toggle(id);
  assert.ok(store.favorites.has(id, 'ana@x.com'));
  store.session.clear();
  assert.equal(store.session.get(), null);
});

test('assinatura: ativa por prazo, expira e soma dias ao renovar', () => {
  const email = 'cliente@x.com';
  assert.equal(store.subscriptions.isActive(email), false);
  const first = store.subscriptions.activate(email, 'mensal', 30);
  assert.equal(store.subscriptions.isActive(email), true);
  const second = store.subscriptions.activate(email, 'mensal', 30);
  assert.ok(new Date(second.expiresAt) > new Date(first.expiresAt), 'renovação soma ao prazo restante');
  // Assinatura vencida não conta
  store.subscriptions.activate('velho@x.com', 'mensal', -1);
  assert.equal(store.subscriptions.isActive('velho@x.com'), false);
});

test('assinatura é independente do caso do e-mail', () => {
  store.subscriptions.activate('Ana@X.com', 'mensal', 10);
  assert.equal(store.subscriptions.isActive('ana@x.com'), true);
});
