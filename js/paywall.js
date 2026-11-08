// Janela de assinatura para liberar os contatos. Modo 'simulacao': nenhuma cobrança real é feita.
import { PLANS, PAYMENT_MODE, PIX } from './config.js';
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
        <a class="btn btn-ghost" href="#/login" data-close>Já tenho conta</a>
        <a class="btn btn-primary" href="#/registro" data-close>Criar conta</a>
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
  const active = sub && new Date(sub.expiresAt).getTime() > Date.now();
  const status = active
    ? `<p class="notice">Seu acesso está ativo até <strong>${formatDate(sub.expiresAt)}</strong>. Você pode renovar agora para estender o prazo.</p>`
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
          <button class="btn btn-primary btn-block" type="button" data-plan="${e(p.id)}">Assinar</button>
        </div>`).join('')}
    </div>
    <p class="muted small">Ao assinar, você confirma que leu os <a href="#/termos" data-close>termos de uso</a>.</p>`);
  host.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => {
    const plan = PLANS.find((p) => p.id === b.dataset.plan);
    if (plan) showCheckout(plan);
  }));
}

function showCheckout(plan) {
  if (PAYMENT_MODE === 'pix') return showPix(plan);
  const simulation = PAYMENT_MODE === 'simulacao';
  const host = frame(`
    <h3 id="pw-title">Confirmar assinatura</h3>
    <div class="checkout-summary card">
      <p><strong>${e(plan.name)}</strong></p>
      <p class="plan-price"><strong>${money(plan.price)}</strong> <span class="muted">por ${plan.days} dias</span></p>
    </div>
    ${simulation
      ? '<div class="notice notice-warn" role="note"><strong>Modo simulação:</strong> nenhuma cobrança real será feita. Este botão apenas libera o acesso para testar o site.</div>'
      : '<div class="notice notice-warn" role="note">Pagamento ainda não configurado. Consulte o README para ligar o provedor de pagamento.</div>'}
    <div class="modal-actions">
      <button class="btn btn-ghost" type="button" data-back>Voltar</button>
      <button class="btn btn-primary" type="button" id="pw-confirm" ${simulation ? '' : 'disabled'}>Confirmar</button>
    </div>`);
  host.querySelector('[data-back]').addEventListener('click', showPlans);
  host.querySelector('#pw-confirm')?.addEventListener('click', () => {
    const session = store.session.get();
    const sub = store.subscriptions.activate(session.email, plan.id, plan.days);
    close();
    toast(`Acesso liberado até ${formatDate(sub.expiresAt)}.`);
    window.SPF?.render?.();
  });
}

// Pagamento por Pix: mostra o QR e o código copia e cola. A liberação é feita depois da conferência.
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
}
