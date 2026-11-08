import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, planImport, applyImport, normalizeInstagram, splitLinks } from '../js/import.js';
import { slugify } from '../js/utils.js';

// Fixture de teste inventado (não é dado real).
const CSV = [
  'n;instagram;segmento;whatsapp;link_whatsapp;links_bio_e_sites',
  '1;@Loja_Teste_A;Roupas;5511999990001;;',
  '2;@loja_teste_b;Tênis;;https://wa.me/5511999990002;https://linktr.ee/teste | https://exemplo.com.br',
  '3;@Loja_Teste_A;Roupas;5511999990003;;',
  '4;@sem_segmento;;;;',
  '5;"@aspas";"Acessórios; especiais";11999990004;;',
].join('\n');

test('lê CSV com ponto e vírgula, aspas e cabeçalho normalizado', () => {
  const rows = parseCsv(CSV);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].instagram, '@Loja_Teste_A');
  assert.equal(rows[4].segmento, 'Acessórios; especiais');
});

test('detecta separador vírgula', () => {
  const rows = parseCsv('instagram,segmento\n@x,Roupas');
  assert.equal(rows[0].segmento, 'Roupas');
});

test('normaliza Instagram preservando maiúsculas', () => {
  assert.equal(normalizeInstagram('@Loja_Teste_A'), 'Loja_Teste_A');
  assert.equal(normalizeInstagram('https://www.instagram.com/loja.x/'), 'loja.x');
});

test('separa links de bio e mantém só URLs', () => {
  assert.deepEqual(splitLinks('https://linktr.ee/teste | https://exemplo.com.br'), ['https://linktr.ee/teste', 'https://exemplo.com.br']);
  assert.deepEqual(splitLinks(''), []);
});

test('planejamento não duplica o mesmo Instagram (sem diferenciar caixa) e conta categorias', () => {
  const { records, counts } = planImport(parseCsv(CSV));
  assert.equal(records.length, 4);
  assert.equal(counts.duplicadas, 1);
  assert.equal(counts.semContato, 0);
  assert.equal(records.find((r) => r.instagram === 'loja_teste_b').whatsappUrl, 'https://wa.me/5511999990002');
  assert.equal(records.find((r) => r.instagram === 'loja_teste_b').site, 'https://linktr.ee/teste');
  assert.equal(records.find((r) => r.instagram === 'sem_segmento').category, 'outros');
  assert.equal(records.find((r) => r.instagram === 'Loja_Teste_A').category, 'roupas');
  assert.equal(records.find((r) => r.instagram === 'loja_teste_b').category, 'tenis');
});

// Store falso com a mesma forma assíncrona da camada real (store.js).
function fakeStore() {
  const cats = [];
  const sups = [];
  return {
    categories: {
      list: () => cats.slice(),
      get: (slug) => cats.find((c) => c.slug === slug) || null,
      save: async (d) => {
        const row = { status: 'active', ...d, slug: d.slug || slugify(d.name) };
        cats.push(row);
        return row;
      },
    },
    suppliers: {
      list: () => sups.slice(),
      approved: () => sups.filter((s) => s.status === 'approved'),
      save: async (d) => {
        const row = { id: `s${sups.length}`, status: 'pending', ...d };
        sups.push(row);
        return row;
      },
    },
  };
}

test('reimportar não duplica contas já cadastradas', async () => {
  const store = fakeStore();
  const first = planImport(parseCsv(CSV), store.suppliers.list());
  await applyImport(store, first.records);
  const second = planImport(parseCsv(CSV), store.suppliers.list());
  assert.equal(second.records.length, 0);
});

test('importação grava fornecedores aprovados e cria categorias pelo segmento', async () => {
  const store = fakeStore();
  const { records } = planImport(parseCsv(CSV));
  const res = await applyImport(store, records);
  assert.equal(res.imported, 4);
  assert.equal(store.suppliers.approved().length, 4);
  assert.equal(store.categories.get('roupas').name, 'Roupas');
  assert.equal(store.categories.get('tenis').name, 'Tênis');
  assert.equal(store.suppliers.list().some((s) => 'categoryName' in s), false);
});
