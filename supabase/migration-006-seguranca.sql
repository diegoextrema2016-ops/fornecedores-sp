-- ============================================================================
-- Migração 006: correções de segurança (resultado da auditoria antes da produção).
-- Rode no SQL Editor do Supabase DEPOIS das migrações 002 a 005.
-- Pode ser executada mais de uma vez (é idempotente). Não apaga nenhum dado.
--
-- O que muda:
--  1) Limite de uso por conta (tabela rate_limits + consume_rate_limit).
--  2) Checagem de duplicados passa a limitar tentativas e não devolve mais o nome de outro fornecedor.
--  3) Pedido de assinatura: o servidor define plano, valor, prazo e status (o cliente não escolhe).
--  4) Só um pedido pendente por pessoa.
--  5) Perfil: ninguém altera o próprio e-mail (o tipo já era protegido).
--  6) Contatos: assinante só lê contatos de fornecedor aprovado.
--  7) Storage: ninguém lista o bucket inteiro; cada conta só vê as próprias imagens; limite de arquivos por conta.
--  8) Fotos e logos: só URLs do próprio armazenamento (regra para registros novos).
--  9) Limite de fornecedores por conta e de buscas registradas por hora.
-- ============================================================================

-- ---------- 1) Limite de uso (contador por chave e janela de tempo) ----------
create table if not exists public.rate_limits (
  chave         text primary key,
  janela_inicio timestamptz not null default now(),
  contador      int not null default 0
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Conta uma ação da chave. Devolve true se ainda está dentro do limite.
create or replace function public.consume_rate_limit(p_chave text, p_limite int, p_janela_segundos int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  agora timestamptz := now();
  v_contador int;
begin
  insert into public.rate_limits as r (chave, janela_inicio, contador)
  values (p_chave, agora, 1)
  on conflict (chave) do update set
    janela_inicio = case when r.janela_inicio < agora - make_interval(secs => p_janela_segundos) then agora else r.janela_inicio end,
    contador      = case when r.janela_inicio < agora - make_interval(secs => p_janela_segundos) then 1 else r.contador + 1 end
  returning contador into v_contador;
  return v_contador <= p_limite;
end;
$$;
revoke all on function public.consume_rate_limit(text, int, int) from public, anon;
grant execute on function public.consume_rate_limit(text, int, int) to authenticated;

-- ---------- 2) Duplicados: só logado, com limite, sem nome de outro fornecedor ----------
-- Mantém a mesma assinatura (o site antigo continua funcionando). O campo name volta vazio (null).
create or replace function public.find_supplier_duplicate(
  p_instagram text,
  p_whatsapp text,
  p_exclude uuid default null
)
returns table (name text, field text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.consume_rate_limit('dup:' || auth.uid()::text, 60, 3600) then
    raise exception 'Muitas verificações seguidas. Aguarde alguns minutos e tente de novo.';
  end if;

  return query
  select x.name, x.field from (
    select null::text as name, 'instagram'::text as field
    from public.supplier_contacts c
    join public.suppliers s on s.id = c.supplier_id
    where nullif(lower(p_instagram), '') is not null
      and lower(c.instagram) = lower(p_instagram)
      and (p_exclude is null or s.id <> p_exclude)
    limit 1
  ) x
  union all
  select y.name, y.field from (
    select null::text as name, 'whatsapp'::text as field
    from public.supplier_contacts c
    join public.suppliers s on s.id = c.supplier_id
    where nullif(p_whatsapp, '') is not null
      and (case
            when length(regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g')) >= 11
              then right(regexp_replace(c.whatsapp, '\D', '', 'g'), 11)
            else regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g')
          end) = p_whatsapp
      and (p_exclude is null or s.id <> p_exclude)
    limit 1
  ) y
  limit 1;
end;
$$;
revoke all on function public.find_supplier_duplicate(text, text, uuid) from public;
revoke execute on function public.find_supplier_duplicate(text, text, uuid) from anon;
grant execute on function public.find_supplier_duplicate(text, text, uuid) to authenticated;

-- ---------- 3) Pedido de assinatura: o servidor manda no plano, valor e prazo ----------
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

drop trigger if exists subscriptions_guard_insert on public.subscriptions;
create trigger subscriptions_guard_insert
  before insert on public.subscriptions
  for each row execute function public.guard_subscription_insert();

-- ---------- 5) Perfil: ninguém muda o próprio e-mail (nem o tipo) ----------
drop policy if exists "profiles_update_own_name" on public.profiles;
create policy "profiles_update_own_name" on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and type = (select p.type from public.profiles p where p.id = auth.uid())
    and email = (select p.email from public.profiles p where p.id = auth.uid())
  );

-- ---------- 6) Contatos: assinante só lê contato de fornecedor aprovado ----------
drop policy if exists "contacts_read_subscribers" on public.supplier_contacts;
create policy "contacts_read_subscribers" on public.supplier_contacts
  for select using (
    public.is_admin()
    or exists (select 1 from public.suppliers s where s.id = supplier_id and s.owner_id = auth.uid())
    or (
      public.has_active_subscription()
      and exists (select 1 from public.suppliers s where s.id = supplier_id and s.approval_status = 'approved')
    )
  );

-- ---------- 7) Storage: sem listagem do bucket; cada conta vê e envia só a própria pasta ----------
-- A leitura pública das imagens continua pelo link (bucket público); só a LISTAGEM deixa de ser pública.
drop policy if exists "supplier_images_public_read" on storage.objects;
drop policy if exists "supplier_images_owner_read" on storage.objects;
create policy "supplier_images_owner_read" on storage.objects
  for select using (
    bucket_id = 'supplier-images'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

drop policy if exists "supplier_images_owner_upload" on storage.objects;
create policy "supplier_images_owner_upload" on storage.objects
  for insert with check (
    bucket_id = 'supplier-images'
    and auth.uid()::text = (storage.foldername(name))[1]
    and (
      select count(*) from storage.objects o
      where o.bucket_id = 'supplier-images' and (storage.foldername(o.name))[1] = auth.uid()::text
    ) < 200
  );

-- ---------- 8) Fotos e logos: só do próprio armazenamento (vale para registros novos) ----------
alter table public.supplier_photos drop constraint if exists supplier_photos_url_storage;
alter table public.supplier_photos add constraint supplier_photos_url_storage
  check (url like 'https://%.supabase.co/storage/v1/object/public/supplier-images/%') not valid;

alter table public.suppliers drop constraint if exists suppliers_logo_storage;
alter table public.suppliers add constraint suppliers_logo_storage
  check (logo_url is null or logo_url like 'https://%.supabase.co/storage/v1/object/public/supplier-images/%') not valid;

-- ---------- 9) Limites: fornecedores por conta e buscas por hora ----------
create or replace function public.limita_fornecedores_por_conta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if (select count(*) from public.suppliers s where s.owner_id = auth.uid()) >= 20 then
    raise exception 'Limite de 20 fornecedores por conta. Fale com a administração para cadastrar mais.';
  end if;
  return new;
end;
$$;

drop trigger if exists suppliers_limite_por_conta on public.suppliers;
create trigger suppliers_limite_por_conta
  before insert on public.suppliers
  for each row execute function public.limita_fornecedores_por_conta();

create index if not exists buscas_criada_em_idx on public.buscas(criada_em);

-- Registra uma busca. Qualquer visitante pode chamar, então há um teto de 5.000 buscas por hora no total.
create or replace function public.registra_busca(p_termo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := lower(btrim(p_termo));
begin
  if char_length(t) between 2 and 60
     and (select count(*) from public.buscas b where b.criada_em > now() - interval '1 hour') < 5000 then
    insert into public.buscas (termo) values (t);
  end if;
end;
$$;
grant execute on function public.registra_busca(text) to anon, authenticated;
