-- ============================================================================
-- Migração 019: o contador de visualizações volta a contar as visitas dos assinantes
--
-- Problema: increment_supplier_views soma 1 em suppliers.views, mas o gatilho guard_supplier_columns
-- devolvia o valor antigo sempre que quem chamava não era administrador. Resultado: só as visitas do
-- administrador eram contadas, e "Mais acessados" não refletia os clientes.
--
-- Solução: a função de contagem liga uma marca que vale só dentro da própria transação. Com a marca
-- ligada, o gatilho aceita exatamente "valor antigo + 1" em views e continua travando todo o resto.
-- Fora da função, nada muda: ninguém além do administrador altera views, status, selo, destaque ou dono.
-- Os limites continuam os mesmos: só quem tem acesso ao catálogo conta, uma vez por fornecedor por dia.
-- ============================================================================

create or replace function public.guard_supplier_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.approval_status := 'pending';
    new.verified := false;
    new.featured := false;
    new.is_demo := false;
    new.views := 0;
    new.owner_id := auth.uid();
  else
    new.approval_status := old.approval_status;
    new.verified := old.verified;
    new.featured := old.featured;
    new.is_demo := old.is_demo;
    new.owner_id := old.owner_id;
    if coalesce(current_setting('spf.contando_visualizacao', true), '') = '1' then
      new.views := old.views + 1;
      new.updated_at := old.updated_at;  -- uma visita não é uma edição do cadastro
    else
      new.views := old.views;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_supplier_columns() from public, anon, authenticated;

create or replace function public.increment_supplier_views(p_supplier_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pode_ver_catalogo() then
    return;
  end if;
  if not exists (
    select 1 from public.suppliers
    where id = p_supplier_id and approval_status = 'approved'
  ) then
    return;
  end if;
  if not public.consume_limite_usuario('visualizacao', p_supplier_id::text) then
    return;
  end if;
  perform set_config('spf.contando_visualizacao', '1', true);
  update public.suppliers set views = views + 1
  where id = p_supplier_id and approval_status = 'approved';
  perform set_config('spf.contando_visualizacao', '', true);
end;
$$;
revoke all on function public.increment_supplier_views(uuid) from public, anon;
grant execute on function public.increment_supplier_views(uuid) to authenticated;
