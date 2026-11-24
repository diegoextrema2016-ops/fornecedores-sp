import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../js/rastreamento.js';
import { META } from '../js/config.js';
import { mostraAvisoDeCookies, abreAvisoDeCookies } from '../js/consentimento.js';

const lerFonte = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');
const PIXEL_REAL = '1825652548675496';
const PROD = 'https://fornecedoresdesp.com.br';
const AGORA = 1_800_000_000_000;
const NOTA = R.NOTA_COMPRA_APROVADA;
const ativa = { id: 'sub-1', status: 'active', amount: 29.9, paymentNote: NOTA };

// ---------- Módulo puro (Node) ----------

test('Pixel ID: configurado com o ID real da Meta', () => {
  assert.equal(META.pixelId, PIXEL_REAL);
  assert.equal(R.pixelConfigurado(), true);
  assert.equal(R.idDePixelValido('abc123'), false);
});

test('domínio: o domínio de produção e seu www são autorizados; o resto não', () => {
  assert.equal(R.dominioAutorizado('fornecedoresdesp.com.br'), true);
  assert.equal(R.dominioAutorizado('www.fornecedoresdesp.com.br'), true);
  for (const h of ['localhost', '127.0.0.1', 'fornecedores-pr-12.vercel.app', 'fornecedoresdesp.com.br.evil.test', '']) {
    assert.equal(R.dominioAutorizado(h), false, h);
  }
});

test('pixel: bloqueado sem consentimento ou fora do domínio, mesmo com ID válido', () => {
  assert.equal(R.pixelHabilitado({ pixelId: PIXEL_REAL, consentimento: null, hostname: 'fornecedoresdesp.com.br' }), false);
  assert.equal(R.pixelHabilitado({ pixelId: PIXEL_REAL, consentimento: 'recusado', hostname: 'fornecedoresdesp.com.br' }), false);
  assert.equal(R.pixelHabilitado({ pixelId: PIXEL_REAL, consentimento: 'aceito', hostname: 'localhost' }), false);
  assert.equal(R.pixelHabilitado({ pixelId: PIXEL_REAL, consentimento: 'aceito', hostname: 'fornecedores-pr-12.vercel.app' }), false);
  assert.equal(R.pixelHabilitado({ pixelId: '', consentimento: 'aceito', hostname: 'fornecedoresdesp.com.br' }), false);
});

test('pixel: liga só com ID válido, consentimento aceito e domínio de produção', () => {
  assert.equal(R.pixelHabilitado({ pixelId: PIXEL_REAL, consentimento: 'aceito', hostname: 'fornecedoresdesp.com.br' }), true);
});

test('URL enviada à Meta: sem query nem hash', () => {
  const loc = { origin: PROD, pathname: '/fornecedores', search: '?q=termo', hash: '#access_token=abc', href: `${PROD}/fornecedores?q=termo#access_token=abc` };
  assert.equal(R.urlLimpa(loc), `${PROD}/fornecedores`);
});

test('PageView: a mesma tela desenhada de novo em sequência não repete o evento', () => {
  const anterior = { caminho: '/planos', em: AGORA };
  assert.equal(R.deveRegistrarVisita(anterior, '/planos', AGORA + 200), false);
  assert.equal(R.deveRegistrarVisita(anterior, '/planos', AGORA + 5000), true);
  assert.equal(R.deveRegistrarVisita(anterior, '/guias', AGORA + 200), true);
  assert.equal(R.deveRegistrarVisita(null, '/site', AGORA), true);
});

test('ViewContent só nas páginas de apresentação e planos (home é /site)', () => {
  assert.deepEqual(R.eventosDaPagina('/site'), ['PageView', 'ViewContent']);
  assert.deepEqual(R.eventosDaPagina('/sobre'), ['PageView', 'ViewContent']);
  assert.deepEqual(R.eventosDaPagina('/planos'), ['PageView', 'ViewContent']);
  assert.deepEqual(R.eventosDaPagina('/conta'), ['PageView']);
  assert.deepEqual(R.eventosDaPagina('/guias/atacado-ou-varejo-diferencas'), ['PageView']);
});

// ---------- Purchase: só pagamento aprovado pelo webhook (Node) ----------

test('Purchase: dispara com a assinatura desta tentativa ativa e nota do webhook', () => {
  const pendente = { id: 'sub-1', token: 'tok-1', valor: 29.9, sandbox: false, em: AGORA };
  assert.deepEqual(R.escolheCompra({ pendente, assinaturas: [ativa], agora: AGORA }), { id: 'sub-1', valor: 29.9, token: 'tok-1' });
});

test('Purchase: não dispara em pendente ou cancelado', () => {
  const pendente = { id: 'sub-1', token: 'tok-1', valor: 29.9, sandbox: false, em: AGORA };
  for (const status of ['pending', 'cancelled']) {
    assert.equal(R.escolheCompra({ pendente, assinaturas: [{ ...ativa, status }], agora: AGORA }), null, status);
  }
});

test('Purchase: não dispara quando o administrador confirma Pix manualmente', () => {
  const pendente = { id: 'sub-1', token: 'tok-1', valor: 29.9, sandbox: false, em: AGORA };
  const manual = { ...ativa, paymentNote: 'Pix conferido pelo administrador em 21/11/2026' };
  assert.equal(R.escolheCompra({ pendente, assinaturas: [manual], agora: AGORA }), null);
});

test('Purchase: não dispara sem a nota do webhook (vazia ou de outra origem)', () => {
  const pendente = { id: 'sub-1', token: 'tok-1', valor: 29.9, sandbox: false, em: AGORA };
  for (const paymentNote of ['', undefined, 'Pagamento aprovado']) {
    assert.equal(R.escolheCompra({ pendente, assinaturas: [{ ...ativa, paymentNote }], agora: AGORA }), null, String(paymentNote));
  }
});

test('Purchase: a nota do webhook é a mesma constante usada pelo rastreamento', () => {
  assert.ok(lerFonte('api/mercadopago/webhook.js').includes(`'${NOTA}'`), 'o webhook grava a nota que o rastreamento espera');
});

test('Purchase: não dispara sem tentativa guardada, para compra em outro aparelho', () => {
  assert.equal(R.escolheCompra({ pendente: null, assinaturas: [ativa], agora: AGORA }), null);
});

test('Purchase: não dispara para a assinatura de outra tentativa, nem já rastreada', () => {
  const outra = { id: 'outra', valor: 29.9, em: AGORA };
  assert.equal(R.escolheCompra({ pendente: outra, assinaturas: [ativa], agora: AGORA }), null);
  const mesma = { id: 'sub-1', valor: 29.9, em: AGORA };
  assert.equal(R.escolheCompra({ pendente: mesma, assinaturas: [ativa], jaRastreadas: ['sub-1'], agora: AGORA }), null);
});

test('Purchase: tentativa com mais de 48 horas não conta; valor vem do servidor', () => {
  const velha = { id: 'sub-1', valor: 29.9, em: AGORA - 49 * 60 * 60 * 1000 };
  assert.equal(R.escolheCompra({ pendente: velha, assinaturas: [ativa], agora: AGORA }), null);
  const pendente = { id: 'sub-1', token: 'tok-1', valor: 29.9, sandbox: false, em: AGORA };
  assert.equal(R.escolheCompra({ pendente, assinaturas: [{ ...ativa, amount: 0 }], agora: AGORA }), null);
});

test('Sandbox: tentativa marcada como teste nunca gera Purchase, mesmo com assinatura ativa e nota do webhook', () => {
  const pendente = { id: 'sub-1', valor: 29.9, sandbox: true, em: AGORA };
  assert.equal(R.escolheCompra({ pendente, assinaturas: [ativa], agora: AGORA }), null);
});

test('Sandbox: sem indicador claro (ausente, nulo ou texto), não gera Purchase', () => {
  for (const sandbox of [undefined, null, 'false', 0, '']) {
    const pendente = { id: 'sub-1', valor: 29.9, sandbox, em: AGORA };
    assert.equal(R.escolheCompra({ pendente, assinaturas: [ativa], agora: AGORA }), null, String(sandbox));
  }
  const antiga = { id: 'sub-1', valor: 29.9, em: AGORA };
  assert.equal(R.escolheCompra({ pendente: antiga, assinaturas: [ativa], agora: AGORA }), null, 'tentativa sem o campo');
});

test('Sandbox: guardaCheckout grava o indicador e, sem ele, assume teste', () => {
  // No Node o módulo não fica ativo (sem consentimento), então a gravação é conferida pelo código-fonte.
  const fonte = lerFonte('js/rastreamento.js');
  assert.ok(fonte.includes('export function guardaCheckout({ id, valor, sandbox = true }'), 'padrão fecha: sem indicador é teste');
  assert.ok(fonte.includes('JSON.stringify({ id, token, valor, sandbox, em: Date.now() })'));
});

test('Sandbox: api.js e paywall.js passam o indicador; resposta sem ele vira teste', () => {
  const api = lerFonte('js/api.js');
  assert.ok(api.includes("sandbox: corpo.sandbox !== false"), 'ausência do campo vira teste');
  const paywall = lerFonte('js/paywall.js');
  assert.ok(paywall.includes('const { url, id, sandbox } = await api.criarPagamento(plano.id);'));
  assert.ok(paywall.includes('guardaCheckout({ id, valor: plano.price, sandbox })'));
});

test('Sandbox: servidor só acrescenta o indicador, sem mudar a escolha da URL', () => {
  const fonte = lerFonte('api/mercadopago/criar-pagamento.js');
  assert.ok(fonte.includes('const url = destino.sandbox ? preferencia.sandbox_init_point : preferencia.init_point;'), 'escolha da URL intacta');
  assert.ok(fonte.includes("const sandbox = destino.sandbox === true || String(process.env.MP_ACCESS_TOKEN).startsWith('TEST-');"));
  assert.ok(fonte.includes('return res.status(200).json({ url, id: assinatura.id, sandbox });'));
  assert.ok(!/status: 'active'|paymentNote|payment_note: 'Mercado Pago: pagamento aprovado'/.test(fonte.slice(fonte.indexOf('export default'))), 'nenhuma escrita de status no servidor');
});

test('dados do produto: BRL, nome e tipo fixos', () => {
  assert.deepEqual(R.dadosDoProduto(29.9), {
    value: 29.9, currency: 'BRL', content_name: 'Assinatura Fornecedores de SP', content_type: 'product',
  });
});

test('no Node (sem navegador) nada inicia e nada lança erro', () => {
  assert.equal(R.iniciaRastreamento(), false);
  assert.equal(R.rastreamentoAtivo(), false);
  assert.equal(R.confirmaCompra([]), null);
  R.paginaVista('/planos');
  R.guardaCheckout({ id: 'x', valor: 29.9 });
  mostraAvisoDeCookies();
  abreAvisoDeCookies();
  assert.equal(R.decideConsentimento('aceito', { caminho: '/planos' }), false);
});

// ---------- Ambiente simulado do navegador (estado compartilhado do módulo, em ordem) ----------

function ambiente({ url = `${PROD}/planos` } = {}) {
  const memoria = () => {
    const m = new Map();
    return {
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
  globalThis.window = {};
  globalThis.document = { scripts: [], createElement: () => ({}), head: { appendChild(el) { globalThis.document.scripts.push(el); } } };
  return loc;
}

function limpaAmbiente() {
  for (const k of ['localStorage', 'sessionStorage', 'location', 'history', 'window', 'document']) delete globalThis[k];
}

// SDK falso: registra cada chamada e a URL que estava na barra no instante do envio.
function sdkFalso() {
  const chamadas = [];
  const fbq = (...args) => { chamadas.push({ args, href: location.href }); };
  return { fbq, chamadas };
}
const nomeDoEvento = (c) => (c.args[0] === 'track' ? c.args[1] : c.args[0]);

let SDK = null;

test('fora do domínio de produção nada inicia, mesmo com consentimento aceito', () => {
  for (const url of ['http://localhost:8091/planos', 'https://fornecedores-pr-12.vercel.app/planos', 'https://www.fornecedoresdesp.com.br.evil.test/planos']) {
    ambiente({ url });
    localStorage.setItem('spf:rastreamento', 'aceito');
    assert.equal(R.iniciaRastreamento(), false, url);
    assert.equal(R.rastreamentoAtivo(), false, url);
    assert.equal(document.scripts.length, 0, `nenhum script do SDK em ${url}`);
    assert.equal(R.rastreamentoNesteSite(), false, url);
  }
  limpaAmbiente();
});

test('sem consentimento em produção, nada carrega e nada de marketing é guardado', () => {
  ambiente();
  assert.equal(R.iniciaRastreamento(), false);
  R.guardaCheckout({ id: 'sub-x', valor: 29.9 });
  assert.equal(localStorage.getItem('spf:mkt:checkout-pendente'), null, 'sem consentimento não guarda a tentativa');
  assert.equal(document.scripts.length, 0);
  limpaAmbiente();
});

test('aceito em produção: SDK carrega, eventos pendentes saem com URL limpa e a barra é restaurada', async () => {
  const url = `${PROD}/planos?q=termo-privado#access_token=tok123`;
  const loc = ambiente({ url });
  localStorage.setItem('spf:rastreamento', 'aceito');
  assert.equal(R.iniciaRastreamento(), true);
  assert.equal(document.scripts.length, 1);
  assert.equal(document.scripts[0].src, 'https://connect.facebook.net/pt_BR/fbevents.js');
  R.paginaVista('/planos');
  await R.aguardaRastreamento(50); // SDK ainda não chegou: a espera termina pelo limite, sem travar a página
  SDK = sdkFalso();
  assert.equal(SDK.chamadas.length, 0, 'nada é enviado antes do SDK carregar');
  R.sdkCarregado(SDK.fbq);
  assert.deepEqual(SDK.chamadas.map(nomeDoEvento), ['init', 'PageView', 'ViewContent']);
  assert.equal(SDK.chamadas[0].args[1], PIXEL_REAL);
  for (const c of SDK.chamadas) {
    assert.equal(c.href, `${PROD}/planos`, 'URL sem query nem hash no envio');
    assert.ok(!c.href.includes('termo-privado') && !c.href.includes('tok123'));
  }
  assert.equal(loc.href, url, 'a barra volta exatamente como estava');
});

test('SDK carregado: próximas navegações saem limpas, a busca continua na barra e a deduplicação vale', () => {
  // Na SPA, a barra já mostra a nova página antes de paginaVista ser chamado. A busca não pode sair para a Meta.
  const loc = ambiente({ url: `${PROD}/fornecedores?q=termo-privado` });
  let antes = SDK.chamadas.length;
  R.paginaVista('/fornecedores');
  assert.deepEqual(SDK.chamadas.slice(antes).map(nomeDoEvento), ['PageView']);
  assert.equal(SDK.chamadas[antes].href, `${PROD}/fornecedores`);
  assert.equal(loc.href, `${PROD}/fornecedores?q=termo-privado`, 'a busca não é perdida na barra');

  loc.href = `${PROD}/sobre?ref=anuncio`; // navegação para /sobre
  antes = SDK.chamadas.length;
  R.paginaVista('/sobre');
  assert.deepEqual(SDK.chamadas.slice(antes).map(nomeDoEvento), ['PageView', 'ViewContent']);
  for (const c of SDK.chamadas.slice(antes)) assert.equal(c.href, `${PROD}/sobre`);
  assert.equal(loc.href, `${PROD}/sobre?ref=anuncio`);

  const depois = SDK.chamadas.length;
  R.paginaVista('/sobre'); // mesma tela, logo em seguida
  assert.equal(SDK.chamadas.length, depois, 'PageView não repete');
  limpaAmbiente();
});

test('falha de segurança: se a URL não puder ser trocada, o evento não é enviado', () => {
  ambiente({ url: `${PROD}/planos?q=segredo` });
  const antes = SDK.chamadas.length;
  const original = history.replaceState;
  history.replaceState = () => { throw new Error('bloqueado'); };
  R.iniciaCheckout({ token: 'tok-falha', valor: 29.9 });
  history.replaceState = original;
  assert.equal(SDK.chamadas.length, antes, 'falha fechada: nada sai sem a URL limpa');
  limpaAmbiente();
});

test('InitiateCheckout, Purchase e deduplicação com URL limpa', () => {
  ambiente({ url: `${PROD}/conta?pagamento=aprovado&q=x#token=abc` });
  const antes = SDK.chamadas.length;
  const token = R.guardaCheckout({ id: 'sub-1', valor: 29.9, sandbox: false });
  assert.equal(typeof token, 'string', 'a tentativa recebe um identificador aleatório');
  R.iniciaCheckout({ token, valor: 29.9 });
  R.iniciaCheckout({ token, valor: 29.9 });
  const ic = SDK.chamadas.slice(antes).filter((c) => nomeDoEvento(c) === 'InitiateCheckout');
  assert.equal(ic.length, 1, 'InitiateCheckout não repete');
  assert.equal(ic[0].args[3].eventID, token, 'eventID é o identificador aleatório da tentativa');

  // Pendente e Pix manual não disparam Purchase.
  assert.equal(R.confirmaCompra([{ ...ativa, status: 'pending' }]), null);
  assert.equal(R.confirmaCompra([{ ...ativa, paymentNote: 'Pix conferido pelo administrador' }]), null);
  assert.equal(SDK.chamadas.filter((c) => nomeDoEvento(c) === 'Purchase').length, 0);

  // Webhook aprovou: Purchase uma vez.
  assert.deepEqual(R.confirmaCompra([ativa]), { id: 'sub-1', valor: 29.9, token });
  const purchase = SDK.chamadas.filter((c) => nomeDoEvento(c) === 'Purchase');
  assert.equal(purchase.length, 1);
  assert.equal(purchase[0].args[3].eventID, token, 'Purchase usa o mesmo identificador da tentativa');
  assert.equal(purchase[0].args[2].value, 29.9);
  assert.equal(purchase[0].args[2].currency, 'BRL');
  assert.equal(R.confirmaCompra([ativa]), null, 'recarregar a conta não repete');
  assert.equal(SDK.chamadas.filter((c) => nomeDoEvento(c) === 'Purchase').length, 1);

  for (const c of SDK.chamadas) assert.ok(!c.href.includes('?') && !c.href.includes('#'), c.href);
  limpaAmbiente();
});

test('rejeitar: para os eventos, apaga o armazenamento de marketing e não volta a ligar nesta página', () => {
  ambiente({ url: `${PROD}/planos` });
  const tokenRejeitado = R.guardaCheckout({ id: 'sub-2', valor: 29.9, sandbox: false });
  sessionStorage.setItem(`spf:mkt:ic:${tokenRejeitado}`, '1');
  localStorage.setItem('spf:mkt:compras-rastreadas', '["sub-0"]');
  assert.notEqual(localStorage.getItem('spf:mkt:checkout-pendente'), null);

  const antes = SDK.chamadas.length;
  assert.equal(R.decideConsentimento('recusado', { caminho: '/sobre' }), false);
  assert.equal(localStorage.getItem('spf:mkt:checkout-pendente'), null, 'tentativa de checkout apagada');
  assert.equal(localStorage.getItem('spf:mkt:compras-rastreadas'), null, 'compras contadas apagadas');
  assert.equal(sessionStorage.getItem(`spf:mkt:ic:${tokenRejeitado}`), null, 'InitiateCheckout da sessão apagado');
  assert.equal(localStorage.getItem('spf:rastreamento'), 'recusado', 'a escolha fica guardada');

  R.paginaVista('/sobre');
  R.iniciaCheckout({ token: 'tok-3', valor: 29.9 });
  assert.equal(R.confirmaCompra([ativa]), null);
  assert.equal(SDK.chamadas.length, antes, 'nenhum evento depois da recusa');
  assert.equal(R.iniciaRastreamento(), false, 'não liga de novo nesta página');
  limpaAmbiente();
});

// ---------- Código: pontos de integração ----------

test('InitiateCheckout dispara depois do servidor criar o pedido, não ao abrir /planos', () => {
  const paywall = lerFonte('js/paywall.js');
  const pagar = paywall.slice(paywall.indexOf('async function pagar'));
  assert.ok(pagar.indexOf('criarPagamento') < pagar.indexOf('iniciaCheckout'), 'checkout antes de criar o pedido');
  assert.ok(pagar.indexOf('iniciaCheckout') < pagar.indexOf('window.location.href'), 'evento antes do redirecionamento');
  assert.ok(pagar.includes('await sem(() => aguardaRastreamento(1200))'), 'espera o SDK antes de sair da página, sem deixar erro interromper');
  const planos = lerFonte('js/pages-public.js');
  const inicio = planos.indexOf('export function plansPage');
  assert.ok(!/iniciaCheckout/.test(planos.slice(inicio, inicio + 3000)), 'planos não dispara checkout');
});

test('Purchase só é verificado na tela da conta, a partir do status do banco', () => {
  assert.ok(lerFonte('js/pages-auth.js').includes('confirmaCompra(store.subscriptions.list())'));
  assert.ok(!/confirmaCompra|Purchase/.test(lerFonte('js/pagamento.js')), 'o aviso de retorno não dispara compra');
});

test('PageView é disparado na navegação da SPA, não na atualização com memória', () => {
  const app = lerFonte('js/app.js');
  assert.ok(/if \(!fromMemory\) paginaVista\(path\);/.test(app));
  assert.ok(app.indexOf('iniciaRastreamento();') < app.indexOf('\nrender();'), 'SDK inicia antes da primeira tela');
  assert.ok(app.includes('mostraAvisoDeCookies();'), 'aviso de cookies montado na inicialização');
});

test('servidor devolve o id do pedido (eventID e deduplicação)', () => {
  assert.ok(lerFonte('api/mercadopago/criar-pagamento.js').includes('res.status(200).json({ url, id: assinatura.id, sandbox })'));
});

test('dados enviados: o módulo não usa e-mail, CPF, telefone, id de usuário nem dados de contato', () => {
  const fonte = lerFonte('js/rastreamento.js').replace(/\/\/.*$/gm, '');
  for (const proibido of ['email', 'cpf', 'phone', 'whatsapp', 'user_id', 'external_id']) {
    assert.ok(!new RegExp(`\\b${proibido}\\b`, 'i').test(fonte), `proibido: ${proibido}`);
  }
});

test('armazenamento: preferência de cookies separada do marketing (spf:mkt:)', () => {
  const fonte = lerFonte('js/rastreamento.js');
  assert.ok(fonte.includes("CONSENTIMENTO_CHAVE = 'spf:rastreamento'"));
  assert.ok(fonte.includes("'spf:mkt:checkout-pendente'") && fonte.includes("'spf:mkt:compras-rastreadas'") && fonte.includes("'spf:mkt:ic:'"));
});

test('aviso só aparece no domínio de produção, com duas opções e texto aprovado', () => {
  const fonte = lerFonte('js/consentimento.js');
  assert.ok(fonte.includes('rastreamentoNesteSite()'), 'condicionado ao domínio de produção');
  assert.ok(fonte.includes("import { currentLocation } from './nav.js'") && fonte.includes('caminho: currentLocation().path'));
  assert.ok(fonte.includes('Este site utiliza cookies'));
  assert.ok(fonte.includes('Utilizamos cookies em nosso site para melhorar sua experiência, analisar o tráfego e medir o desempenho de nossos anúncios.'));
  assert.ok(fonte.includes('Você pode aceitar todos os cookies ou rejeitar os não essenciais.'));
  assert.ok(fonte.includes('href="/privacidade"') && fonte.includes('Política de Privacidade'));
  assert.ok(fonte.includes('data-cookie="aceito">Aceitar todos<') && fonte.includes('data-cookie="recusado">Rejeitar<'));
  assert.equal((fonte.match(/data-cookie=/g) || []).length, 2, 'exatamente duas opções');
  assert.ok(!/personaliz/i.test(fonte), 'nenhuma opção Personalizar');
});

test('CSP: libera somente os domínios da Meta que o pixel usa', () => {
  const cfg = JSON.parse(lerFonte('vercel.json'));
  const csp = cfg.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  const diretiva = (nome) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(nome + ' ')) || '';
  assert.ok(diretiva('script-src').includes('https://connect.facebook.net'));
  assert.ok(diretiva('img-src').includes('https://www.facebook.com'));
  assert.ok(diretiva('connect-src').includes('https://www.facebook.com'));
  assert.ok(!/facebook[^ ]*\*|\*\.facebook/.test(csp), 'sem curinga da Meta');
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp), 'sem script inline');
  assert.ok(csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"), 'demais proteções preservadas');
});

test('política: descreve o Meta Pixel, o que é enviado, os cookies, a escolha e o Mercado Pago', () => {
  // pages-public.js importa o cliente do Supabase por URL, então o teste confere o código-fonte.
  const fonte = lerFonte('js/pages-public.js');
  const politica = fonte.slice(fonte.indexOf('export function privacyPage'), fonte.indexOf('export function termsPage'));
  assert.ok(politica.includes('Cookies e armazenamento no seu navegador'));
  assert.ok(politica.includes('Meta Pixel'));
  assert.ok(politica.includes('remove do endereço da página os termos de busca, os parâmetros e os tokens'), 'URL sanitizada antes do envio');
  assert.ok(politica.includes('identificador aleatório, que não é o número do pedido'), 'eventID não é ID interno');
  assert.ok(politica.includes('apagada depois de 48 horas'), 'validade de 48 h descrita corretamente');
  assert.ok(politica.includes('Estornos e contestações feitos depois da compra não são informados à Meta'), 'limite de estornos declarado');
  assert.ok(politica.includes('_fbc'), 'cookies de marketing que o site remove');
  assert.ok(politica.includes('Google Fonts'), 'Google Fonts declarado');
  assert.ok(politica.includes('Assinatura Fornecedores de SP'), 'nome real do produto');
  assert.ok(politica.includes('endereço IP'), 'dado técnico enviado automaticamente');
  assert.ok(politica.includes('_fbp'));
  assert.ok(politica.includes('Mercado Pago'));
  assert.ok(politica.includes('rejeitar os não essenciais'));
  assert.ok(politica.includes('data-abrir-cookies'), 'botão para alterar a escolha');
  assert.ok(!politica.includes('política de modelo'), 'aviso de modelo removido da política publicada');
});
