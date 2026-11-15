-- Pagamento automático pelo Mercado Pago.
-- Colunas de controle do pedido. Só o servidor (chave de serviço) grava nelas; o cliente continua lendo só as próprias assinaturas.
alter table public.subscriptions add column if not exists mp_preference_id text;
alter table public.subscriptions add column if not exists mp_payment_id text;
alter table public.subscriptions add column if not exists mp_status text not null default '';

-- Um pagamento do Mercado Pago libera no máximo uma assinatura.
create unique index if not exists subscriptions_mp_payment_idx
  on public.subscriptions (mp_payment_id) where mp_payment_id is not null;

-- O cliente não cria mais pedidos pelo navegador: o pedido nasce na API /api/mercadopago/criar-pagamento.
drop policy if exists "subscriptions_request_pending" on public.subscriptions;
