-- ============================================================================
-- Migração 018: formulário de contato gravado no banco, lido só pelo administrador
--
--  - Tabela contact_messages: nome, e-mail, assunto, mensagem, data e status (lida ou não lida).
--  - Ninguém grava direto na tabela. O envio passa pela função envia_mensagem_contato, que
--    valida os campos no servidor, descarta robôs (campo-isca) e aplica limites de envio.
--  - Leitura, marcação de lida e exclusão: somente administrador (is_admin()).
--  - Visitantes e usuários comuns não leem nenhuma linha, nem pela API.
-- ============================================================================

create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 80),
  email      text not null check (char_length(email) between 5 and 160),
  subject    text not null check (char_length(subject) between 3 and 120),
  message    text not null check (char_length(message) between 10 and 2000),
  read_at    timestamptz,                       -- nulo = não lida
  created_at timestamptz not null default now()
);
create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

-- Privilégios mínimos: visitante não tem nenhum; logado pode ler, excluir e alterar só read_at,
-- e as regras abaixo restringem tudo isso ao administrador.
revoke all on public.contact_messages from public, anon, authenticated;
grant select, delete on public.contact_messages to authenticated;
grant update (read_at) on public.contact_messages to authenticated;

drop policy if exists "contact_messages_admin_read" on public.contact_messages;
create policy "contact_messages_admin_read" on public.contact_messages
  for select using (public.is_admin());

drop policy if exists "contact_messages_admin_update" on public.contact_messages;
create policy "contact_messages_admin_update" on public.contact_messages
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "contact_messages_admin_delete" on public.contact_messages;
create policy "contact_messages_admin_delete" on public.contact_messages
  for delete using (public.is_admin());

-- Envio da mensagem. p_site é o campo-isca do formulário: pessoas não o veem; se vier preenchido,
-- a função responde como se tivesse dado certo e não grava nada.
-- Limites (por hora): 3 mensagens por endereço de rede e 3 por e-mail. Teto geral: 200 por dia.
create or replace function public.envia_mensagem_contato(
  p_nome text,
  p_email text,
  p_assunto text,
  p_mensagem text,
  p_site text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome    text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_assunto text := btrim(regexp_replace(coalesce(p_assunto, ''), '\s+', ' ', 'g'));
  v_msg     text := btrim(coalesce(p_mensagem, ''));
  v_cab     json;
  v_ip      text;
begin
  if coalesce(p_site, '') <> '' then
    return;
  end if;

  if char_length(v_nome) not between 2 and 80 then
    raise exception 'Informe seu nome (de 2 a 80 caracteres).';
  end if;
  if char_length(v_email) not between 5 and 160 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    raise exception 'Informe um e-mail válido.';
  end if;
  if char_length(v_assunto) not between 3 and 120 then
    raise exception 'Informe o assunto (de 3 a 120 caracteres).';
  end if;
  if char_length(v_msg) not between 10 and 2000 then
    raise exception 'A mensagem deve ter de 10 a 2000 caracteres.';
  end if;
  if (select count(*) from regexp_matches(v_msg || ' ' || v_assunto, 'https?://|www\.', 'gi')) > 2 then
    raise exception 'A mensagem tem links demais. Envie no máximo 2 links.';
  end if;

  -- Mesma mensagem do mesmo e-mail nas últimas 24 horas: já está registrada (não conta no limite).
  if exists (
    select 1 from public.contact_messages m
    where m.email = v_email and m.message = v_msg and m.created_at > now() - interval '1 day'
  ) then
    return;
  end if;

  begin
    v_cab := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_cab := null;
  end;
  v_ip := coalesce(
    nullif(btrim(v_cab ->> 'cf-connecting-ip'), ''),
    nullif(btrim(split_part(coalesce(v_cab ->> 'x-forwarded-for', ''), ',', 1)), ''),
    'sem-endereco'
  );

  if not public.consume_rate_limit('contato:ip:' || md5(v_ip), 3, 3600) then
    raise exception 'Você já enviou mensagens há pouco. Aguarde cerca de uma hora para enviar outra.';
  end if;
  if not public.consume_rate_limit('contato:email:' || md5(v_email), 3, 3600) then
    raise exception 'Você já enviou mensagens há pouco. Aguarde cerca de uma hora para enviar outra.';
  end if;
  if (select count(*) from public.contact_messages m where m.created_at > now() - interval '1 day') >= 200 then
    raise exception 'Não foi possível receber a mensagem agora. Tente de novo mais tarde.';
  end if;

  insert into public.contact_messages (name, email, subject, message)
  values (v_nome, v_email, v_assunto, v_msg);
end;
$$;

revoke all on function public.envia_mensagem_contato(text, text, text, text, text) from public;
grant execute on function public.envia_mensagem_contato(text, text, text, text, text) to anon, authenticated;
