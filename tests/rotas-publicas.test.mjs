// Garante as regras de rota e de rebuild que evitam soft 404 e páginas válidas sem publicação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const admin = await readFile(new URL('../js/pages-admin.js', import.meta.url), 'utf8');
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const pub = await readFile(new URL('../js/pages-public.js', import.meta.url), 'utf8');

test('vercel.json só mantém a reescrita do painel admin', () => {
  assert.deepEqual(vercel.rewrites, [{ source: '/admin/:path*', destination: '/admin/index.html' }]);
});

test('o build gera a casca de /categorias/mais-acessados', () => {
  assert.match(build, /categorias\/mais-acessados\/index\.html/);
});

test('páginas não encontradas saem com noindex', () => {
  const bloco = pub.slice(pub.indexOf('export function notFound'), pub.indexOf('export { skeletonCards'));
  assert.match(bloco, /noindex: true/);
});

test('toda ação administrativa que grava dados públicos pede o rebuild', () => {
  // Cada gravação de categoria, região, status, flag, categoria, importação e subcategoria deve publicar.
  const pontos = [
    'atualizada.`, { publica: true })', // setCategory
    "'Destaque atualizado.'", // setFlag
    'if (movidos) publicarPaginas()', // troca de categoria em lote
    'if (res) publicarPaginas()', // importação
    'Qualquer troca de situação', // status
    "'Ordem das categorias atualizada.', { publica: true }",
    "msg, { publica: true }", // subcategorias
    "'Categoria salva.', { publica: true }",
    "'Situação atualizada.', { publica: true }",
    "if (done) { rerender(); publicarPaginas(); }",
    "'Salvo.', { publica: true }",
  ];
  for (const p of pontos) assert.ok(admin.includes(p), `falta rebuild em: ${p}`);
});

test('instant só publica depois da gravação com sucesso', () => {
  assert.match(admin, /gravacao\.then\(\s*\(\) => \{[^}]*if \(publica\) publicarPaginas\(\)/);
});
