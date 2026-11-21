// Meta Pixel: visitas, páginas de oferta, início de checkout e compra confirmada.
//
// Regras:
// - Só funciona com ID configurado, consentimento "aceito" e no domínio autorizado pela própria build:
//   o de produção (build de produção) ou somente o host exato da prévia (build de Preview). Localhost,
//   outros previews da Vercel e qualquer outro domínio: o SDK não é carregado e nenhum evento é enviado.
// - PageView sai da navegação da SPA (js/app.js). O carregamento do SDK não envia PageView sozinho.
// - InitiateCheckout só dispara quando o servidor cria o pedido e devolve o link de pagamento (não ao abrir /planos).
// - Purchase só dispara quando a assinatura desta tentativa aparece "active" no banco com a nota gravada pelo
//   webhook do Mercado Pago. O retorno ?pagamento=aprovado, a ativação de Pix pelo administrador e os pagamentos
//   de teste (Sandbox) NÃO contam.
// - O identificador de cada evento (eventID) é aleatório, criado por tentativa de compra. Nunca contém IDs do banco.
// - A URL enviada à Meta é sempre limpa: sem query string (termos de busca) e sem hash (tokens).
// - Nenhum dado pessoal vai à Meta: só valor, moeda, nome do produto e tipo.
// - Qualquer falha do rastreamento fica isolada: nunca lança exceção para o checkout, o login ou a conta.
// - Rejeitar bloqueia o envio na hora, apaga os dados de marketing e remove os cookies _fbp e _fbc que o site
//   consegue apagar. Cookies gravados pela Meta em facebook.com não podem ser removidos pelo site.
// - Nada de marketing é guardado antes do consentimento.
//
// O módulo puro (funções sem efeito) fica no topo e é testado no Node. Os efeitos ficam embaixo e só
// rodam no navegador.
import { META, SITE } from './config.js';

// Único domínio de produção em que o pixel pode funcionar.
export const DOMINIO_PRODUCAO = 'fornecedoresdesp.com.br';
const WWW_PRODUCAO = `www.${DOMINIO_PRODUCAO}`;

// Preferência de cookies (necessária para respeitar a escolha).
export const CONSENTIMENTO_CHAVE = 'spf:rastreamento';
// Armazenamento de marketing: só é usado com consentimento e é apagado ao rejeitar.
const CHECKOUT_CHAVE = 'spf:mkt:checkout-pendente';
const COMPRAS_CHAVE = 'spf:mkt:compras-rastreadas';
const IC_PREFIXO = 'spf:mkt:ic:';
const VALIDADE_CHECKOUT_MS = 48 * 60 * 60 * 1000;
const JANELA_PAGEVIEW_MS = 1000;
const LIMITE_PENDENTES = 50;
const LIMITE_COMPRAS = 50;
const SDK_URL = 'https://connect.facebook.net/pt_BR/fbevents.js';
const NOME_PRODUTO = 'Assinatura Fornecedores de SP';
// Cookies de marketing que o site tenta remover ao rejeitar.
const COOKIES_DE_MARKETING = ['_fbp', '_fbc'];
// Nota gravada pelo webhook (api/mercadopago/webhook.js) só quando o Mercado Pago aprova o pagamento.
// Se o webhook mudar esta frase, o teste "Purchase: nota do webhook" avisa.
export const NOTA_COMPRA_APROVADA = 'Mercado Pago: pagamento aprovado';
// Páginas de apresentação e oferta: ViewContent. A página inicial é /site.
export const PAGINAS_DE_OFERTA = ['/site', '/sobre', '/planos'];

// ---------- Módulo puro ----------

// Pixel ID do Meta é numérico (normalmente 15 a 16 dígitos).
export function idDePixelValido(id) {
  return /^\d{10,20}$/.test(String(id || '').trim());
}

// Host do endereço base do site (SITE.url). Produção: www.fornecedoresdesp.com.br.
// Na build de Preview, scripts/build.mjs (aplicarPrevia) troca SITE.url pelo endereço desta própria prévia.
export function hostDoSite(endereco) {
  try { return new URL(String(endereco || '')).hostname; } catch { return ''; }
}

// Endereço base de uma prévia da Vercel: só a build de Preview usa um host *.vercel.app.
const ehHostDePrevia = (host) => host.endsWith('.vercel.app') && host !== WWW_PRODUCAO && host !== DOMINIO_PRODUCAO;

// Regra de domínio, decidida pelo endereço base que esta build usa (nunca por lista de hosts):
// - build de produção (endereço www.fornecedoresdesp.com.br): só o domínio de produção, como antes;
// - build de Preview (endereço *.vercel.app da própria prévia): só esse host exato. Outros *.vercel.app,
//   o domínio de produção e domínios externos continuam bloqueados;
// - qualquer outro endereço base (desenvolvimento local, por exemplo): nada é autorizado.
export function dominioAutorizado(hostname, endereco = SITE.url) {
  const base = hostDoSite(endereco);
  if (ehHostDePrevia(base)) return hostname === base;
  if (base === WWW_PRODUCAO || base === DOMINIO_PRODUCAO) return hostname === DOMINIO_PRODUCAO;
  return false;
}

const hostAtual = () => (typeof location !== 'undefined' ? location.hostname : '');

export function pixelHabilitado({ pixelId = META.pixelId, consentimento = null, hostname = hostAtual() } = {}) {
  return idDePixelValido(pixelId) && consentimento === 'aceito' && dominioAutorizado(hostname);
}

// Há ID configurado (independe do domínio): usado pelo texto da política.
export const pixelConfigurado = () => idDePixelValido(META.pixelId);

// Há ID configurado e estamos no domínio autorizado desta build (produção, ou o host exato da prévia): aqui o aviso aparece.
export const rastreamentoNesteSite = () => pixelConfigurado() && dominioAutorizado(hostAtual());

// Evita PageView duplicado quando a mesma tela é desenhada duas vezes em sequência.
export function deveRegistrarVisita(anterior, caminho, agora) {
  if (!anterior) return true;
  return !(anterior.caminho === caminho && agora - anterior.em < JANELA_PAGEVIEW_MS);
}

export function eventosDaPagina(caminho) {
  return PAGINAS_DE_OFERTA.includes(caminho) ? ['PageView', 'ViewContent'] : ['PageView'];
}

// Identificador aleatório para cada tentativa de compra. Não deriva de nenhum dado do banco.
export function novoIdentificador(cripto = globalThis.crypto) {
  if (cripto?.randomUUID) return cripto.randomUUID();
  const bytes = new Uint8Array(16);
  cripto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Compra confirmada: a assinatura pendente desta tentativa de checkout precisa estar ativa agora,
// com a nota gravada pelo webhook. Devolve os dados do evento Purchase ou null.
export function escolheCompra({ pendente, assinaturas = [], jaRastreadas = [], agora = Date.now() }) {
  if (!pendente || !pendente.id || !pendente.token) return null;
  // Pagamento de teste (Sandbox) nunca conta como compra: só "sandbox: false" explícito passa.
  if (pendente.sandbox !== false) return null;
  if (agora - Number(pendente.em || 0) > VALIDADE_CHECKOUT_MS) return null;
  if (jaRastreadas.includes(pendente.id)) return null;
  const assinatura = assinaturas.find((a) => a.id === pendente.id);
  if (!assinatura || assinatura.status !== 'active') return null;
  if (assinatura.paymentNote !== NOTA_COMPRA_APROVADA) return null;
  const valor = Number(assinatura.amount);
  if (!(valor > 0)) return null;
  return { id: assinatura.id, valor, token: pendente.token };
}

// Dados do evento de checkout: valor e moeda do produto.
export function dadosDoProduto(valor) {
  return { value: Number(valor), currency: 'BRL', content_name: NOME_PRODUTO, content_type: 'product' };
}

// Endereço sem query string nem hash: o único que pode sair da página em direção à Meta.
export function urlLimpa(loc = location) {
  return loc.origin + loc.pathname;
}

// ---------- Efeitos (só no navegador) ----------

const armazenamento = () => (typeof localStorage !== 'undefined' ? localStorage : null);
const sessao = () => (typeof sessionStorage !== 'undefined' ? sessionStorage : null);

// Executa uma parte do rastreamento sem nunca propagar erro para o site.
function protegido(fn, reserva = undefined) {
  try { return fn(); } catch { return reserva; }
}

let ativo = false;
let ultimaVisita = null;
// SDK real da Meta, quando já carregou. Antes disso, as chamadas ficam na fila (sem URL).
let fbqReal = null;
// Script do SDK bloqueado (adblock, rede): a página deixa de esperar por ele.
let sdkFalhou = false;
// Chamadas aguardando o SDK: { args, chave, aoEnviar }. A chave impede a mesma compra entrar duas vezes na fila.
let pendentes = [];
let enviadas = new Set();
let esperas = [];

// Executa um envio à Meta com a URL limpa. Se o endereço não puder ser trocado, lança erro e nada é enviado.
export function comUrlLimpa(enviar) {
  const atual = location.href;
  const limpa = urlLimpa();
  if (atual === limpa) return enviar();
  history.replaceState(history.state, '', limpa);
  try {
    return enviar();
  } finally {
    try { history.replaceState(history.state, '', atual); } catch { /* não deve ocorrer */ }
  }
}

// Envia uma chamada ao SDK agora, com a URL limpa. Devolve true só se o envio aconteceu.
function envia({ args, chave, aoEnviar }) {
  const ok = protegido(() => { comUrlLimpa(() => fbqReal(...args)); return true; }, false);
  if (ok) {
    if (chave) enviadas.add(chave);
    protegido(() => aoEnviar?.());
  }
  return ok;
}

function naFilaOuEnviada(chave) {
  return Boolean(chave) && (enviadas.has(chave) || pendentes.some((p) => p.chave === chave));
}

// Chamadas de rastreamento: enviadas agora se o SDK já carregou, senão ficam na fila.
// Sem consentimento ativo, nada é enviado nem enfileirado.
function enfileira(args, { chave, aoEnviar } = {}) {
  if (!ativo) return false;
  if (naFilaOuEnviada(chave)) return false;
  if (fbqReal) return envia({ args, chave, aoEnviar });
  if (pendentes.length < LIMITE_PENDENTES) pendentes.push({ args, chave, aoEnviar });
  return false;
}

function acordaEsperas() {
  const acordar = esperas;
  esperas = [];
  acordar.forEach((ok) => ok());
}

// Chamado quando o SDK da Meta carrega. Envia a fila só se o consentimento ainda estiver ativo.
export function sdkCarregado(fbq) {
  protegido(() => {
    if (typeof fbq !== 'function' || fbqReal) return;
    fbqReal = fbq;
    const fila = pendentes;
    pendentes = [];
    if (ativo) fila.forEach((item) => envia(item));
    acordaEsperas();
  });
}

export function consentimentoAtual(storage = armazenamento()) {
  return protegido(() => storage?.getItem(CONSENTIMENTO_CHAVE) || null, null);
}

// Preferência de cookies: guardada sempre, para respeitar a escolha nas visitas seguintes.
export function registraConsentimento(valor, storage = armazenamento()) {
  protegido(() => storage?.setItem(CONSENTIMENTO_CHAVE, valor === 'aceito' ? 'aceito' : 'recusado'));
}

// Apaga o que foi guardado para marketing (ao rejeitar). Não toca na preferência de cookies nem no login.
export function limpaArmazenamentoDeMarketing(storage = armazenamento(), sess = sessao()) {
  protegido(() => { storage?.removeItem(CHECKOUT_CHAVE); storage?.removeItem(COMPRAS_CHAVE); });
  protegido(() => {
    const chaves = [];
    for (let i = 0; sess && i < sess.length; i++) {
      const k = sess.key(i);
      if (k && k.startsWith(IC_PREFIXO)) chaves.push(k);
    }
    chaves.forEach((k) => sess.removeItem(k));
  });
}

// Remove os cookies de marketing que o próprio site consegue apagar: caminho "/" e o domínio do site.
// Cookies gravados pela Meta em facebook.com não podem ser removidos a partir deste site.
export function apagaCookiesDeMarketing(doc = typeof document !== 'undefined' ? document : null, host = hostAtual()) {
  if (!doc || !host) return;
  const dominios = [null, host, `.${host}`];
  for (const nome of COOKIES_DE_MARKETING) {
    for (const dominio of dominios) {
      const atributoDominio = dominio ? `; domain=${dominio}` : '';
      protegido(() => { doc.cookie = `${nome}=; Max-Age=0; path=/${atributoDominio}`; });
    }
  }
}

// Rejeição: bloqueia o envio na hora e apaga os dados de marketing e os cookies que o site pode apagar.
function revoga() {
  ativo = false;
  pendentes = [];
  ultimaVisita = null;
  limpaArmazenamentoDeMarketing();
  apagaCookiesDeMarketing();
}

// Decisão do aviso de cookies. "aceito" liga o pixel na hora (sem recarregar) e registra a visita atual.
// "recusado" desliga o envio de eventos e apaga o armazenamento de marketing.
export function decideConsentimento(valor, { caminho = '/' } = {}) {
  return protegido(() => {
    registraConsentimento(valor);
    if (valor !== 'aceito') {
      revoga();
      return false;
    }
    const ligou = iniciaRastreamento();
    if (ligou) paginaVista(caminho);
    return ligou;
  }, false);
}

// Carrega o SDK oficial da Meta de forma assíncrona. Nenhuma URL é enviada antes do carregamento.
function carregaSdk() {
  protegido(() => {
    if (typeof window.fbq === 'function') { sdkCarregado(window.fbq); return; }
    const script = document.createElement('script');
    script.async = true;
    script.src = SDK_URL;
    script.onload = () => sdkCarregado(window.fbq);
    // Script bloqueado: nada é enviado, a fila é descartada e a página deixa de esperar pelo SDK.
    script.onerror = () => { sdkFalhou = true; pendentes = []; acordaEsperas(); };
    document.head.appendChild(script);
  });
}

// Chamado na inicialização. Sem domínio de produção, ID ou consentimento, não faz nada.
// Quem já rejeitou tem o armazenamento de marketing e os cookies de marketing apagados de novo.
export function iniciaRastreamento() {
  return protegido(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (ativo) return true;
    const consentimento = consentimentoAtual();
    if (consentimento === 'recusado') revoga();
    if (!pixelHabilitado({ consentimento })) return false;
    ativo = true;
    leCheckout();
    enfileira(['init', String(META.pixelId).trim()]);
    carregaSdk();
    return true;
  }, false);
}

export function rastreamentoAtivo() {
  return ativo;
}

// Espera o SDK carregar (até o limite) antes de a página mudar, para o evento de checkout não se perder.
// Se o SDK estiver bloqueado, não espera: o checkout segue na hora.
export function aguardaRastreamento(ms = 1200) {
  return protegido(() => {
    if (!ativo || fbqReal || sdkFalhou) return Promise.resolve();
    return new Promise((ok) => {
      esperas.push(ok);
      setTimeout(ok, ms);
    });
  }, Promise.resolve());
}

// PageView (e ViewContent nas páginas de oferta) a cada navegação real da SPA.
export function paginaVista(caminho) {
  protegido(() => {
    if (!ativo) return;
    const agora = Date.now();
    if (!deveRegistrarVisita(ultimaVisita, caminho, agora)) return;
    ultimaVisita = { caminho, em: agora };
    for (const evento of eventosDaPagina(caminho)) {
      if (evento === 'PageView') enfileira(['track', 'PageView']);
      else enfileira(['track', 'ViewContent', { currency: 'BRL', content_name: NOME_PRODUTO, content_type: 'product' }]);
    }
  });
}

// Lê a tentativa de checkout guardada. Tentativa com mais de 48 horas é apagada.
function leCheckout(storage = armazenamento()) {
  let registro = null;
  protegido(() => { registro = JSON.parse(storage?.getItem(CHECKOUT_CHAVE) || 'null'); });
  const vencida = !registro || Date.now() - Number(registro.em || 0) > VALIDADE_CHECKOUT_MS;
  if (vencida) protegido(() => storage?.removeItem(CHECKOUT_CHAVE));
  return vencida ? null : registro;
}

// Guarda a tentativa de checkout deste navegador e devolve o identificador aleatório dela.
// Sem consentimento de marketing, nada é guardado e o retorno é null.
// "sandbox" padrão é true: sem indicador claro, a tentativa é tratada como teste e não gera Purchase.
export function guardaCheckout({ id, valor, sandbox = true }, storage = armazenamento()) {
  return protegido(() => {
    if (!ativo || !id) return null;
    const token = novoIdentificador();
    protegido(() => storage?.setItem(CHECKOUT_CHAVE, JSON.stringify({ id, token, valor, sandbox, em: Date.now() })));
    return token;
  }, null);
}

// InitiateCheckout: uma vez por tentativa. Recarregar a página ou clicar de novo não repete o evento.
// A marca de "já enviado" só é gravada depois do envio real.
export function iniciaCheckout({ token, valor } = {}) {
  protegido(() => {
    if (!ativo || !token) return;
    const chave = `${IC_PREFIXO}${token}`;
    if (protegido(() => sessao()?.getItem(chave), null)) return;
    enfileira(['track', 'InitiateCheckout', dadosDoProduto(valor), { eventID: token }], {
      chave: `ic:${token}`,
      aoEnviar: () => protegido(() => sessao()?.setItem(chave, '1')),
    });
  });
}

function lêLista(chave) {
  return protegido(() => {
    const valor = JSON.parse(armazenamento()?.getItem(chave) || '[]');
    return Array.isArray(valor) ? valor : [];
  }, []);
}

// Marca a compra como contada e apaga a tentativa, só depois do envio. Não apaga uma tentativa mais nova.
function registraCompra(id, token) {
  protegido(() => {
    const lista = lêLista(COMPRAS_CHAVE);
    armazenamento()?.setItem(COMPRAS_CHAVE, JSON.stringify([...lista, id].slice(-LIMITE_COMPRAS)));
    const atual = leCheckout();
    if (atual && atual.token === token) armazenamento()?.removeItem(CHECKOUT_CHAVE);
  });
}

// Purchase: chamado quando as assinaturas da pessoa são carregadas (tela da conta).
// A tentativa só é apagada depois do envio, então a compra não se perde se o SDK ainda não carregou.
export function confirmaCompra(assinaturas = []) {
  return protegido(() => {
    if (!ativo) return null;
    const compra = escolheCompra({ pendente: leCheckout(), assinaturas, jaRastreadas: lêLista(COMPRAS_CHAVE) });
    if (!compra) return null;
    enfileira(['track', 'Purchase', dadosDoProduto(compra.valor), { eventID: compra.token }], {
      chave: `purchase:${compra.token}`,
      aoEnviar: () => registraCompra(compra.id, compra.token),
    });
    return compra;
  }, null);
}
