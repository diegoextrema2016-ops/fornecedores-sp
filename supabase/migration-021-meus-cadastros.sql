-- ============================================================================
-- Migração 021: o dono vê o status do próprio cadastro de fornecedor
--
-- Problema: a tela "Minha conta" tenta ler suppliers filtrando por owner_id. A migração 008 tirou
-- owner_id da leitura da API (de propósito), então a consulta é recusada e o cartão nunca aparece.
--
-- Solução: função que devolve só os cadastros de quem está logado, só nome e status. owner_id e os demais
-- campos continuam fora da API. Visitantes não chamam a função (ela exige login).
-- ============================================================================

create or replace function public.meus_cadastros()
returns table (name text, approval_status text)
language sql
stable
security definer
set search_path = public
as $$
  select s.name, s.approval_status
  from public.suppliers s
  where s.owner_id = auth.uid()
  order by s.created_at desc;
$$;

revoke all on function public.meus_cadastros() from public, anon;
grant execute on function public.meus_cadastros() to authenticated;
