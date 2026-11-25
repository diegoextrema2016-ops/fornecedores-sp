// Testes da proteção da prévia: a Preview da Vercel nunca pode usar o projeto de produção.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ehPrevia, configuracaoDePrevia, referenciasDeProducao, PROD_REF, PROD_SITE } from '../scripts/preview-config.mjs';

const PROD_KEY = 'sb_publishable_PRODUCAO_nao_usar_na_previa';
const DEV_REF = 'pptjmgrsukucnvyolnvn';
const BOM = {
  VERCEL_ENV: 'preview',
  SUPABASE_DEV_URL: `https://${DEV_REF}.supabase.co`,
  SUPABASE_DEV_ANON_KEY: 'sb_publishable_dev_exemplo_123',
  VERCEL_URL: 'sp-fornecedores-8k2j1x-equipe.vercel.app',
  VERCEL_BRANCH_URL: 'sp-fornecedores-git-feat-layout-premium-equipe.vercel.app',
};

test('só o ambiente Preview ativa a regra de prévia', () => {
  assert.equal(ehPrevia({ VERCEL_ENV: 'preview' }), true);
  assert.equal(ehPrevia({ VERCEL_ENV: 'production' }), false);
  assert.equal(ehPrevia({}), false);
});

test('com as variáveis DEV corretas, devolve a configuração de teste', () => {
  const cfg = configuracaoDePrevia(BOM, PROD_KEY);
  assert.equal(cfg.supabaseUrl, `https://${DEV_REF}.supabase.co`);
  assert.equal(cfg.anonKey, BOM.SUPABASE_DEV_ANON_KEY);
  assert.equal(cfg.siteUrl, `https://${BOM.VERCEL_BRANCH_URL}`);
});

test('o site da prévia usa o endereço fixo da branch, não o endereço desta implantação', () => {
  const cfg = configuracaoDePrevia(BOM, PROD_KEY);
  assert.notEqual(cfg.siteUrl, `https://${BOM.VERCEL_URL}`);
  assert.equal(cfg.siteUrl, 'https://sp-fornecedores-git-feat-layout-premium-equipe.vercel.app');
});

test('recusa a prévia sem o endereço fixo da branch', () => {
  const env = { ...BOM, VERCEL_BRANCH_URL: '' };
  assert.throws(() => configuracaoDePrevia(env, PROD_KEY), /VERCEL_BRANCH_URL/);
});

test('recusa a prévia sem a URL do DEV', () => {
  const env = { ...BOM, SUPABASE_DEV_URL: '' };
  assert.throws(() => configuracaoDePrevia(env, PROD_KEY), /falta a variável SUPABASE_DEV_URL/);
});

test('recusa a prévia sem a chave do DEV', () => {
  const env = { ...BOM, SUPABASE_DEV_ANON_KEY: '' };
  assert.throws(() => configuracaoDePrevia(env, PROD_KEY), /falta a variável SUPABASE_DEV_ANON_KEY/);
});

test('recusa a prévia se a URL apontar para o projeto de produção', () => {
  const env = { ...BOM, SUPABASE_DEV_URL: `https://${PROD_REF}.supabase.co` };
  assert.throws(() => configuracaoDePrevia(env, PROD_KEY), /PRODUÇÃO/);
});

test('recusa a prévia se a chave for a de produção', () => {
  const env = { ...BOM, SUPABASE_DEV_ANON_KEY: PROD_KEY };
  assert.throws(() => configuracaoDePrevia(env, PROD_KEY), /chave de PRODUÇÃO/);
});

test('recusa chave que não seja publicável', () => {
  const env = { ...BOM, SUPABASE_DEV_ANON_KEY: 'sb_secret_chave_secreta' };
  assert.throws(() => configuracaoDePrevia(env, PROD_KEY), /PUBLICÁVEL/);
});

test('recusa URL que não é um projeto Supabase', () => {
  const env = { ...BOM, SUPABASE_DEV_URL: 'https://exemplo.com' };
  assert.throws(() => configuracaoDePrevia(env, PROD_KEY), /supabase\.co/);
});

test('recusa endereço de prévia que não seja *.vercel.app', () => {
  const env = { ...BOM, VERCEL_BRANCH_URL: 'www.fornecedoresdesp.com.br' };
  assert.throws(() => configuracaoDePrevia(env, PROD_KEY), /vercel\.app/);
});

test('encontra referências de produção no resultado do build', () => {
  const arquivos = [
    { nome: 'js/config.js', texto: `url: '${PROD_REF}'` },
    { nome: 'site/index.html', texto: `canonical ${PROD_SITE}/site` },
    { nome: 'js/limpo.js', texto: 'nada aqui' },
    { nome: 'js/chave.js', texto: `key=${PROD_KEY}` },
  ];
  assert.deepEqual(referenciasDeProducao(arquivos, PROD_KEY), ['js/config.js', 'site/index.html', 'js/chave.js']);
});
