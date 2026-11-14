import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAuthReturn, authReturnErrorMessage, validateNewPassword } from '../js/auth-return.js';

test('sem nada de autenticação no endereço, não há retorno', () => {
  assert.equal(parseAuthReturn(''), null);
  assert.equal(parseAuthReturn('#/fornecedor/x'), null);
});

test('retorno de sucesso identifica o tipo da ação', () => {
  assert.deepEqual(parseAuthReturn('#access_token=abc&type=recovery&expires_in=3600'), { kind: 'success', type: 'recovery' });
  assert.deepEqual(parseAuthReturn('#access_token=abc&type=signup'), { kind: 'success', type: 'signup' });
  assert.deepEqual(parseAuthReturn('#access_token=abc&type=email_change'), { kind: 'success', type: 'email_change' });
});

test('tipo desconhecido não é aceito', () => {
  assert.deepEqual(parseAuthReturn('#access_token=abc&type=admin_hack'), { kind: 'success', type: null });
});

test('link expirado vira erro otp_expired com a descrição', () => {
  const ret = parseAuthReturn('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&type=recovery');
  assert.equal(ret.kind, 'error');
  assert.equal(ret.errorCode, 'otp_expired');
  assert.equal(ret.type, 'recovery');
  assert.match(authReturnErrorMessage(ret), /expirou/);
});

test('erro sem código cai em access_denied (link inválido ou já usado)', () => {
  const ret = parseAuthReturn('#error=access_denied');
  assert.equal(ret.errorCode, 'access_denied');
  assert.match(authReturnErrorMessage(ret), /inválido ou já foi usado/);
});

test('mensagem de erro não existe para retorno de sucesso', () => {
  assert.equal(authReturnErrorMessage({ kind: 'success', type: 'signup' }), null);
  assert.equal(authReturnErrorMessage(null), null);
});

test('nova senha exige 8 caracteres e confirmação igual', () => {
  assert.match(validateNewPassword('curta', 'curta'), /8 caracteres/);
  assert.match(validateNewPassword('senha-forte-1', 'senha-forte-2'), /não coincidem/);
  assert.equal(validateNewPassword('senha-forte-1', 'senha-forte-1'), null);
});
