import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scramResposta, configDoBanco, validarSlugs } from '../scripts/pg-slugs.mjs';
import { slugsDoFixture } from '../scripts/dados.mjs';

// Vetor de teste oficial do SCRAM-SHA-256 (RFC 7677, seção 3).
test('SCRAM-SHA-256 bate com o vetor oficial da RFC 7677', () => {
  const r = scramResposta({
    senha: 'pencil',
    cnonce: 'rOprNGfwEbeRWgbNEkqO',
    primeiraBare: 'n=user,r=rOprNGfwEbeRWgbNEkqO',
    mensagemServidor: 'r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096',
  });
  assert.equal(r.final, 'c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,p=dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=');
  assert.equal(r.assinaturaServidor, '6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=');
});

test('SCRAM recusa nonce do servidor que não começa com o do cliente', () => {
  assert.throws(() => scramResposta({
    senha: 'pencil',
    cnonce: 'AAAA',
    primeiraBare: 'n=user,r=AAAA',
    mensagemServidor: 'r=BBBBzzz,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096',
  }), /inválida/);
});

const CA = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
const URL_OK = 'postgresql://build_publico:segredo-de-teste@db.exemplo.supabase.co:5432/postgres';

test('configuração aceita só o usuário build_publico com verificação TLS e CA fixada', () => {
  const cfg = configDoBanco({ SUPABASE_BUILD_DB_URL: URL_OK, SUPABASE_DB_CA: CA });
  assert.equal(cfg.usuario, 'build_publico');
  assert.equal(cfg.modo, 'verify-full');
  assert.equal(cfg.port, 5432);
});

test('configuração recusa usuário que não é o do build (ex.: postgres ou service_role)', () => {
  assert.throws(() => configDoBanco({
    SUPABASE_BUILD_DB_URL: 'postgresql://postgres:x@db.exemplo.supabase.co:5432/postgres', SUPABASE_DB_CA: CA,
  }), /build_publico/);
});

test('configuração recusa sslmode diferente de verify-full', () => {
  assert.throws(() => configDoBanco({
    SUPABASE_BUILD_DB_URL: `${URL_OK}?sslmode=require`, SUPABASE_DB_CA: CA,
  }), /sslmode não permitido/);
});

test('configuração recusa verify-full sem CA fixada', () => {
  assert.throws(() => configDoBanco({ SUPABASE_BUILD_DB_URL: URL_OK }), /SUPABASE_DB_CA/);
});

test('sslmode=disable só vale em loopback com a flag de teste local', () => {
  const local = 'postgresql://build_publico:x@127.0.0.1:5544/catalogo_alvo?sslmode=disable';
  assert.throws(() => configDoBanco({ SUPABASE_BUILD_DB_URL: local }), /sslmode não permitido/);
  assert.throws(() => configDoBanco({ SUPABASE_BUILD_DB_URL: local.replace('127.0.0.1', 'db.exemplo.com'), SPF_TESTE_BANCO_LOCAL: '1' }), /sslmode não permitido/);
  const cfg = configDoBanco({ SUPABASE_BUILD_DB_URL: local, SPF_TESTE_BANCO_LOCAL: '1' });
  assert.equal(cfg.modo, 'disable');
  assert.equal(cfg.banco, 'catalogo_alvo');
});

test('erros de configuração não revelam a senha', () => {
  for (const env of [
    { SUPABASE_BUILD_DB_URL: 'postgresql://build_publico:SENHA-SECRETA@[::1' },
    { SUPABASE_BUILD_DB_URL: 'postgresql://postgres:SENHA-SECRETA@db.exemplo.com/postgres', SUPABASE_DB_CA: CA },
    { SUPABASE_BUILD_DB_URL: 'postgresql://build_publico:SENHA-SECRETA@db.exemplo.com/postgres?sslmode=require' },
  ]) {
    try { configDoBanco(env); assert.fail('deveria recusar'); } catch (e) {
      assert.ok(!e.message.includes('SENHA-SECRETA'), e.message);
    }
  }
});

test('validação aceita slugs no formato esperado', () => {
  const g = validarSlugs([['categoria', 'eletronicos'], ['regiao', '25-de-marco'], ['fornecedor', 'loja-1']]);
  assert.deepEqual(g.regiao, [{ slug: '25-de-marco' }]);
  assert.equal(g.fornecedor.length, 1);
});

test('validação recusa slug com caminho, maiúscula ou tipo desconhecido', () => {
  for (const linhas of [
    [['categoria', 'x'], ['regiao', 'y'], ['fornecedor', '../etc']],
    [['categoria', 'x'], ['regiao', 'Brás']],
    [['categoria', 'x'], ['regiao', 'y'], ['admin', 'z']],
  ]) {
    assert.throws(() => validarSlugs(linhas), /formato esperado/);
  }
});

test('validação recusa resposta sem categorias ou bairros (não publica site vazio)', () => {
  assert.throws(() => validarSlugs([['regiao', 'bras']]), /vieram vazios/);
  assert.throws(() => validarSlugs([['categoria', 'x']]), /vieram vazios/);
});

test('fixture local segue as mesmas regras do catalogo_slugs()', () => {
  const g = slugsDoFixture({
    categories: [{ slug: 'ativa', status: 'active' }, { slug: 'oculta', status: 'inactive' }],
    regions: [{ slug: 'bras' }],
    suppliers: [
      { slug: 'aprovado', approval_status: 'approved', is_demo: false },
      { slug: 'pendente', approval_status: 'pending', is_demo: false },
      { slug: 'demo', approval_status: 'approved', is_demo: true },
      { slug: 'sem-flag', approval_status: 'approved', is_demo: null },
    ],
  });
  assert.deepEqual(g.categoria.map((c) => c.slug), ['ativa']);
  assert.deepEqual(g.fornecedor.map((s) => s.slug), ['aprovado']);
});

// Teste de integração opcional: só roda com um banco de teste acessível (ver docs/proposta-protecao-catalogo.md).
const URL_TESTE = process.env.SPF_TESTE_BANCO_URL;
test('integração: leitura de slugs no banco de teste', { skip: !URL_TESTE }, async () => {
  const { lerSlugsDoCatalogo } = await import('../scripts/pg-slugs.mjs');
  const g = await lerSlugsDoCatalogo({ SUPABASE_BUILD_DB_URL: URL_TESTE, SPF_TESTE_BANCO_LOCAL: '1' });
  assert.ok(g.categoria.length > 0 && g.regiao.length > 0);
});
