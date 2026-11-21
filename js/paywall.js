// Janela de assinatura para liberar os contatos. O pagamento é feito pelo Mercado Pago (Pix ou cartão):
// o servidor cria o pedido e, quando o pagamento é aprovado, o acesso é liberado automaticamente.
import { PLANS } from './config.js';
import { store } from './store.js';
import { api } from './api.js';
import { escapeHtml as e, formatDate } from './utils.js';
import { toast } from './ui.js';
import { subscriptionInfo } from './access.js';
import { guardaDestino } from './retorno.js';
import { iniciaCheckout, guardaCheckout, aguardaRastreamento } from './rastreamento.js';

const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// Rastreamento nunca interrompe o pagamento: qualquer erro dele é ignorado aqui.
function sem(fn) {
  try { return fn(); } catch { return undefined; }
}

function close() {
  document.getElementById('modal-root').innerHTML = '';
  document.removeEventListener('keydown', onKey);
}

function onKey(ev) {
  if (ev.key === 'Escape') close();
}

function frame(inner) {
  const host = document.getElementById('modal-root');
  host.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="pw-title">
      <button class="icon-btn modal-x" type="button" data-close aria-label="Fechar">×</button>
      ${inner}
    </div>`;
  host.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  return host;
}

export function openPaywall() {
  const session = store.session.get();
  if (!session) {
    // Depois de criar a conta ou entrar, a pessoa volta para os planos e conclui a assinatura.
    guardaDestino('/planos');
    frame(`
      <h3 id="pw-title">Crie uma conta para liberar os contatos</h3>
      <p class="muted">Os contatos completos (WhatsApp, Instagram e endereço) são exibidos para assinantes. Crie uma conta e assine o acesso.</p>
      <div class="modal-actions">
        <a class="btn btn-ghost" href="/login" data-close>Já tenho conta</a>
        <a class="btn btn-primary" href="/registro" data-close>Criar conta</a>
      </div>`);
    return;
  }
  if (session.role === 'admin') {
    toast('Administradores têm acesso completo.');
    return;
  }
  showPlans();
}

function showPlans() {
  const sub = subscriptionInfo();
  const active = sub && sub.status === 'active' && new Date(sub.expiresAt).getTime() > Date.now();
  const status = active
    ? `<p class="notice">Seu acesso está ativo até <strong>${formatDate(sub.expiresAt)}</strong>. Você pode renovar agora para estender o prazo.</p>`
    : sub && sub.status === 'pending'
      ? '<p class="notice">Você tem um pagamento em andamento. Assim que o Mercado Pago confirmar, o acesso é liberado automaticamente.</p>'
      : '';
  const host = frame(`
    <h3 id="pw-title">Acesso completo aos fornecedores</h3>
    <p class="muted">Veja o WhatsApp, o Instagram e o endereço completo de todos os fornecedores.</p>
    ${status}
    <div class="plans">
      ${PLANS.filter((p) => p.offered !== false).map((p) => `
        <div class="plan-card">
          <h4>${e(p.name)}</h4>
          <p class="plan-price"><strong>${money(p.price)}</strong> <span class="muted">/ ${p.days} dias</span></p>
          <p class="muted small">${e(p.description)}</p>
          <button class="btn btn-primary btn-block" type="button" data-plan="${e(p.id)}">Pagar com Pix ou cartão</button>
        </div>`).join('')}
    </div>
    <p class="muted small">Pagamento seguro pelo Mercado Pago. O acesso é liberado automaticamente após a confirmação.</p>
    <p class="muted small">Ao assinar, você confirma que leu os <a href="/termos" data-close>termos de uso</a>.</p>`);
  host.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => pagar(b)));
}

// Cria o pedido no servidor e leva a pessoa ao checkout do Mercado Pago.
async function pagar(botao) {
  const plano = PLANS.find((p) => p.id === botao.dataset.plan);
  if (!plano) return;
  const texto = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Abrindo pagamento…';
  try {
    const { url, id, sandbox } = await api.criarPagamento(plano.id);
    // Rastreamento isolado: qualquer falha dele (SDK, adblock, storage) não pode impedir o pagamento.
    // Início de checkout de verdade: o pedido já existe no servidor e o link foi criado.
    const token = sem(() => guardaCheckout({ id, valor: plano.price, sandbox }));
    sem(() => iniciaCheckout({ token, valor: plano.price }));
    // Com o pixel ativo, espera o SDK (até 1,2 s) para o evento sair antes do redirecionamento.
    await sem(() => aguardaRastreamento(1200));
    window.location.href = url;
  } catch (err) {
    toast(err.message || 'Não foi possível iniciar o pagamento. Tente de novo.', 'error');
    botao.disabled = false;
    botao.textContent = texto;
  }
}
