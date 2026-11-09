// Janela de assinatura para liberar os contatos, paga por Pix.
// Ao abrir o Pix, o pedido fica registrado como "pendente" no banco. O administrador confere o pagamento
// e ativa a assinatura; só então os contatos aparecem para o cliente.
import { PLANS, PIX } from './config.js';
import { store } from './store.js';
import { escapeHtml as e, formatDate, pixPayload } from './utils.js';
import { toast } from './ui.js';
import { subscriptionInfo } from './access.js';

const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

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
      ? '<p class="notice">Você já informou um pagamento por Pix. Assim que for conferido, o acesso é liberado.</p>'
      : '';
  const host = frame(`
    <h3 id="pw-title">Acesso completo aos fornecedores</h3>
    <p class="muted">Veja o WhatsApp, o Instagram e o endereço completo de todos os fornecedores.</p>
    ${status}
    <div class="plans">
      ${PLANS.map((p) => `
        <div class="plan-card">
          <h4>${e(p.name)}</h4>
          <p class="plan-price"><strong>${money(p.price)}</strong> <span class="muted">/ ${p.days} dias</span></p>
          <p class="muted small">${e(p.description)}</p>
          <button class="btn btn-primary btn-block" type="button" data-plan="${e(p.id)}">Pagar com Pix</button>
        </div>`).join('')}
    </div>
    <p class="muted small">Ao assinar, você confirma que leu os <a href="/termos" data-close>termos de uso</a>.</p>`);
  host.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => {
    const plan = PLANS.find((p) => p.id === b.dataset.plan);
    if (plan) showPix(plan);
  }));
}

// Mostra o QR e o código copia e cola, e registra o pedido como pendente.
function showPix(plan) {
  const code = pixPayload({ key: PIX.key, amount: plan.price, name: PIX.name, city: PIX.city });
  const host = frame(`
    <h3 id="pw-title">Pague com Pix</h3>
    <div class="checkout-summary card">
      <p><strong>${e(plan.name)}</strong></p>
      <p class="plan-price"><strong>${money(plan.price)}</strong> <span class="muted">por ${plan.days} dias</span></p>
    </div>
    <div class="pix-box">
      <img src="${e(PIX.qrImage)}" alt="QR code Pix de ${money(plan.price)}" width="220" height="220">
      <p class="small muted">No app do seu banco, escolha Pix, depois Ler QR Code, e confira o valor antes de confirmar.</p>
      <label class="small" for="pix-code">Ou use o código Pix copia e cola:</label>
      <textarea id="pix-code" class="pix-code" readonly rows="3">${e(code)}</textarea>
      <button class="btn btn-ghost btn-block" type="button" id="pix-copy">Copiar código Pix</button>
    </div>
    <div class="notice notice-warn" role="note">Depois do pagamento, o acesso é liberado pelo administrador após a conferência do Pix. Guarde o comprovante.</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" type="button" data-back>Voltar</button>
    </div>`);
  host.querySelector('[data-back]').addEventListener('click', showPlans);
  host.querySelector('#pix-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Código Pix copiado.');
    } catch {
      host.querySelector('#pix-code').select();
      toast('Selecione o código e copie manualmente.', 'error');
    }
  });
  store.subscriptions.requestPix({ planId: plan.id, amount: plan.price }).catch((err) => {
    toast(err.message || 'Não foi possível registrar o pedido. Tente de novo.', 'error');
  });
}
