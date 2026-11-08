-- ============================================================================
-- Migração 003: ajustes para o site ler e gravar direto no banco.
--  1) Subcategoria em texto no fornecedor (o site usa texto livre, não a tabela subcategories).
--  2) Todos leem o nome de todas as categorias. Categorias inativas continuam escondidas
--     das listas pelo próprio site; isso evita que um fornecedor perca o nome da categoria.
-- Pode ser executada mais de uma vez sem erro. Rode no SQL Editor, depois de migration-002-fase1.sql.
-- ============================================================================

alter table public.suppliers add column if not exists subcategory text not null default '';

drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read" on public.categories
  for select using (true);
