// Detecção de alterações, debounce e configuração do workflow de publicação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decidir } from '../scripts/decisao.mjs';
import { fingerprint } from '../scripts/dados.mjs';

const wf = await readFile(new URL('../.github/workflows/publicar-quando-mudar.yml', import.meta.url), 'utf8');
const base = {
  categories: [{ id: 'c1', slug: 'moda', name: 'Moda', status: 'active', sort_order: 1 }],
  regions: [{ slug: 'bras', name: 'Brás', sort_order: 1 }],
  suppliers: [{ id: 's1', slug: 'loja', name: 'Loja', description: 'Roupas', supplier_photos: [{ url: 'a.jpg', position: 0 }] }],
};

test('primeira verificação publica para alinhar o site', () => {
  assert.equal(decidir(null, 'h1').publicar, true);
});

test('sem mudança não publica', () => {
  const r = decidir({ publicado: 'h1', pendente: null }, 'h1');
  assert.equal(r.publicar, false);
});

test('mudança isolada espera a segunda leitura (debounce)', () => {
  const r = decidir({ publicado: 'h1', pendente: null }, 'h2');
  assert.equal(r.publicar, false);
  assert.equal(r.estado.pendente, 'h2');
});

test('mudança confirmada em duas leituras seguidas publica uma vez', () => {
  const r = decidir({ publicado: 'h1', pendente: 'h2' }, 'h2');
  assert.equal(r.publicar, true);
  assert.equal(r.estado.publicado, 'h2');
  assert.equal(decidir(r.estado, 'h2').publicar, false);
});

test('impressão digital muda quando um dado público muda e é estável para a mesma base', () => {
  const a = fingerprint(base);
  assert.equal(a, fingerprint(JSON.parse(JSON.stringify(base))));
  const alterada = JSON.parse(JSON.stringify(base));
  alterada.suppliers[0].description = 'Outra descrição';
  assert.notEqual(a, fingerprint(alterada));
  const foto = JSON.parse(JSON.stringify(base));
  foto.suppliers[0].supplier_photos[0].url = 'b.jpg';
  assert.notEqual(a, fingerprint(foto));
});

test('impressão digital não depende da ordem das linhas', () => {
  const dois = { ...base, suppliers: [...base.suppliers, { id: 's0', slug: 'antes', name: 'Antes', supplier_photos: [] }] };
  const invertida = { ...dois, suppliers: [...dois.suppliers].reverse() };
  assert.equal(fingerprint(dois), fingerprint(invertida));
});

test('workflow roda só por agendamento ou manualmente, sem permissão de escrita', () => {
  assert.match(wf, /schedule:/);
  assert.match(wf, /workflow_dispatch:/);
  assert.doesNotMatch(wf, /pull_request/);
  assert.match(wf, /permissions:\n  contents: read/);
  assert.match(wf, /group: publicacao-site/);
  assert.match(wf, /cancel-in-progress: false/);
});

test('segredo do deploy hook entra só por variável de ambiente e não é impresso', () => {
  assert.match(wf, /DEPLOY_HOOK: \$\{\{ secrets\.VERCEL_DEPLOY_HOOK \}\}/);
  assert.doesNotMatch(wf, /echo[^\n]*\$\{\{ secrets/);
  assert.doesNotMatch(wf, /echo[^\n]*\$DEPLOY_HOOK/);
  assert.doesNotMatch(wf, /SUPABASE[^\n]*service/i);
});

test('todas as ações do workflow estão fixadas por SHA de commit, não por tag', () => {
  const usos = [...wf.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.ok(usos.length >= 4, 'workflow sem ações');
  for (const u of usos) assert.match(u, /@[0-9a-f]{40}$/, `ação sem SHA: ${u}`);
});
