-- ============================================================================
-- Migração 011: funções RPC e limites de uso só para quem deve usá-las.
-- Rode DEPOIS das migrações 002 a 010. Pode ser executada mais de uma vez (idempotente).
-- Não apaga dados.
--
-- Problemas corrigidos (auditoria de permissões):
--  a) consume_rate_limit podia ser chamada por qualquer logado, com chave e limite escolhidos
--     pelo cliente (consumia a cota de outra pessoa e enchia a tabela). Agora só funções internas a usam.
--  b) increment_supplier_views e registra_busca eram executáveis por visitantes, sem limite.
--  c) buscas_populares expunha termos pesquisados a visitantes.
--  d) find_supplier_duplicate tinha limite de 60 por hora, mais que o necessário.
--  e) Funções de gatilho ficavam executáveis por PUBLIC.
--
-- Novidade: consume_limite_usuario(acao, alvo) tem os limites fixados no banco. O cliente só escolhe a
-- ação (de uma lista fixa). A chave usa auth.uid(), então ninguém consome a cota de outra conta.
-- ============================================================================

-- ---------- 1) Contador genérico: sem acesso direto ----------
revoke all on function public.consume_rate_limit(text, int, int) from public, anon, authenticated;

-- ---------- 2) Limites por ação, com chave do usuário logado ----------
create or replace function public.consume_limite_usuario(p_acao text, p_alvo text default '')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lim int;
  jan int;
begin
  if uid is null then
  return false;
end if;

if p_acao <> 'visualizacao' and coalesce(p_alvo, '') <> '' then
  raise exception 'Alvo não permitido para esta ação.';
end if;

if p_acao = 'visualizacao'
   and coalesce(p_alvo, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise exception 'Identificador de fornecedor inválido.';
end if;
  case p_acao
    when 'sugerir'       then lim := 100; jan := 3600;   -- sugestões de descrição com IA por hora
    when 'duplicado'     then lim := 20;  jan := 3600;   -- checagens de duplicado por hora
    when 'busca'         then lim := 300; jan := 3600;   -- buscas registradas por hora
    when 'visualizacao'  then lim := 1;   jan := 86400;  -- uma contagem por fornecedor por dia
    else raise exception 'Ação de limite desconhecida.';
  end case;
  return public.consume_rate_limit(p_acao || ':' || uid::text || ':' || coalesce(p_alvo, ''), lim, jan);
end;
$$;
revoke all on function public.consume_limite_usuario(text, text) from public, anon;
grant execute on function public.consume_limite_usuario(text, text) to authenticated;

-- ---------- 3) Duplicados: limite pela nova função; continua sem devolver nomes ----------
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
  if not public.consume_limite_usuario('duplicado') then
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
revoke all on function public.find_supplier_duplicate(text, text, uuid) from public, anon;
grant execute on function public.find_supplier_duplicate(text, text, uuid) to authenticated;

-- ---------- 4) Visualizações: só com acesso ao catálogo, uma por fornecedor e por dia ----------
create or replace function public.increment_supplier_views(p_supplier_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pode_ver_catalogo() then
    return;
  end if; if not exists (
  select 1
  from public.suppliers
  where id = p_supplier_id
    and approval_status = 'approved'
) then
  return;
end if;
  if not public.consume_limite_usuario('visualizacao', p_supplier_id::text) then
    return;
  end if;
  update public.suppliers set views = views + 1
  where id = p_supplier_id and approval_status = 'approved';
end;
$$;
revoke all on function public.increment_supplier_views(uuid) from public, anon;
grant execute on function public.increment_supplier_views(uuid) to authenticated;

-- ---------- 5) Buscas: registro e leitura só para quem pode ver o catálogo ----------
create or replace function public.registra_busca(p_termo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := lower(btrim(p_termo));
begin
  if not public.pode_ver_catalogo() then
    return;
  end if;
  if char_length(t) between 2 and 60
     and public.consume_limite_usuario('busca')
     and (select count(*) from public.buscas b where b.criada_em > now() - interval '1 hour') < 5000 then
    insert into public.buscas (termo) values (t);
  end if;
end;
$$;
revoke all on function public.registra_busca(text) from public, anon;
grant execute on function public.registra_busca(text) to authenticated;

create or replace function public.buscas_populares(p_limite int default 5)
returns table (termo text, total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.pode_ver_catalogo() then
    return;
  end if;
  return query
  select b.termo, count(*) as total
  from public.buscas b
  where b.criada_em > now() - interval '60 days'
  group by b.termo
  having count(*) >= 2
  order by total desc, b.termo
  limit least(greatest(coalesce(p_limite, 5), 1), 50);
end;
$$;
revoke all on function public.buscas_populares(int) from public, anon;
grant execute on function public.buscas_populares(int) to authenticated;

-- ---------- 6) Funções de gatilho: não são chamadas pela API ----------
-- Os gatilhos continuam funcionando (eles não dependem de EXECUTE do usuário que grava).
revoke all on function public.guard_supplier_columns() from public, anon, authenticated;
revoke all on function public.guard_subscription_insert() from public, anon, authenticated;
revoke all on function public.limita_fornecedores_por_conta() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sincroniza_email_perfil() from public, anon, authenticated;
