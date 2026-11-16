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

// Pagamento devolvido por inteiro ou contestado no cartão: o acesso comprado com ele deve acabar.
// Devolução parcial mantém o status "approved" no Mercado Pago e não entra aqui.
export function pagamentoDesfeito(pagamento) {
  return Boolean(pagamento) && (pagamento.status === 'refunded' || pagamento.status === 'charged_back');
}

// Texto mostrado quando a pessoa volta do checkout (?pagamento=aprovado|pendente|recusado).
// O parâmetro do endereço só escolhe a mensagem: quem libera o acesso é o banco, depois do aviso do Mercado Pago.
export function avisoDoRetorno(parametro, acessoAtivo = false) {
  if (parametro === 'aprovado') {
    return acessoAtivo
      ? { tom: 'ok', titulo: 'Pagamento aprovado', texto: 'Seu acesso aos fornecedores está liberado.', aguardando: false }
      : { tom: 'info', titulo: 'Pagamento aprovado', texto: 'Estamos confirmando com o Mercado Pago. O acesso é liberado em instantes, sem você precisar fazer nada.', aguardando: true };
  }
  if (parametro === 'pendente') {
    return acessoAtivo
      ? { tom: 'ok', titulo: 'Pagamento confirmado', texto: 'Seu acesso aos fornecedores está liberado.', aguardando: false }
      : { tom: 'info', titulo: 'Pagamento em andamento', texto: 'O Mercado Pago ainda não confirmou o pagamento. Se você escolheu Pix, conclua o pagamento no aplicativo do seu banco. O acesso é liberado automaticamente depois da confirmação.', aguardando: true };
  }
  if (parametro === 'recusado') {
    return { tom: 'erro', titulo: 'O pagamento não foi aprovado', texto: 'O acesso não foi liberado. Você pode tentar de novo, com Pix ou outro cartão.', aguardando: false };
  }
  return null;
}
