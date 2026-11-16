// Inicia o pagamento de um plano: cria o pedido pendente e devolve o link do Checkout do Mercado Pago (Pix e cartão).
// O valor vem do plano definido no servidor. O acesso só é liberado pelo webhook, depois da confirmação do pagamento.
// Na prévia da Vercel usa só o projeto DEV e o sandbox; em produção, o projeto e o token de produção.
import { planoOferecido } from '../../js/pagamento.js';
import { destinoDoServidor, usuarioDaSessao, supabaseServico, criarPreferencia } from '../../servidor/mercadopago.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  let destino;
  try {
    destino = destinoDoServidor(process.env);
  } catch (err) {
    console.error('criar-pagamento: configuração recusada', err?.message);
    return res.status(503).json({ error: 'Pagamento indisponível no momento.' });
  }
  if (!process.env.MP_ACCESS_TOKEN || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('criar-pagamento: variáveis de ambiente ausentes');
    return res.status(503).json({ error: 'Pagamento indisponível no momento.' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const plano = planoOferecido(req.body?.planId);
  if (!token) return res.status(401).json({ error: 'Entre na sua conta para assinar.' });
  if (!plano) return res.status(400).json({ error: 'Plano inválido.' });

  try {
    const usuario = await usuarioDaSessao(token, destino);
    if (!usuario) return res.status(401).json({ error: 'Entre na sua conta para assinar.' });

    const agora = new Date().toISOString();
    const [assinatura] = await supabaseServico('subscriptions?select=id', {
      destino,
      method: 'POST',
      prefer: 'return=representation',
      corpo: {
        user_id: usuario.id,
        plan: plano.id,
        amount: plano.price,
        status: 'pending',
        starts_at: agora,
        expires_at: agora,
        payment_note: 'Mercado Pago: aguardando pagamento',
      },
    });
    if (!assinatura || !UUID.test(assinatura.id)) throw new Error('pedido_nao_criado');

    const preferencia = await criarPreferencia({
      items: [{ title: plano.name, quantity: 1, unit_price: Number(plano.price), currency_id: 'BRL' }],
      external_reference: assinatura.id,
      payer: usuario.email ? { email: usuario.email } : undefined,
      notification_url: `${destino.siteUrl}/api/mercadopago/webhook`,
      back_urls: {
        success: `${destino.siteUrl}/conta?pagamento=aprovado`,
        pending: `${destino.siteUrl}/conta?pagamento=pendente`,
        failure: `${destino.siteUrl}/planos?pagamento=recusado`,
      },
      auto_return: 'approved',
      statement_descriptor: 'FORNECEDORES SP',
      metadata: { user_id: usuario.id, plan: plano.id },
    }, process.env.MP_ACCESS_TOKEN, assinatura.id);

    await supabaseServico(`subscriptions?id=eq.${assinatura.id}`, {
      destino,
      method: 'PATCH',
      prefer: 'return=minimal',
      corpo: { mp_preference_id: String(preferencia.id) },
    });

    const url = destino.sandbox ? preferencia.sandbox_init_point : preferencia.init_point;
    return res.status(200).json({ url });
  } catch (err) {
    console.error('criar-pagamento: falha', err?.message);
    return res.status(502).json({ error: 'Não foi possível iniciar o pagamento. Tente de novo em instantes.' });
  }
}
