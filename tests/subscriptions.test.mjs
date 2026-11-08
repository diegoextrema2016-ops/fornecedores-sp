import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renewalWindow, subscriptionAdminFromRow } from '../js/mapping.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-08T12:00:00Z');

test('confirmação sem assinatura anterior: vale a partir de agora, pelo prazo do plano', () => {
  const w = renewalWindow(NOW, 365, null);
  assert.equal(w.startsAt, NOW.toISOString());
  assert.equal(new Date(w.expiresAt).getTime() - NOW.getTime(), 365 * DAY);
});

test('renovação com assinatura ainda válida: o prazo começa quando a atual termina', () => {
  const current = new Date(NOW.getTime() + 30 * DAY).toISOString();
  const w = renewalWindow(NOW, 365, current);
  assert.equal(new Date(w.expiresAt).getTime(), new Date(current).getTime() + 365 * DAY);
});

test('assinatura já vencida não estende o prazo: conta a partir de agora', () => {
  const past = new Date(NOW.getTime() - 5 * DAY).toISOString();
  const w = renewalWindow(NOW, 365, past);
  assert.equal(new Date(w.expiresAt).getTime() - NOW.getTime(), 365 * DAY);
});

test('data inválida na assinatura atual é tratada como ausente', () => {
  const w = renewalWindow(NOW, 365, 'não é data');
  assert.equal(new Date(w.expiresAt).getTime() - NOW.getTime(), 365 * DAY);
});

test('assinatura do administrador traz nome e e-mail de quem pagou', () => {
  const s = subscriptionAdminFromRow({
    id: 'sub-1', user_id: 'u-1', plan: 'anual', amount: '29.90', status: 'pending',
    starts_at: '2026-11-01T00:00:00Z', expires_at: '2026-11-01T00:00:00Z', payment_note: 'x',
    created_at: '2026-11-01T00:00:00Z', profiles: [{ name: 'Ana', email: 'ana@x.com' }],
  });
  assert.equal(s.userId, 'u-1');
  assert.equal(s.userName, 'Ana');
  assert.equal(s.userEmail, 'ana@x.com');
  assert.equal(s.amount, 29.9);
  assert.equal(s.planId, 'anual');
});

test('assinatura sem perfil embutido não quebra', () => {
  const s = subscriptionAdminFromRow({ id: 'sub-2', user_id: 'u-2', plan: 'anual', amount: 29.9, status: 'active', starts_at: null, expires_at: null, profiles: null });
  assert.equal(s.userName, '');
  assert.equal(s.userEmail, '');
});
