-- Migração 013: o servidor (chave de serviço) cria o pedido do Mercado Pago.
-- A trigger da migração 006 só aceitava pedidos do próprio usuário logado (auth.uid()).
-- Na chamada do servidor com a chave de serviço não há usuário logado, então o insert era recusado.
-- Esta versão deixa passar o insert da chave de serviço. As regras para o cliente continuam as mesmas.

create or replace function public.guard_subscription_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preco numeric(10,2);
  v_dias int;
begin
  -- Servidor com a chave de serviço: o servidor já define plano, valor e prazo.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  -- Cliente: só pode registrar pedido pendente, para si mesmo, de um plano conhecido.
  if new.user_id is distinct from auth.uid() then
    raise exception 'Pedido inválido.';
  end if;
  -- Valores e planos iguais aos de js/config.js (PLANS). Se mudar o preço lá, mude aqui também.
  case new.plan
    when 'mensal' then v_preco := 29.90; v_dias := 30;
    when 'anual'  then v_preco := 29.90; v_dias := 365;
    else raise exception 'Plano inválido.';
  end case;

  -- Só um pedido aguardando confirmação por pessoa.
  if exists (select 1 from public.subscriptions s where s.user_id = auth.uid() and s.status = 'pending') then
    raise exception 'Você já tem um pagamento aguardando confirmação.';
  end if;

  new.status := 'pending';
  new.amount := v_preco;
  new.starts_at := now();
  new.expires_at := now() + make_interval(days => v_dias);
  new.payment_note := 'Pix informado pelo cliente; aguardando conferência';
  return new;
end;
$$;
