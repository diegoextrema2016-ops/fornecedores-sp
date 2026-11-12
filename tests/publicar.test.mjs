import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/publicar.js';

// Resposta falsa do Vercel: guarda o status e o corpo enviados.
function resposta() {
  return {
    statusCode: 0,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test('publicar: se o Supabase estiver fora do ar, responde 502 controlado (não quebra)', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  try {
    const res = resposta();
    await handler({ method: 'POST', headers: { authorization: 'Bearer token-qualquer' } }, res);
    assert.equal(res.statusCode, 502);
    assert.ok(res.body?.error, 'deve devolver mensagem de erro');
    assert.ok(!/fetch failed/.test(JSON.stringify(res.body)), 'não pode vazar o detalhe técnico');
  } finally {
    globalThis.fetch = original;
  }
});

test('publicar: sem login responde 403 sem consultar nada', async () => {
  const original = globalThis.fetch;
  let chamadas = 0;
  globalThis.fetch = async () => { chamadas += 1; return new Response('{}', { status: 200 }); };
  try {
    const res = resposta();
    await handler({ method: 'POST', headers: {} }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(chamadas, 0);
  } finally {
    globalThis.fetch = original;
  }
});
