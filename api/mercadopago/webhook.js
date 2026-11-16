// Recebe as notificações do Mercado Pago e libera o acesso quando o pagamento é aprovado.
// Não confia no corpo da requisição: confere a assinatura e consulta o pagamento direto na API do Mercado Pago.
import { planoOferecido, pagamentoAprovadoValido, novoVencimento, pagamentoDesfeito } from '../../js/pagamento.js';
import { destinoDoServidor, assinaturaMercadoPagoValida, buscarPagamento, supabaseServico } from '../../servidor/mercadopago.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let destino;
  try {
    destino = destinoDoServidor(process.env);
  } catch (err) {
    console.error('webhook: configuração recusada', err?.message);
    return res.status(503).end();
  }
  // Sem segredo configurado, nenhuma notificação é aceita (falha fechada).
  if (!process.env.MP_WEBHOOK_SECRET || !process.env.MP_ACCESS_TOKEN || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('webhook: variáveis de ambiente ausentes');
    return res.status(500).end();
  }

  const dataId = String(req.query?.['data.id'] || req.body?.data?.id || '');
  const tipo = String(req.query?.type || req.body?.type || String(req.body?.action || '').split('.')[0] || '');
  const autorizada = assinaturaMercadoPagoValida({
    assinatura: req.headers['x-signature'],
    requestId: req.headers['x-request-id'],
    dataId,
    segredo: process.env.MP_WEBHOOK_SECRET,
  });
  if (!autorizada) return res.status(401).end();
  if (tipo !== 'payment' || !dataId) return res.status(200).end();

  try {
    const pagamento = await buscarPagamento(dataId, process.env.MP_ACCESS_TOKEN);
    const assinaturaId = String(pagamento.external_reference || '');
    if (!UUID.test(assinaturaId)) return res.status(200).end();

    const [linha] = await supabaseServico(
      `subscriptions?id=eq.${assinaturaId}&select=id,user_id,plan,amount,status,mp_payment_id`,
      { destino },
    );
    if (!linha) return res.status(200).end();
    if (linha.status === 'active') {
      // Estorno total ou contestação do mesmo pagamento que liberou o acesso: o acesso acaba agora.
      // O filtro status=eq.active faz a segunda entrega do aviso não mudar mais nada.
      if (pagamentoDesfeito(pagamento) && String(linha.mp_payment_id || '') === String(pagamento.id)) {
        await supabaseServico(`subscriptions?id=eq.${linha.id}&status=eq.active`, {
          destino,
          method: 'PATCH',
          prefer: 'return=minimal',
          corpo: {
            status: 'cancelled',
            mp_status: String(pagamento.status),
            payment_note: pagamento.status === 'charged_back'
              ? 'Mercado Pago: pagamento contestado no cartão; acesso encerrado'
              : 'Mercado Pago: pagamento devolvido; acesso encerrado',
          },
        });
      }
      // Já liberado e sem estorno: a notificação pode chegar mais de uma vez.
      return res.status(200).end();
    }

    await supabaseServico(`subscriptions?id=eq.${linha.id}`, {
      destino,
      method: 'PATCH',
      prefer: 'return=minimal',
      corpo: { mp_payment_id: String(pagamento.id), mp_status: String(pagamento.status || '') },
    });

    const plano = planoOferecido(linha.plan);
    if (!plano || !pagamentoAprovadoValido(pagamento, { assinaturaId: linha.id, valor: linha.amount })) {
      return res.status(200).end();
    }

    const ativas = await supabaseServico(
      `subscriptions?user_id=eq.${linha.user_id}&status=eq.active&select=expires_at&order=expires_at.desc&limit=1`,
      { destino },
    );
    const vencimento = novoVencimento({
      agora: new Date(),
      vencimentoAtual: ativas?.[0]?.expires_at,
      dias: plano.days,
    });
    // Só ativa se ainda estiver pendente: uma segunda entrega não duplica o prazo.
    await supabaseServico(`subscriptions?id=eq.${linha.id}&status=eq.pending`, {
      destino,
      method: 'PATCH',
      prefer: 'return=minimal',
      corpo: {
        status: 'active',
        starts_at: new Date().toISOString(),
        expires_at: vencimento.toISOString(),
        payment_note: 'Mercado Pago: pagamento aprovado',
      },
    });
    return res.status(200).end();
  } catch (err) {
    console.error('webhook: falha', err?.message);
    // 500 faz o Mercado Pago tentar de novo depois.
    return res.status(500).end();
  }
}
