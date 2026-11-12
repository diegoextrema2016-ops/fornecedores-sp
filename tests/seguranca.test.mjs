import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as seo from '../scripts/seo.mjs';

const raiz = new URL('..', import.meta.url).pathname;
const ler = (p) => readFileSync(join(raiz, p), 'utf8');

test('páginas geradas não têm script inline (a CSP bloqueia script inline)', () => {
  const html = seo.notFoundPage();
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  for (const attrs of scripts) {
    const ehJsonLd = /type="application\/ld\+json"/.test(attrs);
    assert.ok(ehJsonLd || /\bsrc="/.test(attrs), `script inline encontrado: <script${attrs}>`);
  }
  assert.ok(seo.PENDING_GUARD.includes('src="/js/guard.js"'));
  assert.ok(!/<script>(?!<)/.test(seo.PENDING_GUARD), 'o guarda não pode ter script inline');
});

test('código do site não tem handlers inline (onclick="...")', () => {
  const arquivos = readdirSync(join(raiz, 'js')).filter((f) => f.endsWith('.js'));
  for (const f of arquivos) {
    assert.ok(!/\son[a-z]+="/i.test(ler(`js/${f}`)), `handler inline em js/${f}`);
  }
});

test('window.SPF (acesso global ao app) não fica exposto', () => {
  assert.ok(!/window\.SPF\s*=/.test(ler('js/app.js')));
});

test('vercel.json envia os cabeçalhos de segurança em todas as páginas', () => {
  const cfg = JSON.parse(ler('vercel.json'));
  const bloco = cfg.headers.find((h) => h.source === '/(.*)');
  assert.ok(bloco, 'falta o bloco de cabeçalhos para todas as rotas');
  const nomes = Object.fromEntries(bloco.headers.map((h) => [h.key, h.value]));
  assert.equal(nomes['X-Frame-Options'], 'DENY');
  assert.equal(nomes['X-Content-Type-Options'], 'nosniff');
  assert.match(nomes['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(nomes['Content-Security-Policy'], /script-src 'self'/);
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(nomes['Content-Security-Policy']), 'CSP não pode liberar script inline');
});

test('endpoint de IA não devolve detalhe técnico do provedor ao usuário', () => {
  const codigo = ler('api/sugerir-descricao.js');
  assert.ok(!/erro \$\{r\.status\}/.test(codigo), 'não pode repassar o código de erro do provedor');
  assert.ok(codigo.includes("consume_rate_limit"), 'falta o limite de uso por conta');
});

test('.gitignore impede commit de arquivos .env', () => {
  const gi = ler('.gitignore');
  assert.ok(/^\.env$/m.test(gi));
  assert.ok(/^\.env\.\*$/m.test(gi));
});
