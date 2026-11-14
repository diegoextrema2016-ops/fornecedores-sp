-- ============================================================================
-- Migração 007: catálogo fechado para assinantes.
-- Rode DEPOIS das migrações 002 a 006. Pode ser executada mais de uma vez (idempotente).
-- Não apaga nenhum dado.
--
-- O que muda:
--  1) Função pode_ver_catalogo(): administrador (type = 'admin') ou assinatura ativa e vigente.
--     Sem período de carência: a assinatura expirada perde o acesso na hora (regra 5 do plano).
--  2) Fornecedores e fotos deixam de ser legíveis por visitantes e por cadastrados sem assinatura.
--     O dono continua vendo os próprios cadastros, inclusive pendentes.
--  3) Favoritos só para quem pode ver o catálogo.
--  4) Função fornecedor_do_usuario(): checagem de dono sem depender de ler owner_id (usada pela 008).
--
-- Efeito esperado: nenhuma linha de fornecedor, foto ou favorito é devolvida a visitantes.
-- ============================================================================

-- ---------- 1) Quem pode ver o catálogo ----------
create or replace function public.pode_ver_catalogo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.has_active_subscription();
$$;
grant execute on function public.pode_ver_catalogo() to anon, authenticated;

-- ---------- 2) Dono do fornecedor (retorna só true/false; não expõe owner_id) ----------
create or replace function public.fornecedor_do_usuario(p_supplier uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.suppliers s
    where s.id = p_supplier and s.owner_id = auth.uid()
  );
$$;
grant execute on function public.fornecedor_do_usuario(uuid) to anon, authenticated;

-- ---------- 3) Fornecedores: catálogo só para quem pode ver ----------
drop policy if exists "suppliers_public_read_approved" on public.suppliers;
drop policy if exists "suppliers_catalog_read" on public.suppliers;
create policy "suppliers_catalog_read" on public.suppliers
  for select using (approval_status = 'approved' and public.pode_ver_catalogo());

-- ---------- 4) Fotos: seguem o fornecedor (catálogo ou dono) ----------
drop policy if exists "photos_public_read_approved" on public.supplier_photos;
drop policy if exists "photos_catalog_read" on public.supplier_photos;
create policy "photos_catalog_read" on public.supplier_photos
  for select using (
    (public.pode_ver_catalogo() and exists (
      select 1 from public.suppliers s
      where s.id = supplier_id and s.approval_status = 'approved'))
    or public.fornecedor_do_usuario(supplier_id)
  );

-- ---------- 5) Favoritos: só com acesso ao catálogo ----------
drop policy if exists "favorites_own" on public.favorites;
create policy "favorites_own" on public.favorites
  for all using (user_id = auth.uid() and public.pode_ver_catalogo())
  with check (user_id = auth.uid() and public.pode_ver_catalogo());

-- Categorias, subcategorias e regiões continuam legíveis: têm só nomes e textos gerais,
-- sem fornecedores, contagens ou informações comerciais (decisão D1).
