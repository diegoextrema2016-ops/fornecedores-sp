import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { destinoValido, guardaDestino, leDestino, limpaDestino, destinoDepoisDoLogin, ROTA_DE_ENTRADA } from '../js/retorno.js';
import { avisoDoRetorno, pagamentoDesfeito } from '../js/pagamento.js';

const memoria = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('destino depois do login: só endereço interno do site', () => {
  for (const ok of ['/cadastro', '/planos', '/conta?pagamento=aprovado', '/fornecedor/loja-x', '/favoritos']) assert.equal(destinoValido(ok), true, ok);
  for (const ruim of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '', '/', '/login', '/registro', '/sair', '/conta/retorno', '/admin', '/admin/usuarios', '/a b', null, 42, '/' + 'x'.repeat(300)]) {
    assert.equal(destinoValido(ruim), false, String(ruim));
  }
});

test('destino fica guardado por até 2 horas e é descartado depois', () => {
  const s = memoria();
  assert.equal(guardaDestino('/cadastro', s, 1000), true);
  assert.equal(leDestino(s, 1000 + 60 * 60 * 1000), '/cadastro');
  assert.equal(leDestino(s, 1000 + 3 * 60 * 60 * 1000), '');
  limpaDestino(s);
  assert.equal(leDestino(s, 2000), '');
  assert.equal(guardaDestino('//evil.com', s, 1000), false);
  s.setItem('spf:voltar', '{"caminho":"//evil.com","em":1000}');
  assert.equal(leDestino(s, 2000), '', 'valor adulterado no navegador não é aceito');
  s.setItem('spf:voltar', 'não é json');
  assert.equal(leDestino(s, 2000), '');
});

test('depois do login: painel para o administrador, origem para os demais, conta para quem não assina', () => {
  assert.equal(destinoDepoisDoLogin({ admin: true, destino: '/cadastro' }), '/admin');
  assert.equal(destinoDepoisDoLogin({ destino: '/cadastro' }), '/cadastro');
  assert.equal(destinoDepoisDoLogin({ assinante: true }), '/favoritos');
  assert.equal(destinoDepoisDoLogin({}), '/conta');
  assert.equal(destinoDepoisDoLogin({ destino: '//evil.com' }), '/conta');
});

test('telas de entrada mantêm o destino; as outras o descartam', () => {
  for (const r of ['/login', '/registro', '/esqueci-senha', '/redefinir-senha', '/reenviar-confirmacao', '/conta/retorno']) assert.ok(ROTA_DE_ENTRADA.test(r), r);
  for (const r of ['/site', '/conta', '/cadastro', '/planos']) assert.ok(!ROTA_DE_ENTRADA.test(r), r);
});

test('volta do checkout: aprovado, pendente e recusado têm aviso próprio; o endereço não libera acesso', () => {
  assert.equal(avisoDoRetorno('aprovado', true).aguardando, false);
  assert.equal(avisoDoRetorno('aprovado', false).aguardando, true);
  assert.match(avisoDoRetorno('aprovado', false).texto, /confirmando/);
  assert.equal(avisoDoRetorno('pendente', false).aguardando, true);
  assert.equal(avisoDoRetorno('recusado').tom, 'erro');
  assert.equal(avisoDoRetorno('qualquer-coisa'), null);
  assert.equal(avisoDoRetorno(''), null);
});

test('estorno total e contestação encerram o acesso; aprovado e devolução parcial não', () => {
  assert.equal(pagamentoDesfeito({ status: 'refunded' }), true);
  assert.equal(pagamentoDesfeito({ status: 'charged_back' }), true);
  assert.equal(pagamentoDesfeito({ status: 'approved', status_detail: 'partially_refunded' }), false);
  assert.equal(pagamentoDesfeito({ status: 'pending' }), false);
  assert.equal(pagamentoDesfeito(null), false);
});

test('webhook: só cancela a assinatura liberada pelo mesmo pagamento, e só se ainda estiver ativa', async () => {
  const js = await readFile(new URL('../api/mercadopago/webhook.js', import.meta.url), 'utf8');
  assert.match(js, /pagamentoDesfeito\(pagamento\) && String\(linha\.mp_payment_id \|\| ''\) === String\(pagamento\.id\)/);
  assert.match(js, /subscriptions\?id=eq\.\$\{linha\.id\}&status=eq\.active/);
  assert.ok(js.indexOf('assinaturaMercadoPagoValida') < js.indexOf('pagamentoDesfeito(pagamento)'), 'a assinatura do aviso é conferida antes');
});

test('login e registro usam o destino guardado, não mais Favoritos fixo', async () => {
  const js = await readFile(new URL('../js/pages-account.js', import.meta.url), 'utf8');
  assert.ok(!/go\('\/favoritos'\)/.test(js));
  assert.equal((js.match(/destinoDepoisDoLogin\(/g) || []).length, 2);
});
