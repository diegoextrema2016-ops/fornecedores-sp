// Aviso de cookies. Só aparece no domínio de produção, com Pixel ID configurado, e enquanto a pessoa não escolheu.
// Duas opções apenas: "Aceitar todos" e "Rejeitar". Rejeitar não impede o uso do site.
import { consentimentoAtual, decideConsentimento, rastreamentoAtivo, rastreamentoNesteSite } from './rastreamento.js';
import { currentLocation } from './nav.js';

const ID_AVISO = 'aviso-cookies';

function fecha() {
  document.getElementById(ID_AVISO)?.remove();
}

function escolhe(valor) {
  const estavaAtivo = rastreamentoAtivo();
  try {
    decideConsentimento(valor, { caminho: currentLocation().path });
  } finally {
    // O aviso sempre fecha, mesmo que a decisão falhe.
    fecha();
  }
  // Se o pixel já tinha sido carregado nesta sessão, recarregar tira o SDK da memória.
  if (valor !== 'aceito' && estavaAtivo) location.reload();
}

export function abreAvisoDeCookies() {
  if (!rastreamentoNesteSite() || typeof document === 'undefined') return;
  if (document.getElementById(ID_AVISO)) return;
  const aviso = document.createElement('section');
  aviso.id = ID_AVISO;
  aviso.className = 'aviso-cookies';
  aviso.setAttribute('role', 'region');
  aviso.setAttribute('aria-labelledby', 'aviso-cookies-titulo');
  aviso.innerHTML = `
    <div class="aviso-cookies-texto">
      <p class="aviso-cookies-titulo" id="aviso-cookies-titulo">Este site utiliza cookies</p>
      <p>Utilizamos cookies em nosso site para melhorar sua experiência, analisar o tráfego e medir o desempenho de nossos anúncios. Você pode aceitar todos os cookies ou rejeitar os não essenciais. Saiba mais em nossa <a href="/privacidade">Política de Privacidade</a>.</p>
    </div>
    <div class="aviso-cookies-acoes">
      <button class="btn btn-ghost" type="button" data-cookie="recusado">Rejeitar</button>
      <button class="btn btn-primary" type="button" data-cookie="aceito">Aceitar todos</button>
    </div>`;
  aviso.addEventListener('click', (ev) => {
    const botao = ev.target.closest?.('[data-cookie]');
    if (botao) escolhe(botao.dataset.cookie);
  });
  document.body.appendChild(aviso);
}

// Aviso no primeiro acesso (sem decisão salva) e botão "Alterar preferências" em /privacidade.
export function mostraAvisoDeCookies() {
  if (!rastreamentoNesteSite() || typeof document === 'undefined') return;
  document.addEventListener('click', (ev) => {
    if (ev.target.closest?.('[data-abrir-cookies]')) {
      ev.preventDefault();
      abreAvisoDeCookies();
    }
  });
  if (consentimentoAtual() === null) abreAvisoDeCookies();
}
