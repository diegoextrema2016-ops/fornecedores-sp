import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLocalBackup, parseBackup, importBackup, BACKUP_VERSION } from '../js/backup.js';

// Storage falso compatível com localStorage (só os métodos usados).
function fakeStorage(entries = {}) {
  const m = new Map(Object.entries(entries).map(([k, v]) => [k, JSON.stringify(v)]));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// Store falso com a mesma forma assíncrona da camada real.
function fakeStore({ failSupplier = null } = {}) {
  const cats = [];
  const regs = [];
  const sups = [];
  return {
    cats, regs, sups,
    categories: {
      list: () => cats.slice(),
      save: async (d) => {
        const row = { status: 'active', ...d };
        const i = cats.findIndex((c) => c.slug === d.slug);
        if (i >= 0) cats[i] = row; else cats.push(row);
        return row;
      },
    },
    regions: {
      save: async (d) => {
        regs.push(d);
        return d;
      },
    },
    suppliers: {
      list: () => sups.slice(),
      save: async (d) => {
        if (failSupplier && d.name === failSupplier) throw new Error('nome inválido');
        if ('id' in d && d.id !== undefined) throw new Error('id antigo não deveria chegar aqui');
        const row = { id: `new-${sups.length}`, ...d };
        sups.push(row);
        return row;
      },
    },
  };
}

test('sem fornecedores guardados neste navegador, não há backup', () => {
  assert.equal(readLocalBackup(fakeStorage({})), null);
  assert.equal(readLocalBackup(fakeStorage({ 'spf:v1:suppliers': [] })), null);
});

test('backup ignora fornecedores de demonstração e não inclui contas', () => {
  const storage = fakeStorage({
    'spf:v1:suppliers': [{ id: 'a', name: 'Real', isDemo: false }, { id: 'b', name: 'Demo', isDemo: true }],
    'spf:v1:categories': [{ slug: 'tenis', name: 'Tênis' }],
    'spf:v1:regions': [{ slug: 'bras', name: 'Brás' }],
    'spf:v1:users': [{ email: 'x@x.com', passwordHash: 'segredo' }],
    'spf:v1:favorites': { guest: ['a'] },
  });
  const backup = readLocalBackup(storage);
  assert.equal(backup.version, BACKUP_VERSION);
  assert.equal(backup.suppliers.length, 1);
  assert.equal(backup.suppliers[0].name, 'Real');
  assert.equal('users' in backup, false);
  assert.equal('favorites' in backup, false);
  assert.equal(JSON.stringify(backup).includes('segredo'), false);
});

test('arquivo inválido é recusado com motivo claro', () => {
  assert.equal(parseBackup('não é json').ok, false);
  assert.match(parseBackup('{"version":2,"suppliers":[]}').reason, /não é um backup/);
  assert.equal(parseBackup('{"version":1}').ok, false);
});

test('arquivo válido é aceito e linhas sem nome são descartadas', () => {
  const res = parseBackup(JSON.stringify({ version: 1, suppliers: [{ name: 'Ok' }, { foo: 1 }], categories: [{ slug: 'a' }, {}] }));
  assert.equal(res.ok, true);
  assert.equal(res.data.suppliers.length, 1);
  assert.equal(res.data.categories.length, 1);
});

test('importação cria categoria ausente, remove o id antigo e grava tudo', async () => {
  const store = fakeStore();
  const backup = {
    categories: [{ slug: 'tenis', name: 'Tênis' }],
    regions: [{ slug: 'bras', name: 'Brás' }],
    suppliers: [
      { id: 'sup-antigo', name: 'Loja A', category: 'tenis', status: 'approved' },
      { id: 'sup-2', name: 'Loja B', category: 'bolsas', status: 'pending' },
    ],
  };
  const res = await importBackup(store, backup);
  assert.equal(res.suppliers, 2);
  assert.equal(res.regions, 1);
  assert.deepEqual(res.errors, []);
  assert.ok(store.cats.some((c) => c.slug === 'bolsas'), 'categoria do fornecedor foi criada');
  assert.equal(store.sups.every((s) => !s.id || s.id.startsWith('new-')), true);
});

test('uma falha não interrompe a importação e aparece na lista de erros', async () => {
  const store = fakeStore({ failSupplier: 'Quebrada' });
  const res = await importBackup(store, {
    categories: [],
    regions: [],
    suppliers: [{ name: 'Quebrada', category: '' }, { name: 'Boa', category: '' }],
  });
  assert.equal(res.suppliers, 1);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /Quebrada/);
});

test('restaurar de novo não duplica fornecedores que já estão no banco (mesmo slug)', async () => {
  const store = fakeStore();
  const backup = {
    categories: [],
    regions: [],
    suppliers: [
      { name: 'Loja A', slug: 'loja-a', category: '' },
      { name: 'Loja B', slug: 'loja-b', category: '' },
    ],
  };
  const primeira = await importBackup(store, backup);
  assert.equal(primeira.suppliers, 2);
  assert.equal(primeira.skipped, 0);

  // Simula o banco devolvendo os fornecedores já gravados, com o slug que o site gerou.
  store.suppliers.list = () => store.sups.slice();
  const segunda = await importBackup(store, backup);
  assert.equal(segunda.suppliers, 0);
  assert.equal(segunda.skipped, 2);
  assert.equal(store.sups.length, 2, 'nenhuma cópia foi criada');
});

test('fornecedor sem slug no arquivo ainda é gravado (não há como comparar)', async () => {
  const store = fakeStore();
  const res = await importBackup(store, { categories: [], regions: [], suppliers: [{ name: 'Sem slug', category: '' }] });
  assert.equal(res.suppliers, 1);
  assert.equal(res.skipped, 0);
});
