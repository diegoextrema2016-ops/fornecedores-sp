-- Migração 004: checagem de duplicados por Instagram e WhatsApp no cadastro de fornecedores.
-- Rode uma vez no SQL Editor do Supabase, depois de migration-003-site-conectado.sql.
--
-- Por que uma função: os contatos (supplier_contacts) só são lidos por administrador e assinante.
-- Quem está cadastrando não consegue ver os contatos dos outros fornecedores, então a checagem roda
-- no banco com security definer. A função devolve só o nome e o motivo do conflito, nunca os contatos.

create or replace function public.find_supplier_duplicate(
  p_instagram text,
  p_whatsapp text,
  p_exclude uuid default null
)
returns table (name text, field text)
language sql
stable
security definer
set search_path = public
as $$
  select s.name, 'instagram'::text
  from public.supplier_contacts c
  join public.suppliers s on s.id = c.supplier_id
  where nullif(lower(p_instagram), '') is not null
    and lower(c.instagram) = lower(p_instagram)
    and (p_exclude is null or s.id <> p_exclude)
  union all
  select s.name, 'whatsapp'::text
  from public.supplier_contacts c
  join public.suppliers s on s.id = c.supplier_id
  where nullif(p_whatsapp, '') is not null
    and (case
          when length(regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g')) >= 11
            then right(regexp_replace(c.whatsapp, '\D', '', 'g'), 11)
          else regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g')
        end) = p_whatsapp
    and (p_exclude is null or s.id <> p_exclude)
  limit 1;
$$;

-- Só quem está logado pode checar (o cadastro público exige conta).
-- O Supabase dá execute ao papel anon por padrão, então ele precisa ser revogado separadamente.
revoke all on function public.find_supplier_duplicate(text, text, uuid) from public;
revoke execute on function public.find_supplier_duplicate(text, text, uuid) from anon;
grant execute on function public.find_supplier_duplicate(text, text, uuid) to authenticated;
