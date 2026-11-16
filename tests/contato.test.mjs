import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validaContato, limpaContato, erroDeContato, LIMITES_CONTATO } from '../js/contato.js';

const boa = { nome: 'Ana Lima', email: 'ana@exemplo.com', assunto: 'Dúvida sobre o cadastro', mensagem: 'Gostaria de saber como atualizo meu cadastro.' };

test('contato: mensagem válida passa e sai normalizada', () => {
  const r = validaContato({ ...boa, nome: '  Ana   Lima ', email: ' ANA@Exemplo.com ' });
  assert.equal(r.ok, true);
  assert.equal(r.dados.nome, 'Ana Lima');
  assert.equal(r.dados.email, 'ana@exemplo.com');
});

test('contato: cada campo obrigatório tem mensagem própria', () => {
  const r = validaContato({ nome: 'A', email: 'sem-arroba', assunto: 'x', mensagem: 'curta' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['assunto', 'email', 'mensagem', 'nome']);
});

test('contato: respeita os tamanhos máximos e o limite de links', () => {
  assert.ok(validaContato({ ...boa, nome: 'n'.repeat(LIMITES_CONTATO.nome.max + 1) }).errors.nome);
  assert.ok(validaContato({ ...boa, assunto: 'a'.repeat(LIMITES_CONTATO.assunto.max + 1) }).errors.assunto);
  assert.ok(validaContato({ ...boa, mensagem: 'm'.repeat(LIMITES_CONTATO.mensagem.max + 1) }).errors.mensagem);
  assert.equal(validaContato({ ...boa, mensagem: 'Veja https://a.com e https://b.com, obrigado.' }).ok, true);
  assert.match(validaContato({ ...boa, mensagem: 'https://a.com https://b.com www.c.com spam' }).errors.mensagem, /links demais/);
});

test('contato: o campo-isca segue para o servidor, que descarta o envio', () => {
  assert.equal(limpaContato({ ...boa, site: 'http://robo' }).site, 'http://robo');
});

test('contato: só mensagens do banco (P0001) chegam à pessoa; o resto vira aviso genérico', () => {
  assert.equal(erroDeContato({ code: 'P0001', message: 'Você já enviou mensagens há pouco.' }), 'Você já enviou mensagens há pouco.');
  const generico = erroDeContato({ code: '42501', message: 'permission denied for table contact_messages' }, 'a@b.com');
  assert.ok(!/permission|contact_messages/.test(generico));
  assert.match(generico, /a@b\.com/);
});

test('migração 018: tabela fechada, envio só pela função e limites iguais aos do site', async () => {
  const sql = await readFile(new URL('../supabase/migration-018-mensagens-de-contato.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.contact_messages from public, anon, authenticated/);
  assert.ok(!/for insert/i.test(sql), 'ninguém grava direto na tabela');
  assert.equal((sql.match(/using \(public\.is_admin\(\)\)/g) || []).length, 3, 'ler, alterar e excluir: só administrador');
  assert.match(sql, /grant update \(read_at\)/);
  const L = LIMITES_CONTATO;
  for (const [campo, lim] of [['name', L.nome], ['email', L.email], ['subject', L.assunto], ['message', L.mensagem]]) {
    assert.match(sql, new RegExp(`char_length\\(${campo}\\) between ${lim.min} and ${lim.max}`));
  }
  assert.match(sql, /consume_rate_limit\('contato:ip:'/);
  assert.match(sql, /consume_rate_limit\('contato:email:'/);
});

test('página de contato não mostra mais o aviso técnico e não depende do programa de e-mail', async () => {
  const js = await readFile(new URL('../js/pages-public.js', import.meta.url), 'utf8');
  assert.ok(!/Nesta versão|Configure o envio/.test(js));
  assert.match(js, /api\.enviaContato\(/);
});
