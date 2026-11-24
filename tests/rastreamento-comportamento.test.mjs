// Testes de comportamento do rastreamento: executam o módulo com um navegador simulado (location, history,
// storage, document.cookie e SDK falso). Cada teste carrega uma instância nova do módulo, então o estado
// de um cenário não contamina o próximo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const PROD = 'https://fornecedoresdesp.com.br';
const PIXEL = '1825652548675496';
const CONSENTIMENTO = 'spf:rastreamento';
const CHECKOUT = 'spf:mkt:checkout-pendente';
const COMPRAS = 'spf:mkt:compras-rastreadas';

let versao = 0;
// Instância nova do módulo (import com query diferente gera outro módulo, com estado próprio).
const fresco = () => import(`../js/rastreamento.js?cenario=${++versao}`);

function mundo({ url = `${PROD}/planos` } = {}) {
  const memoria = () => {
    const m = new Map();
    return {
      _m: m,
      get length() { return m.size; },
      key: (i) => [...m.keys()][i] ?? null,
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  };
  globalThis.localStorage = memoria();
  globalThis.sessionStorage = memoria();
  const loc = { href: url };
  const u = () => new URL(loc.href);
  for (const p of ['origin', 'pathname', 'hostname', 'search', 'hash']) {
    Object.defineProperty(loc, p, { get: () => u()[p], enumerable: true });
  }
  globalThis.location = loc;
  globalThis.history = {
    state: null,
    replaceState(state, _titulo, nova) { loc.href = new URL(nova, loc.href).href; },
  };
  const scripts = [];
  const cookies = [];
  globalThis.document = {
    head: { appendChild: (el) => scripts.push(el) },
    createElement: () => ({}),
    get cookie() { return ''; },
    set cookie(valor) { cookies.push(valor); },
  };
  globalThis.window = {};
  return { loc, scripts, cookies };
}

// SDK falso: registra cada chamada e a URL que estava na barra no instante do envio.
function sdk() {
  const chamadas = [];
  const fbq = (...args) => { chamadas.push({ args, href: location.href }); };
  return { fbq, chamadas };
}
const nomes = (chamadas) => chamadas.map((c) => (c.args[0] === 'track' ? c.args[1] : c.args[0]));

const ativa = (id, extra = {}) => ({ id, status: 'active', amount: 29.9, paymentNote: 'Mercado Pago: pagamento aprovado', ...extra });

// ---------- Consentimento e inicialização ----------

test('sem consentimento: nenhum script, nenhum armazenamento de marketing e nenhum envio', async () => {
  const R = await fresco();
  const m = mundo();
  assert.equal(R.iniciaRastreamento(), false);
  assert.equal(R.guardaCheckout({ id: 'sub-1', valor: 29.9, sandbox: false }), null);
  R.paginaVista('/planos');
  assert.equal(m.scripts.length, 0, 'SDK não carrega sem aceite');
  assert.equal(localStorage._m.size, 0, 'nada gravado antes do consentimento');
  assert.equal(sessionStorage._m.size, 0);
});

test('aceito: carrega o SDK, envia init com o ID do pixel e PageView/ViewContent na navegação', async () => {
  const R = await fresco();
  const m = mundo({ url: `${PROD}/planos` });
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  assert.equal(R.iniciaRastreamento(), true);
  assert.equal(m.scripts.length, 1);
  assert.equal(m.scripts[0].src, 'https://connect.facebook.net/pt_BR/fbevents.js');
  const s = sdk();
  R.sdkCarregado(s.fbq);
  assert.deepEqual(nomes(s.chamadas), ['init']);
  assert.equal(s.chamadas[0].args[1], PIXEL);
  R.paginaVista('/planos');
  assert.deepEqual(nomes(s.chamadas), ['init', 'PageView', 'ViewContent']);
});

test('rejeitar com SDK já carregado: nenhum evento depois da decisão', async () => {
  const R = await fresco();
  mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  const s = sdk();
  R.sdkCarregado(s.fbq);
  const antes = s.chamadas.length;
  R.decideConsentimento('recusado', { caminho: '/sobre' });
  R.paginaVista('/sobre');
  R.iniciaCheckout({ token: 'tok-x', valor: 29.9 });
  R.confirmaCompra([ativa('sub-1')]);
  assert.equal(s.chamadas.length, antes, 'bloqueio imediato, sem janela até a recarga');
});

test('rejeitar apaga o marketing e os cookies _fbp/_fbc, e preserva preferência e login', async () => {
  const R = await fresco();
  const m = mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  localStorage.setItem('sb-auth-token', 'sessao-login');
  R.iniciaRastreamento();
  const s = sdk();
  R.sdkCarregado(s.fbq);
  R.guardaCheckout({ id: 'sub-1', valor: 29.9, sandbox: false });
  sessionStorage.setItem('spf:mkt:ic:tok-qualquer', '1');
  localStorage.setItem(COMPRAS, '["sub-0"]');

  R.decideConsentimento('recusado');

  assert.equal(localStorage.getItem(CHECKOUT), null, 'tentativa de checkout apagada');
  assert.equal(localStorage.getItem(COMPRAS), null, 'compras contadas apagadas');
  assert.equal(sessionStorage.getItem('spf:mkt:ic:tok-qualquer'), null, 'InitiateCheckout da sessão apagado');
  assert.equal(localStorage.getItem(CONSENTIMENTO), 'recusado', 'a escolha fica guardada');
  assert.equal(localStorage.getItem('sb-auth-token'), 'sessao-login', 'login não é tocado');

  const apagados = m.cookies.filter((c) => /Max-Age=0/.test(c));
  for (const nome of ['_fbp', '_fbc']) {
    assert.ok(apagados.some((c) => c.startsWith(`${nome}=`) && c.includes('path=/')), `${nome} no caminho /`);
    assert.ok(apagados.some((c) => c.startsWith(`${nome}=`) && c.includes('; domain=fornecedoresdesp.com.br')), `${nome} no domínio do site`);
    assert.ok(apagados.some((c) => c.startsWith(`${nome}=`) && c.includes('; domain=.fornecedoresdesp.com.br')), `${nome} no domínio apex`);
  }
  assert.ok(m.cookies.every((c) => /^_fb[pc]=/.test(c)), 'nenhum outro cookie é alterado');
});

test('quem já rejeitou: ao abrir o site de novo, o marketing e os cookies são apagados e nada liga', async () => {
  const R = await fresco();
  const m = mundo();
  localStorage.setItem(CONSENTIMENTO, 'recusado');
  localStorage.setItem(CHECKOUT, JSON.stringify({ id: 'sub-1', token: 'tok', valor: 29.9, sandbox: false, em: Date.now() }));
  assert.equal(R.iniciaRastreamento(), false);
  assert.equal(localStorage.getItem(CHECKOUT), null);
  assert.ok(m.cookies.some((c) => c.startsWith('_fbp=')));
  assert.equal(m.scripts.length, 0);
});

test('aceitar e rejeitar antes do SDK carregar: a fila não é enviada quando o SDK chega', async () => {
  const R = await fresco();
  mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  R.decideConsentimento('recusado');
  const s = sdk();
  R.sdkCarregado(s.fbq);
  assert.equal(s.chamadas.length, 0, 'nada sai depois da rejeição');
});

test('aceitar de novo depois de rejeitar, sem recarregar, volta a enviar', async () => {
  const R = await fresco();
  mundo({ url: `${PROD}/planos` });
  R.decideConsentimento('recusado');
  const s = sdk();
  R.sdkCarregado(s.fbq);
  assert.equal(R.decideConsentimento('aceito', { caminho: '/planos' }), true);
  assert.ok(nomes(s.chamadas).includes('PageView'));
});

// ---------- Identificadores e sanitização ----------

test('eventID é aleatório por tentativa e nunca contém IDs internos', async () => {
  const R = await fresco();
  mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  const s = sdk();
  R.sdkCarregado(s.fbq);
  const interno = 'a1b2c3d4-0000-4000-8000-00000000abcd';
  const t1 = R.guardaCheckout({ id: interno, valor: 29.9, sandbox: false });
  const t2 = R.guardaCheckout({ id: interno, valor: 29.9, sandbox: false });
  assert.match(t1, /^[0-9a-f-]{32,36}$/i);
  assert.notEqual(t1, t2, 'cada tentativa tem identificador próprio');
  R.iniciaCheckout({ token: t1, valor: 29.9 });
  const ic = s.chamadas.find((c) => c.args[1] === 'InitiateCheckout');
  assert.equal(ic.args[3].eventID, t1);
  assert.ok(!JSON.stringify(s.chamadas).includes(interno), 'nenhum ID interno vai para a Meta');
  assert.ok(!JSON.stringify(s.chamadas).includes('sub-'), 'nenhum ID de assinatura vai para a Meta');
});

test('sanitização: nenhum envio tem query ou hash, e a barra volta exatamente como estava', async () => {
  const R = await fresco();
  const original = `${PROD}/fornecedores?q=termo-secreto&token=abc#access_token=xyz`;
  const m = mundo({ url: original });
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  const s = sdk();
  R.sdkCarregado(s.fbq);
  R.paginaVista('/fornecedores');
  assert.ok(s.chamadas.length >= 2);
  for (const c of s.chamadas) assert.equal(c.href, `${PROD}/fornecedores`, c.args[1]);
  assert.equal(m.loc.href, original, 'a busca do usuário não é perdida');
});

test('falha ao trocar o endereço: nada é enviado (falha fechada)', async () => {
  const R = await fresco();
  mundo({ url: `${PROD}/planos?q=segredo` });
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  const s = sdk();
  R.sdkCarregado(s.fbq);
  const antes = s.chamadas.length;
  history.replaceState = () => { throw new Error('bloqueado'); };
  R.paginaVista('/sobre');
  R.iniciaCheckout({ token: 'tok-z', valor: 29.9 });
  assert.equal(s.chamadas.length, antes);
});

// ---------- Isolamento de erros ----------

test('erros do SDK nunca chegam ao site', async () => {
  const R = await fresco();
  mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  const quebrado = () => { throw new Error('SDK quebrado'); };
  R.sdkCarregado(quebrado);
  assert.doesNotThrow(() => R.paginaVista('/planos'));
  assert.doesNotThrow(() => R.guardaCheckout({ id: 'sub-1', valor: 29.9, sandbox: false }));
  assert.doesNotThrow(() => R.iniciaCheckout({ token: 'tok', valor: 29.9 }));
  assert.doesNotThrow(() => R.confirmaCompra([ativa('sub-1')]));
  assert.doesNotThrow(() => R.decideConsentimento('recusado'));
});

test('erros de armazenamento não interrompem o checkout', async () => {
  const R = await fresco();
  mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  const s = sdk();
  R.sdkCarregado(s.fbq);
  const quebrado = {
    setItem() { throw new Error('quota'); },
    getItem() { throw new Error('bloqueado'); },
    removeItem() { throw new Error('bloqueado'); },
  };
  let token;
  assert.doesNotThrow(() => { token = R.guardaCheckout({ id: 'sub-1', valor: 29.9, sandbox: false }, quebrado); });
  assert.equal(typeof token, 'string');
  assert.doesNotThrow(() => R.iniciaCheckout({ token, valor: 29.9 }));
  assert.doesNotThrow(() => R.confirmaCompra([]));
});

test('SDK bloqueado: a espera termina na hora, sem esperar o tempo cheio', async () => {
  const R = await fresco();
  const m = mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  const inicio = Date.now();
  const espera = R.aguardaRastreamento(1200);
  m.scripts[0].onerror();
  await espera;
  assert.ok(Date.now() - inicio < 500, `esperou ${Date.now() - inicio} ms`);
});

test('SDK lento: a espera termina no limite, sem travar a página', async () => {
  const R = await fresco();
  mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  const inicio = Date.now();
  await R.aguardaRastreamento(60);
  assert.ok(Date.now() - inicio >= 40 && Date.now() - inicio < 1000);
});

// ---------- Perda e duplicidade ----------

test('Purchase: sem SDK, a tentativa continua guardada até o envio real', async () => {
  const R = await fresco();
  mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  const token = R.guardaCheckout({ id: 'sub-1', valor: 29.9, sandbox: false });
  R.confirmaCompra([ativa('sub-1')]);
  assert.notEqual(localStorage.getItem(CHECKOUT), null, 'não apaga antes do envio');
  assert.equal(localStorage.getItem(COMPRAS), null, 'não marca como contada antes do envio');
  const s = sdk();
  R.sdkCarregado(s.fbq);
  const compras = s.chamadas.filter((c) => c.args[1] === 'Purchase');
  assert.equal(compras.length, 1);
  assert.equal(compras[0].args[3].eventID, token);
  assert.equal(localStorage.getItem(CHECKOUT), null);
  assert.deepEqual(JSON.parse(localStorage.getItem(COMPRAS)), ['sub-1']);
});

test('Purchase: entradas repetidas na fila geram um único evento', async () => {
  const R = await fresco();
  mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  R.guardaCheckout({ id: 'sub-1', valor: 29.9, sandbox: false });
  R.confirmaCompra([ativa('sub-1')]);
  R.confirmaCompra([ativa('sub-1')]);
  R.confirmaCompra([ativa('sub-1')]);
  const s = sdk();
  R.sdkCarregado(s.fbq);
  assert.equal(nomes(s.chamadas).filter((n) => n === 'Purchase').length, 1);
  R.confirmaCompra([ativa('sub-1')]);
  assert.equal(nomes(s.chamadas).filter((n) => n === 'Purchase').length, 1, 'nova conferência não repete');
});

test('InitiateCheckout: a marca de enviado só é gravada depois do envio', async () => {
  const R = await fresco();
  mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  const token = R.guardaCheckout({ id: 'sub-1', valor: 29.9, sandbox: false });
  R.iniciaCheckout({ token, valor: 29.9 });
  assert.equal(sessionStorage.getItem(`spf:mkt:ic:${token}`), null);
  const s = sdk();
  R.sdkCarregado(s.fbq);
  assert.equal(sessionStorage.getItem(`spf:mkt:ic:${token}`), '1');
  R.iniciaCheckout({ token, valor: 29.9 });
  assert.equal(nomes(s.chamadas).filter((n) => n === 'InitiateCheckout').length, 1);
});

test('InitiateCheckout sem tentativa (token ausente) não envia nada', async () => {
  const R = await fresco();
  mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  const s = sdk();
  R.sdkCarregado(s.fbq);
  const antes = s.chamadas.length;
  R.iniciaCheckout({ token: null, valor: 29.9 });
  assert.equal(s.chamadas.length, antes);
});

test('tentativa com mais de 48 horas é apagada ao iniciar', async () => {
  const R = await fresco();
  mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  localStorage.setItem(CHECKOUT, JSON.stringify({ id: 'sub-1', token: 't', valor: 29.9, sandbox: false, em: Date.now() - 49 * 3600e3 }));
  R.iniciaRastreamento();
  assert.equal(localStorage.getItem(CHECKOUT), null);
});

test('Purchase: a compra de outra tentativa não é contada por engano', async () => {
  const R = await fresco();
  mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  R.guardaCheckout({ id: 'sub-nova', valor: 29.9, sandbox: false });
  const s = sdk();
  R.sdkCarregado(s.fbq);
  // A assinatura antiga está ativa, mas não é a tentativa guardada.
  R.confirmaCompra([ativa('sub-antiga')]);
  assert.equal(nomes(s.chamadas).filter((n) => n === 'Purchase').length, 0);
});

test('Purchase: aceita o indicador de teste só em "sandbox: false" explícito', async () => {
  const R = await fresco();
  mundo();
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  R.iniciaRastreamento();
  R.guardaCheckout({ id: 'sub-1', valor: 29.9 });  // sem indicador: tratado como teste
  const s = sdk();
  R.sdkCarregado(s.fbq);
  assert.equal(R.confirmaCompra([ativa('sub-1')]), null);
  assert.equal(nomes(s.chamadas).filter((n) => n === 'Purchase').length, 0);
});

// ---------- Stub do Pixel (window.fbq antes do SDK) ----------

test('stub do Pixel: window.fbq existe antes do SDK e enfileira as chamadas até ele chegar', async () => {
  const R = await fresco();
  const m = mundo({ url: `${PROD}/planos` });
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  assert.equal(R.iniciaRastreamento(), true);
  assert.equal(m.scripts.length, 1, 'o SDK ainda é carregado uma vez');
  assert.equal(typeof window.fbq, 'function', 'window.fbq criado pelo stub');
  window.fbq('track', 'PageView');
  assert.equal(window.fbq.queue.length, 1, 'chamada antes do SDK fica na fila');
});

test('SDK real já presente (callMethod): não adiciona o script de novo', async () => {
  const R = await fresco();
  const m = mundo({ url: `${PROD}/planos` });
  localStorage.setItem(CONSENTIMENTO, 'aceito');
  const real = () => {};
  real.callMethod = () => {};
  window.fbq = real;
  assert.equal(R.iniciaRastreamento(), true);
  assert.equal(m.scripts.length, 0, 'nenhum script novo quando o SDK já está presente');
});
