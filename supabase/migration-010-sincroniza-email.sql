-- ============================================================================
-- Migração 010: profiles.email acompanha o e-mail de login (auth.users.email).
-- Rode DEPOIS das migrações 002 a 009. Pode ser executada mais de uma vez (idempotente).
--
-- Problema: a troca de e-mail atualiza auth.users, mas profiles.email ficava com o endereço antigo
-- (e a migração 006 impede o próprio usuário de alterá-lo). O painel administrativo e o histórico
-- de assinaturas mostram profiles.email.
--
-- O que muda:
--  1) Trigger em auth.users: quando o e-mail muda, profiles.email recebe o novo endereço em minúsculas.
--  2) Backfill: alinha os perfis que já estão divergentes. Não apaga nada.
-- ============================================================================

create or replace function public.sincroniza_email_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    -- A troca de e-mail do login nunca pode falhar por causa do perfil. Se o novo endereço (em minúsculas)
    -- já estiver em outro perfil, o perfil fica como está e o aviso vai para o log do banco.
    begin
      update public.profiles set email = lower(new.email) where id = new.id;
    exception when unique_violation then
      raise warning 'profiles.email não atualizado para o usuário %: endereço já usado por outro perfil', new.id;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_email_changed on auth.users;
create trigger on_auth_email_changed
  after update of email on auth.users
  for each row execute function public.sincroniza_email_perfil();

-- Pré-checagem: profiles.email é único. Se dois logins diferirem só por maiúsculas, o backfill colidiria.
-- Nesse caso a migração para aqui, sem alterar nada, e a lista deve ser resolvida antes (decisão de quem administra).
do $$
declare
  dup text;
begin
  select string_agg(x.e, ', ') into dup
  from (
    select lower(email) as e from auth.users group by lower(email) having count(*) > 1
  ) x;
  if dup is not null then
    raise exception 'E-mails repetidos em auth.users (iguais em minúsculas): %. Resolva antes de aplicar a migração 010.', dup;
  end if;
end $$;

-- Backfill: perfis cujo e-mail não bate com o login atual.
update public.profiles p
set email = lower(u.email)
from auth.users u
where u.id = p.id
  and p.email is distinct from lower(u.email);
