// Garante as regras de rota e de rebuild que evitam soft 404 e páginas válidas sem publicação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const admin = await readFile(new URL('../js/pages-admin.js', import.meta.url), 'utf8');
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const pub = await readFile(new URL('../js/pages-public.js', import.meta.url), 'utf8');

test('vercel.json não tem reescritas genéricas de fornecedor, categoria ou região', () => {
  assert.equal(vercel.rewrites, undefined);
  const texto = JSON.stringify(vercel.routes);
  assert.ok(!/fornecedor\/\(|categorias\/\(|regiao\/\(|\/:slug/.test(texto));
  assert.ok(texto.includes('"/admin/(.*)"'));
});

test('404 de rota inexistente sai com status 404 e no-store', () => {
  const r = vercel.routes;
  const i404 = r.findIndex((x) => x.status === 404 && x.src === '/(.*)');
  assert.ok(i404 > -1, 'falta a rota de 404');
  assert.equal(r[i404].headers['Cache-Control'], 'no-store');
  assert.ok(r.some((x) => x.handle === 'error'));
  assert.ok(r.some((x) => x.status === 404 && x.dest === '/404.html'));
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
