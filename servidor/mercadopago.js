// Chamadas do servidor: Mercado Pago (API e assinatura do webhook) e Supabase com a chave de serviço.
// Este arquivo roda só na Vercel. A chave de serviço e o token do Mercado Pago nunca vão para o navegador
// nem para logs: erros registram apenas o código HTTP.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SUPABASE, SITE } from '../js/config.js';
import { ehPrevia, configuracaoDePrevia } from '../scripts/preview-config.mjs';

// Para onde o servidor fala. Em produção: projeto e site de produção, com o token real do Mercado Pago.
// Na prévia: só o projeto DEV, o site da prévia e o sandbox (token TEST-). Qualquer falha lança erro,
// e a rota responde 503 sem tocar em nada.
export function destinoDoServidor(env = process.env) {
  if (!ehPrevia(env)) {
    return { supabaseUrl: SUPABASE.url, anonKey: SUPABASE.anonKey, siteUrl: SITE.url, sandbox: env.MP_AMBIENTE === 'sandbox' };
  }
  const dev = configuracaoDePrevia(env, SUPABASE.anonKey);
  if (env.MP_AMBIENTE !== 'sandbox') throw new Error('prévia: MP_AMBIENTE deve ser sandbox.');
  if (!String(env.MP_ACCESS_TOKEN || '').startsWith('TEST-')) throw new Error('prévia: MP_ACCESS_TOKEN deve ser um token de teste (TEST-).');
  return { supabaseUrl: dev.supabaseUrl, anonKey: dev.anonKey, siteUrl: dev.siteUrl, sandbox: true };
}

const API_MERCADO_PAGO = 'https://api.mercadopago.com';

// Confere a assinatura enviada pelo Mercado Pago (x-signature: ts=...,v1=...).
// Manifesto oficial: id:<data.id>;request-id:<x-request-id>;ts:<ts>;  — HMAC-SHA256 com o segredo do webhook.
export function assinaturaMercadoPagoValida({ assinatura, requestId, dataId, segredo }) {
  if (!segredo || !assinatura || !dataId) return false;
  const partes = Object.fromEntries(String(assinatura).split(',').map((p) => {
    const i = p.indexOf('=');
    return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
  }));
  const { ts, v1 } = partes;
  if (!ts || !v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifesto = `id:${id};request-id:${requestId || ''};ts:${ts};`;
  const esperada = createHmac('sha256', segredo).update(manifesto).digest('hex');
  const a = Buffer.from(esperada);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function buscarPagamento(id, token) {
  const r = await fetch(`${API_MERCADO_PAGO}/v1/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`mercadopago_pagamento_${r.status}`);
  return r.json();
}

export async function criarPreferencia(corpo, token, chaveIdempotencia) {
  const r = await fetch(`${API_MERCADO_PAGO}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': chaveIdempotencia,
    },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`mercadopago_preferencia_${r.status}`);
  return r.json();
}

// Dono da sessão, confirmado pelo próprio Supabase a partir do token enviado.
export async function usuarioDaSessao(token, destino) {
  const r = await fetch(`${destino.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: destino.anonKey, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const dados = await r.json().catch(() => ({}));
  return dados.id ? { id: dados.id, email: dados.email || '' } : null;
}

// Consultas e escritas com a chave de serviço (ignora RLS). Só o servidor usa.
export async function supabaseServico(caminho, { method = 'GET', corpo, prefer, destino } = {}) {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) throw new Error('supabase_chave_ausente');
  const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };
  if (prefer) cabecalhos.Prefer = prefer;
  const r = await fetch(`${destino.supabaseUrl}/rest/v1/${caminho}`, {
    method,
    headers: cabecalhos,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) throw new Error(`supabase_${r.status}`);
  return r.status === 204 ? null : r.json();
}
