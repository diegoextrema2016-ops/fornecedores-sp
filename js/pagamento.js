// Regras do pagamento pelo Mercado Pago (Checkout Pro: Pix e cartão).
// Módulo puro: não faz rede nem usa segredos. Serve às APIs (servidor) e pode ser testado no Node.
import { PLANS } from './config.js';

// Plano que pode ser comprado agora. A cobrança usa o valor do servidor, nunca o que vem do navegador.
export function planoOferecido(id) {
  return PLANS.find((p) => p.id === id && p.offered !== false) || null;
}

// Compara valores em centavos para evitar erro de ponto flutuante.
export function centavos(valor) {
  return Math.round(Number(valor) * 100);
}

// O pagamento só libera acesso se estiver aprovado, em reais, ligado à assinatura certa e pelo valor do plano.
export function pagamentoAprovadoValido(pagamento, { assinaturaId, valor }) {
  return Boolean(pagamento)
    && pagamento.status === 'approved'
    && pagamento.currency_id === 'BRL'
    && String(pagamento.external_reference) === String(assinaturaId)
    && centavos(pagamento.transaction_amount) === centavos(valor);
}

// Novo vencimento: a partir de agora, ou do fim do acesso atual se ele ainda estiver ativo (renovação soma o prazo).
export function novoVencimento({ agora, vencimentoAtual, dias }) {
  const atual = vencimentoAtual ? new Date(vencimentoAtual) : null;
  const base = atual && atual.getTime() > agora.getTime() ? atual : agora;
  return new Date(base.getTime() + dias * 24 * 60 * 60 * 1000);
}
