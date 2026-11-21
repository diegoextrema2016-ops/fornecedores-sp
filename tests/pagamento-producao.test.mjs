// Trava de Sandbox em produção: produção nunca aceita MP_AMBIENTE=sandbox, e o webhook não libera acesso
// com pagamento de teste (live_mode falso) em produção. A prévia continua recebendo pagamentos de teste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { destinoDoServidor } from '../servidor/mercadopago.js';
import webhook from '../api/mercadopago/webhook.js';
import criarPagamento from '../api/mercadopago/criar-pagamento.js';

const DEV_URL = 'https://pptjmgrsukucnvyolnvn.supabase.co';
const DEV_CHAVE = 'sb_publishable_teste_dev_0000';
const PREVIA = { VERCEL_ENV: 'preview', VERCEL_URL: 'fornecedores-sp-git-teste.vercel.app', SUPABASE_DEV_URL: DEV_URL, SUPABASE_DEV_ANON_KEY: DEV_CHAVE, MP_AMBIENTE: 'sandbox', MP_ACCESS_TOKEN: 'TEST-token' };
const UUID = '9f1c2b3a-1111-4222-8333-444455556666';
const SEGREDO = 'segredo-de-teste';

const ENV_LIMPO = ['VERCEL_ENV', 'VERCEL_URL', 'SUPABASE_DEV_URL', 'SUPABASE_DEV_ANON_KEY', 'MP_AMBIENTE', 'MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'];
function ambiente(extra) {
  for (const k of ENV_LIMPO) delete process.env[k];
  Object.assign(process.env, extra);
}

// fetch simulado: registra cada chamada e responde conforme a rota.
function rede({ pagamento }) {
  const chamadas = [];
  globalThis.fetch = async (url, opts = {}) => {
    chamadas.push({ url: String(url), metodo: opts.method || 'GET' });
    const json = (corpo, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => corpo });
    if (String(url).includes('/v1/payments/')) return json(pagamento);
    if (String(url).includes('/auth/v1/user')) return json({ id: 'user-1', email: 'a@b.c' });
    if (String(url).includes('checkout/preferences')) return json({ id: 'pref-1', init_point: 'https://producao.checkout', sandbox_init_point: 'https://sandbox.checkout' });
    if (String(url).includes('/rest/v1/subscriptions?select=id')) return json([{ id: UUID }]);
    return json([]);
  };
  return chamadas;
}

// Assinatura do webhook conforme o manifesto oficial (id; request-id; ts).
function assinatura(dataId, requestId = 'req-1', ts = '1700000000') {
  const v1 = createHmac('sha256', SEGREDO).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

function notificacao(dataId = 'pay-1') {
  return {
    method: 'POST',
    query: { 'data.id': dataId, type: 'payment' },
    headers: { 'x-signature': assinatura(dataId), 'x-request-id': 'req-1' },
    body: {},
  };
}

const pagamentoAprovado = (extra = {}) => ({
  id: 'pay-1', status: 'approved', currency_id: 'BRL', transaction_amount: 29.9,
  external_reference: UUID, live_mode: true, ...extra,
});

async function chamaWebhook(req) {
  let status;
  const res = { status(c) { status = c; return this; }, end() { return this; } };
  await webhook(req, res);
  return status;
}

test('produção: MP_AMBIENTE=sandbox falha alto em vez de usar sandbox', () => {
  ambiente({ MP_AMBIENTE: 'sandbox' });
  assert.throws(() => destinoDoServidor(process.env), /produção: MP_AMBIENTE não pode ser sandbox/);
});

test('produção: configuração normal não usa sandbox', () => {
  ambiente({ MP_AMBIENTE: 'producao' });
  assert.equal(destinoDoServidor(process.env).sandbox, false);
  ambiente({});
  assert.equal(destinoDoServidor(process.env).sandbox, false);
});

test('prévia: continua usando sandbox e o projeto de desenvolvimento', () => {
  ambiente(PREVIA);
  const d = destinoDoServidor(process.env);
  assert.equal(d.sandbox, true);
  assert.equal(d.supabaseUrl, DEV_URL);
});

test('criar pagamento em produção com MP_AMBIENTE=sandbox: responde 503 e não cria pedido', async () => {
  ambiente({ MP_AMBIENTE: 'sandbox', MP_ACCESS_TOKEN: 'APP_USR-real', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
  const chamadas = rede({ pagamento: pagamentoAprovado() });
  let status; let corpo;
  const res = { status(c) { status = c; return this; }, json(b) { corpo = b; return this; } };
  await criarPagamento({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: { planId: 'mensal' } }, res);
  assert.equal(status, 503);
  assert.ok(!corpo.url, 'nenhum link de pagamento');
  assert.equal(chamadas.length, 0, 'nenhuma chamada ao Mercado Pago ou ao banco');
});

test('webhook em produção: pagamento de teste (live_mode falso) não libera acesso nem grava nada', async () => {
  ambiente({ MP_WEBHOOK_SECRET: SEGREDO, MP_ACCESS_TOKEN: 'TEST-123', SUPABASE_SERVICE_ROLE_KEY: 'svc', MP_AMBIENTE: 'producao' });
  const chamadas = rede({ pagamento: pagamentoAprovado({ live_mode: false }) });
  assert.equal(await chamaWebhook(notificacao()), 200);
  assert.equal(chamadas.filter((c) => c.url.includes('supabase')).length, 0, 'nenhuma leitura ou escrita no banco');
  assert.equal(chamadas.filter((c) => c.metodo === 'PATCH').length, 0);
});

test('webhook em produção: pagamento real (live_mode verdadeiro) segue o fluxo normal', async () => {
  ambiente({ MP_WEBHOOK_SECRET: SEGREDO, MP_ACCESS_TOKEN: 'APP_USR-real', SUPABASE_SERVICE_ROLE_KEY: 'svc', MP_AMBIENTE: 'producao' });
  const chamadas = rede({ pagamento: pagamentoAprovado({ live_mode: true }) });
  await chamaWebhook(notificacao());
  assert.ok(chamadas.some((c) => c.url.includes('/rest/v1/subscriptions')), 'consulta a assinatura normalmente');
});

test('webhook na prévia: pagamento de teste continua sendo processado', async () => {
  ambiente({ ...PREVIA, MP_WEBHOOK_SECRET: SEGREDO, SUPABASE_SERVICE_ROLE_KEY: 'svc' });
  const chamadas = rede({ pagamento: pagamentoAprovado({ live_mode: false }) });
  await chamaWebhook(notificacao());
  assert.ok(chamadas.some((c) => c.url.includes('/rest/v1/subscriptions')), 'a prévia não é afetada pela trava');
});

test('webhook: assinatura inválida continua recusada antes de qualquer consulta', async () => {
  ambiente({ MP_WEBHOOK_SECRET: SEGREDO, MP_ACCESS_TOKEN: 'APP_USR-real', SUPABASE_SERVICE_ROLE_KEY: 'svc', MP_AMBIENTE: 'producao' });
  const chamadas = rede({ pagamento: pagamentoAprovado() });
  const req = notificacao();
  req.headers['x-signature'] = 'ts=1,v1=errado';
  assert.equal(await chamaWebhook(req), 401);
  assert.equal(chamadas.length, 0);
});
