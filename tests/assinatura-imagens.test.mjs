// Regra de acesso por assinatura (D5: sem carência, expira na hora) e referências de imagens (bucket privado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestSubscription, hasActiveSubscription, accessExpiresAt } from '../js/assinatura.js';
import { imagePathFromUrl, imageRefsOf } from '../js/imagens.js';

const AGORA = Date.parse('2026-11-14T12:00:00Z');
const DIA = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const sub = (status, expiresInMs, extra = {}) => ({ status, expiresAt: iso(AGORA + expiresInMs), ...extra });

test('assinante ativo dentro do prazo tem acesso', () => {
  assert.equal(hasActiveSubscription([sub('active', 20 * DIA)], AGORA), true);
});

test('expiração é imediata: no instante do vencimento o acesso acaba (sem carência)', () => {
  assert.equal(hasActiveSubscription([sub('active', 0)], AGORA), false, 'no instante exato, já expirou');
  assert.equal(hasActiveSubscription([sub('active', -1)], AGORA), false, '1 ms depois, sem acesso');
  assert.equal(hasActiveSubscription([sub('active', 1)], AGORA), true, '1 ms antes, ainda tem acesso');
});

test('pedido pendente, cancelado ou expirado não dá acesso, mesmo com data futura', () => {
  assert.equal(hasActiveSubscription([sub('pending', 30 * DIA)], AGORA), false, 'pendente');
  assert.equal(hasActiveSubscription([sub('cancelled', 30 * DIA)], AGORA), false, 'cancelada');
  assert.equal(hasActiveSubscription([sub('active', -DIA)], AGORA), false, 'expirada');
});

test('sem nenhuma assinatura não há acesso', () => {
  assert.equal(hasActiveSubscription([], AGORA), false);
  assert.equal(accessExpiresAt([], AGORA), Infinity);
});

test('quando há assinatura antiga expirada e uma ativa, vale a ativa', () => {
  const lista = [sub('active', -30 * DIA), sub('active', 10 * DIA)];
  assert.equal(hasActiveSubscription(lista, AGORA), true);
  assert.equal(bestSubscription(lista, AGORA).expiresAt, iso(AGORA + 10 * DIA));
});

test('quando há duas ativas, a que vence mais tarde define o prazo do acesso', () => {
  const lista = [sub('active', 5 * DIA), sub('active', 25 * DIA)];
  assert.equal(accessExpiresAt(lista, AGORA), AGORA + 25 * DIA);
});

test('pedido pendente somado a assinatura vencida não dá acesso', () => {
  const lista = [sub('pending', 30 * DIA), sub('active', -DIA)];
  assert.equal(hasActiveSubscription(lista, AGORA), false);
});

const BASE = 'https://abc.supabase.co/storage/v1/object/public/supplier-images/';

test('caminho do bucket sai da referência, inclusive com espaço codificado', () => {
  assert.equal(imagePathFromUrl(`${BASE}uid-1/forn-2/logo-1.webp`), 'uid-1/forn-2/logo-1.webp');
  assert.equal(imagePathFromUrl(`${BASE}uid-1/forn-2/foto%20um.webp`), 'uid-1/forn-2/foto um.webp');
});

test('referência de outro bucket, de outro endereço ou vazia não vira caminho', () => {
  assert.equal(imagePathFromUrl('https://abc.supabase.co/storage/v1/object/public/outro/x.webp'), null);
  assert.equal(imagePathFromUrl('https://exemplo.com/foto.webp'), null);
  assert.equal(imagePathFromUrl(''), null);
  assert.equal(imagePathFromUrl(null), null);
});

test('usar imagePathFromUrl com map não troca o bucket pelo índice do array', () => {
  const urls = [`${BASE}a/b/1.webp`, `${BASE}a/b/2.webp`, `${BASE}a/b/3.webp`];
  const caminhos = urls.map((u) => imagePathFromUrl(u));
  assert.deepEqual(caminhos, ['a/b/1.webp', 'a/b/2.webp', 'a/b/3.webp']);
});

test('imageRefsOf junta logo e fotos de todos os fornecedores, sem nulos', () => {
  const rows = [
    { logo_url: `${BASE}a/b/logo.webp`, supplier_photos: [{ url: `${BASE}a/b/f1.webp` }, { url: `${BASE}a/b/f2.webp` }] },
    { logo_url: null, supplier_photos: [] },
    { logo_url: null, supplier_photos: [{ url: `${BASE}c/d/f.webp` }] },
  ];
  assert.deepEqual(imageRefsOf(rows), [`${BASE}a/b/logo.webp`, `${BASE}a/b/f1.webp`, `${BASE}a/b/f2.webp`, `${BASE}c/d/f.webp`]);
});
