// Regra de domínio por build: produção só no domínio de produção; Preview só no host exato da própria prévia.
// Os endereços base foram passados como parâmetro, porque SITE.url só muda na build de Preview
// (scripts/build.mjs, aplicarPrevia). Nenhuma credencial é usada ou lida aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as R from '../js/rastreamento.js';

const PREVIA_HOST = 'fornecedores-sp-git-feat-meta-pixel-diego-26ba.vercel.app';
const PREVIA = `https://${PREVIA_HOST}`;
const PRODUCAO = 'https://www.fornecedoresdesp.com.br';
const NOTA = R.NOTA_COMPRA_APROVADA;

// ---------- 1. Preview autorizado (somente o host exato da prévia) ----------

test('Preview: o host exato da prévia é autorizado e o aviso pode aparecer', () => {
  assert.equal(R.dominioAutorizado(PREVIA_HOST, PREVIA), true);
  assert.equal(R.pixelHabilitado({ pixelId: '1825652548675496', consentimento: 'aceito', hostname: PREVIA_HOST }), false,
    'pixelHabilitado usa o endereço de produção por padrão: sem prévia explícita, nada é liberado');
});

// ---------- 2. Outros *.vercel.app continuam bloqueados ----------

test('Preview: outros hosts *.vercel.app, subdomínios e prefixos enganosos são bloqueados', () => {
  for (const h of [
    'fornecedores-pr-12.vercel.app',
    'fornecedores-sp.vercel.app',
    'outro-projeto.vercel.app',
    `x.${PREVIA_HOST}`,
    `${PREVIA_HOST}.evil.test`,
    'fornecedores-sp.vercel.app.evil.test',
  ]) {
    assert.equal(R.dominioAutorizado(h, PREVIA), false, h);
  }
});

// ---------- 3. Domínios externos continuam bloqueados ----------

test('externos: nenhum domínio fora da regra é autorizado, em nenhuma build', () => {
  for (const h of ['localhost', '127.0.0.1', 'evil.com', 'fornecedoresdesp.com.br.evil.test', 'www.fornecedoresdesp.com.br', '']) {
    assert.equal(R.dominioAutorizado(h, PREVIA), false, `preview: ${h}`);
    assert.equal(R.dominioAutorizado(h, PRODUCAO), ['fornecedoresdesp.com.br', 'www.fornecedoresdesp.com.br'].includes(h), `produção: ${h}`);
  }
});

// ---------- 4. Produção continua restrita à regra de domínio de produção ----------

test('Produção: só o domínio de produção; o host da prévia e os *.vercel.app ficam de fora', () => {
  assert.equal(R.dominioAutorizado('fornecedoresdesp.com.br', PRODUCAO), true);
  assert.equal(R.dominioAutorizado(PREVIA_HOST, PRODUCAO), false, 'prévia não ganha acesso no site de produção');
  assert.equal(R.dominioAutorizado('fornecedores-sp.vercel.app', PRODUCAO), false);
  assert.equal(R.dominioAutorizado('www.fornecedoresdesp.com.br', PRODUCAO), true, 'www é o host real do site de produção');
  assert.equal(R.dominioAutorizado('www.fornecedoresdesp.com.br.evil.test', PRODUCAO), false, 'sufixo falso não passa');
});

test('endereço base sem host de produção nem de prévia: nada é autorizado (falha fechada)', () => {
  for (const base of ['http://localhost:8091', 'http://127.0.0.1:8093', 'não é endereço', '']) {
    assert.equal(R.dominioAutorizado('fornecedoresdesp.com.br', base), false, `base ${base}`);
    assert.equal(R.dominioAutorizado(PREVIA_HOST, base), false, `base ${base}`);
  }
});

test('hostDoSite: extrai só o host do endereço base', () => {
  assert.equal(R.hostDoSite(PREVIA), PREVIA_HOST);
  assert.equal(R.hostDoSite(PRODUCAO), 'www.fornecedoresdesp.com.br');
  assert.equal(R.hostDoSite('::'), '');
});

// ---------- Guardas do código-fonte ----------

test('config de produção: o endereço base commitado continua sendo o de produção', async () => {
  const cfg = await readFile(new URL('../js/config.js', import.meta.url), 'utf8');
  assert.ok(cfg.includes("url: 'https://www.fornecedoresdesp.com.br'"), 'SITE.url de produção');
  assert.ok(!/\.vercel\.app/.test(cfg.split('export const SITE')[1].split('};')[0]), 'SITE sem host de prévia no código');
});

test('rastreamento.js não tem o endereço de produção completo (a build de Preview o trocaria)', async () => {
  const fonte = await readFile(new URL('../js/rastreamento.js', import.meta.url), 'utf8');
  assert.ok(!fonte.includes('https://www.fornecedoresdesp.com.br'), 'o literal seria reescrito pela build de Preview');
});

// ---------- 6-7. Purchase bloqueado em Sandbox/Preview ----------

test('Purchase: tentativa de Sandbox ou sem indicador nunca gera Purchase, mesmo com a regra de domínio ativa', () => {
  const assinatura = { id: 'sub-1', status: 'active', amount: 29.9, paymentNote: NOTA };
  const base = { id: 'sub-1', token: 'tok-1', em: Date.now() };
  assert.equal(R.escolheCompra({ pendente: { ...base, sandbox: true }, assinaturas: [assinatura] }), null, 'sandbox true');
  assert.equal(R.escolheCompra({ pendente: { ...base }, assinaturas: [assinatura] }), null, 'sem indicador');
  assert.equal(R.escolheCompra({ pendente: { ...base, sandbox: 'false' }, assinaturas: [assinatura] }), null, 'texto no lugar de booleano');
  assert.ok(R.escolheCompra({ pendente: { ...base, sandbox: false }, assinaturas: [assinatura] }), 'controle: produção real passa');
});

// ---------- 5. Consentimento: recusar bloqueia, aceitar libera (regra por domínio) ----------

test('consentimento: sem "aceito" nada é liberado, em nenhuma build', () => {
  for (const consentimento of [null, 'recusado', '', 'sim']) {
    assert.equal(R.pixelHabilitado({ pixelId: '1825652548675496', consentimento, hostname: 'fornecedoresdesp.com.br' }), false, `prod ${consentimento}`);
  }
});
