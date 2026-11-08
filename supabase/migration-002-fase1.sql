-- ============================================================================
-- Migração 002 (fase 1): perfil automático, regiões no banco e pedidos de pagamento.
-- Rode DEPOIS do schema.sql. É aditiva e pode ser executada mais de uma vez.
-- Não apaga nenhum dado.
-- ============================================================================

-- 1) Perfil criado automaticamente quando alguém se cadastra (auth.users).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, type)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    lower(new.email),
    'comprador'
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Bairros e cidades (regiões): o admin gerencia; todos leem.
create table if not exists public.regions (
  slug        text primary key,
  name        text not null,
  description text not null default '',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.regions enable row level security;
grant select on public.regions to anon, authenticated;
grant insert, update, delete on public.regions to authenticated;

drop policy if exists "regions_public_read" on public.regions;
create policy "regions_public_read" on public.regions
  for select using (true);

drop policy if exists "regions_admin_write" on public.regions;
create policy "regions_admin_write" on public.regions
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.regions (slug, name, description, sort_order) values
  ('25-de-marco', '25 de Março', 'Um dos maiores polos de comércio popular e atacado da América Latina.', 1),
  ('bras', 'Brás', 'Polo tradicional de confecções, calçados e variedades.', 2),
  ('pari', 'Pari', 'Região de atacado, distribuição e logística de mercadorias.', 3),
  ('bom-retiro', 'Bom Retiro', 'Confecção e moda, com forte presença de malharias e atacadistas.', 4),
  ('santa-ifigenia', 'Santa Ifigênia', 'Eletrônicos, informática e acessórios.', 5)
on conflict (slug) do nothing;

-- 3) Pagamento Pix: o cliente registra "já paguei" como pendente.
--    Só o admin confirma (muda para 'active') e define o prazo.
drop policy if exists "subscriptions_request_pending" on public.subscriptions;
create policy "subscriptions_request_pending" on public.subscriptions
  for insert with check (user_id = auth.uid() and status = 'pending');
