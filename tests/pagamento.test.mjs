import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { planoOferecido, pagamentoAprovadoValido, novoVencimento, centavos } from '../js/pagamento.js';
import { assinaturaMercadoPagoValida } from '../servidor/mercadopago.js';

const SEGREDO = 'segredo-de-teste';
const ASSINATURA_ID = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function assinar({ dataId, requestId, ts, segredo = SEGREDO }) {
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const v1 = createHmac('sha256', segredo).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

test('plano mensal é oferecido e plano inexistente não é', () => {
  assert.ok(planoOferecido('mensal'));
  assert.equal(planoOferecido('inexistente'), null);
  assert.equal(planoOferecido(undefined), null);
});

test('centavos evita erro de ponto flutuante', () => {
  assert.equal(centavos(29.9), 2990);
  assert.equal(centavos('29.90'), 2990);
});

test('assinatura válida é aceita', () => {
  const assinatura = assinar({ dataId: '123456', requestId: 'req-1', ts: '1700000000' });
  assert.equal(assinaturaMercadoPagoValida({ assinatura, requestId: 'req-1', dataId: '123456', segredo: SEGREDO }), true);
});

test('assinatura com segredo errado, corpo trocado ou id trocado é recusada', () => {
  const assinatura = assinar({ dataId: '123456', requestId: 'req-1', ts: '1700000000' });
  assert.equal(assinaturaMercadoPagoValida({ assinatura, requestId: 'req-1', dataId: '123457', segredo: SEGREDO }), false);
  assert.equal(assinaturaMercadoPagoValida({ assinatura, requestId: 'req-2', dataId: '123456', segredo: SEGREDO }), false);
  assert.equal(assinaturaMercadoPagoValida({ assinatura, requestId: 'req-1', dataId: '123456', segredo: 'outro' }), false);
});

test('sem segredo, cabeçalho ou partes, a assinatura é recusada', () => {
  assert.equal(assinaturaMercadoPagoValida({ assinatura: 'ts=1,v1=x', requestId: 'r', dataId: '1', segredo: '' }), false);
  assert.equal(assinaturaMercadoPagoValida({ assinatura: undefined, requestId: 'r', dataId: '1', segredo: SEGREDO }), false);
  assert.equal(assinaturaMercadoPagoValida({ assinatura: 'ts=1', requestId: 'r', dataId: '1', segredo: SEGREDO }), false);
});

test('id alfanumérico é normalizado em minúsculas na assinatura', () => {
  const assinatura = assinar({ dataId: 'ABC123', requestId: 'req', ts: '5' });
  assert.equal(assinaturaMercadoPagoValida({ assinatura, requestId: 'req', dataId: 'ABC123', segredo: SEGREDO }), true);
});

const pagamentoOk = { status: 'approved', currency_id: 'BRL', external_reference: ASSINATURA_ID, transaction_amount: 29.9 };

test('pagamento aprovado, em reais, na assinatura certa e pelo valor do plano libera', () => {
  assert.equal(pagamentoAprovadoValido(pagamentoOk, { assinaturaId: ASSINATURA_ID, valor: 29.9 }), true);
});

test('pagamento não aprovado, de outra moeda, de outra assinatura ou com valor diferente não libera', () => {
  const base = { assinaturaId: ASSINATURA_ID, valor: 29.9 };
  assert.equal(pagamentoAprovadoValido({ ...pagamentoOk, status: 'pending' }, base), false);
  assert.equal(pagamentoAprovadoValido({ ...pagamentoOk, status: 'rejected' }, base), false);
  assert.equal(pagamentoAprovadoValido({ ...pagamentoOk, currency_id: 'USD' }, base), false);
  assert.equal(pagamentoAprovadoValido({ ...pagamentoOk, external_reference: 'outra' }, base), false);
  assert.equal(pagamentoAprovadoValido({ ...pagamentoOk, transaction_amount: 19.9 }, base), false);
  assert.equal(pagamentoAprovadoValido(null, base), false);
});

test('primeiro pagamento libera 30 dias a partir de agora', () => {
  const agora = new Date('2026-11-14T12:00:00Z');
  const venc = novoVencimento({ agora, vencimentoAtual: null, dias: 30 });
  assert.equal(venc.toISOString(), '2026-12-14T12:00:00.000Z');
});

test('renovação antes do fim soma o prazo ao acesso atual', () => {
  const agora = new Date('2026-11-14T12:00:00Z');
  const venc = novoVencimento({ agora, vencimentoAtual: '2026-11-20T00:00:00Z', dias: 30 });
  assert.equal(venc.toISOString(), '2026-12-20T00:00:00.000Z');
});

test('acesso vencido não soma prazo: conta a partir de agora', () => {
  const agora = new Date('2026-11-14T12:00:00Z');
  const venc = novoVencimento({ agora, vencimentoAtual: '2026-10-01T00:00:00Z', dias: 30 });
  assert.equal(venc.toISOString(), '2026-12-14T12:00:00.000Z');
});

import { destinoDoServidor } from '../servidor/mercadopago.js';
const DEV_URL = 'https://pptjmgrsukucnvyolnvn.supabase.co';
const DEV_CHAVE = 'sb_publishable_teste_dev_0000';
const PREVIA = { VERCEL_ENV: 'preview', VERCEL_URL: 'fornecedores-sp-8k2j1x-teste.vercel.app', VERCEL_BRANCH_URL: 'fornecedores-sp-git-teste.vercel.app', SUPABASE_DEV_URL: DEV_URL, SUPABASE_DEV_ANON_KEY: DEV_CHAVE, MP_AMBIENTE: 'sandbox', MP_ACCESS_TOKEN: 'TEST-token' };

test('produção usa o projeto e o site de produção', () => {
  const d = destinoDoServidor({ MP_AMBIENTE: 'producao' });
  assert.equal(d.supabaseUrl, 'https://fzjiixiqezvvfeybydie.supabase.co');
  assert.equal(d.siteUrl, 'https://www.fornecedoresdesp.com.br');
  assert.equal(d.sandbox, false);
});

test('prévia válida usa só o projeto DEV, o site da prévia e o sandbox', () => {
  const d = destinoDoServidor(PREVIA);
  assert.equal(d.supabaseUrl, DEV_URL);
  assert.equal(d.siteUrl, 'https://fornecedores-sp-git-teste.vercel.app');
  assert.equal(d.sandbox, true);
});

test('prévia falha fechado: sem DEV, apontando para produção ou sem sandbox', () => {
  const { SUPABASE_DEV_URL, ...semDev } = PREVIA;
  assert.throws(() => destinoDoServidor(semDev), /SUPABASE_DEV_URL/);
  assert.throws(() => destinoDoServidor({ ...PREVIA, SUPABASE_DEV_URL: 'https://fzjiixiqezvvfeybydie.supabase.co' }), /PRODUÇÃO/);
  assert.throws(() => destinoDoServidor({ ...PREVIA, MP_AMBIENTE: 'producao' }), /sandbox/);
});
