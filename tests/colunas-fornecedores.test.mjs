// Garante que o app nunca lê colunas internas de suppliers (owner_id) nem usa select('*') nessa tabela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const apiSrc = readFileSync(new URL('js/api.js', root), 'utf8');
const listaMatch = apiSrc.match(/const SUPPLIER_COLUMNS = '([^']+)'/);
const colunasApp = listaMatch ? listaMatch[1].split(',').map((c) => c.trim()) : [];

// Colunas conhecidas de suppliers: definição inicial + ADD COLUMN das migrações.
function colunasDoBanco() {
  const dir = new URL('supabase/', root);
  const arquivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(new URL(f, dir), 'utf8'));
  const nomes = new Set();
  for (const sql of arquivos) {
    const bloco = sql.match(/create table if not exists public\.suppliers \(([\s\S]*?)\n\);/);
    if (bloco) {
      for (const linha of bloco[1].split('\n')) {
        const m = linha.match(/^\s+([a-z_]+)\s+/);
        if (m && !['primary', 'unique', 'check', 'constraint', 'foreign'].includes(m[1])) nomes.add(m[1]);
      }
    }
    for (const m of sql.matchAll(/alter table public\.suppliers add column if not exists ([a-z_]+)/g)) nomes.add(m[1]);
  }
  return nomes;
}

test('lista de colunas de suppliers existe no app', () => {
  assert.ok(colunasApp.length > 10, 'SUPPLIER_COLUMNS não encontrada em js/api.js');
});

test('lista do app não inclui owner_id (campo interno do dono)', () => {
  assert.ok(!colunasApp.includes('owner_id'));
});

test('lista do app só cita colunas que existem no schema e nas migrações', () => {
  const banco = colunasDoBanco();
  assert.ok(banco.has('name') && banco.has('owner_id'), 'não leu o schema de suppliers');
  for (const c of colunasApp) assert.ok(banco.has(c), `coluna inexistente no banco: ${c}`);
});

test('toda coluna pública do banco, exceto owner_id, está na lista do app', () => {
  const banco = colunasDoBanco();
  const faltando = [...banco].filter((c) => c !== 'owner_id' && !colunasApp.includes(c));
  assert.deepEqual(faltando, [], 'colunas novas precisam entrar em SUPPLIER_COLUMNS ou ser protegidas');
});

test('nenhuma consulta a suppliers usa select(*) nem embed com *', () => {
  assert.ok(!/from\('suppliers'\)\.select\('\*/.test(apiSrc));
  assert.ok(!/sb\.from\('suppliers'\)\.select\(\s*['"`]\*/.test(apiSrc));
  assert.ok(!/SUPPLIER_SELECT\s*=\s*[`'"]\*/.test(apiSrc));
});
