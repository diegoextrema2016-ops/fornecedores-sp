-- ============================================================================
-- Migração 020: checagem de existência de fornecedor para a resposta HTTP 404
--
-- Problema: /fornecedor/<slug-que-não-existe> respondia 200 (a casca do site). Motores de busca
-- tratam isso como página válida ("soft 404").
--
-- Solução: a função abaixo responde só sim/não, para o servidor decidir o status HTTP. Ela não devolve
-- nome, dados ou contato. Ela não expõe a tabela: roda como security definer e só retorna booleano.
-- Visitantes continuam vendo a mesma tela de "para assinantes" de antes.
-- ============================================================================

create or replace function public.fornecedor_existe(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.suppliers where slug = p_slug);
$$;

revoke all on function public.fornecedor_existe(text) from public;
grant execute on function public.fornecedor_existe(text) to anon, authenticated;
