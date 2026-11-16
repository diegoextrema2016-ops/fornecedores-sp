// Testes da ficha de fornecedor com status HTTP correto (api/fornecedor/[slug].js) e do favicon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import handler from '../api/fornecedor/[slug].js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const vercel = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'));

function resposta() {
  const r = { status: 200, headers: {}, corpo: '' };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.codigo = c; return r; };
  r.send = (c) => { r.corpo = c; return r; };
  r.end = () => r;
  return r;
}

// Simula o Supabase (RPC fornecedor_existe) e a casca do site (/404.html, /fornecedores/index.html).
function simulaRede({ existe = true, rpcStatus = 200, rpcErro = false, casca = true } = {}) {
  const chamadas = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    chamadas.push({ url: String(url), opts });
    if (String(url).includes('/rest/v1/rpc/fornecedor_existe')) {
      if (rpcErro) throw new Error('rede fora');
      return new Response(JSON.stringify(existe), { status: rpcStatus, headers: { 'content-type': 'application/json' } });
    }
    if (String(url).endsWith('/404.html')) return new Response('<html>nao encontrada</html>', { status: 200 });
    if (String(url).endsWith('/fornecedores/index.html')) {
      return casca ? new Response('<html>casca</html>', { status: 200 }) : new Response('x', { status: 500 });
    }
    throw new Error('url inesperada ' + url);
  };
  return { chamadas, restaura: () => { globalThis.fetch = original; } };
}

const req = (slug, metodo = 'GET') => ({ method: metodo, query: { slug }, headers: { host: 'www.fornecedoresdesp.com.br' } });

test('vercel.json envia /fornecedor/:slug para a função, não mais para a casca fixa', () => {
  const regra = vercel.rewrites.find((r) => r.source === '/fornecedor/:slug');
  assert.equal(regra.destination, '/api/fornecedor/:slug');
});

test('favicon.ico aponta para o ícone SVG existente', () => {
  const regra = vercel.rewrites.find((r) => r.source === '/favicon.ico');
  assert.equal(regra.destination, '/img/favicon.svg');
  assert.doesNotThrow(() => readFileSync(join(RAIZ, 'img', 'favicon.svg')));
});

test('slug que existe responde 200 com a casca do site', async () => {
  const rede = simulaRede({ existe: true });
  try {
    const r = resposta();
    await handler(req('loja-exemplo'), r);
    assert.equal(r.codigo, 200);
    assert.equal(r.corpo, '<html>casca</html>');
    assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow');
  } finally { rede.restaura(); }
});

test('slug que não existe responde 404 com a página de não encontrada', async () => {
  const rede = simulaRede({ existe: false });
  try {
    const r = resposta();
    await handler(req('nao-existe'), r);
    assert.equal(r.codigo, 404);
    assert.equal(r.corpo, '<html>nao encontrada</html>');
  } finally { rede.restaura(); }
});

test('slug com caracteres inválidos vira 404 sem consultar o banco', async () => {
  const rede = simulaRede({ existe: true });
  try {
    const r = resposta();
    await handler(req('../etc/passwd'), r);
    assert.equal(r.codigo, 404);
    assert.equal(rede.chamadas.some((c) => c.url.includes('rpc')), false);
  } finally { rede.restaura(); }
});

test('falha ao consultar o banco mantém 200 (falha aberta)', async () => {
  const rede = simulaRede({ rpcErro: true });
  try {
    const r = resposta();
    await handler(req('loja-exemplo'), r);
    assert.equal(r.codigo, 200);
  } finally { rede.restaura(); }
});

test('resposta de erro do banco mantém 200 (falha aberta)', async () => {
  const rede = simulaRede({ rpcStatus: 500 });
  try {
    const r = resposta();
    await handler(req('loja-exemplo'), r);
    assert.equal(r.codigo, 200);
  } finally { rede.restaura(); }
});

test('falha ao ler a casca responde 503 controlado, não exceção', async () => {
  const rede = simulaRede({ existe: true, casca: false });
  try {
    const r = resposta();
    await handler(req('loja-exemplo'), r);
    assert.equal(r.codigo, 503);
  } finally { rede.restaura(); }
});

test('método POST é recusado com 405', async () => {
  const r = resposta();
  await handler(req('loja-exemplo', 'POST'), r);
  assert.equal(r.codigo, 405);
});

test('a função não devolve dado de fornecedor, só sim/não do banco', async () => {
  const rede = simulaRede({ existe: true });
  try {
    const r = resposta();
    await handler(req('loja-exemplo'), r);
    const rpc = rede.chamadas.find((c) => c.url.includes('rpc'));
    assert.deepEqual(JSON.parse(rpc.opts.body), { p_slug: 'loja-exemplo' });
    assert.ok(!r.corpo.includes('loja-exemplo'));
  } finally { rede.restaura(); }
});

test('migração 021: meus_cadastros só devolve o cadastro de quem está logado, sem owner_id', () => {
  const sql = readFileSync(join(RAIZ, 'supabase', 'migration-021-meus-cadastros.sql'), 'utf8');
  assert.match(sql, /where s\.owner_id = auth\.uid\(\)/);
  assert.match(sql, /returns table \(name text, approval_status text\)/);
  assert.match(sql, /grant execute on function public\.meus_cadastros\(\) to authenticated;/);
  assert.match(sql, /revoke all on function public\.meus_cadastros\(\) from public, anon;/);
  assert.doesNotMatch(sql, /owner_id\s*,/);
});
