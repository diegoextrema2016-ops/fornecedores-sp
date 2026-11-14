-- ============================================================================
-- Migração 010: prepara a função de sincronização de e-mail, SEM ativá-la e SEM alterar dados.
-- Rode DEPOIS das migrações 002 a 006. Pode ser executada mais de uma vez (idempotente).
--
-- O que esta migração faz:
--  1) Cria (ou recria) a função public.sincroniza_email_perfil(). Ela NÃO está ligada a nenhum gatilho.
--     A migração 011 revoga os privilégios dela, por isso a função precisa existir.
--
-- O que esta migração NÃO faz:
--  - não cria gatilho em auth.users;
--  - não altera profiles.email de nenhum perfil existente (sem backfill);
--  - não apaga nem atualiza linhas de nenhuma tabela.
--
-- A ativação da sincronização automática (gatilho) é uma decisão separada: ver a proposta
-- explicada no relatório. Só deve ser aplicada depois de aprovada.
-- ============================================================================

create or replace function public.sincroniza_email_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    -- Quando ativada: a troca de e-mail do login nunca pode falhar por causa do perfil.
    begin
      update public.profiles set email = lower(new.email) where id = new.id;
    exception when unique_violation then
      raise warning 'profiles.email não atualizado para o usuário %: endereço já usado por outro perfil', new.id;
    end;
  end if;
  return new;
end;
$$;
