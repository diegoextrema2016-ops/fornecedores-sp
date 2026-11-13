-- Protege o campo interno owner_id da tabela suppliers.
-- Antes: visitantes (anon) e usuários logados liam owner_id (identificador do dono) de qualquer ficha.
-- Depois: esse campo deixa de ser lido por anon e authenticated.
--
-- Por que as políticas mudam: as políticas de fotos e de contatos consultavam suppliers por dentro.
-- Essa consulta roda com o privilégio de quem está logado, então, sem acesso a owner_id, o banco
-- negaria a leitura de contatos e fotos para todos. As funções abaixo rodam como dono do banco e
-- devolvem só true ou false, sem dados do fornecedor.
--
-- ORDEM DE PUBLICAÇÃO: 1) publicar o app que pede colunas explícitas (js/api.js);
-- 2) aplicar esta migração. Antes disso, o select=* do app falharia depois da revogação.

create or replace function public.fornecedor_do_usuario(p_supplier uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.suppliers s where s.id = p_supplier and s.owner_id = auth.uid())
$$;

create or replace function public.fornecedor_aprovado(p_supplier uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.suppliers s where s.id = p_supplier and s.approval_status = 'approved')
$$;

grant execute on function public.fornecedor_do_usuario(uuid) to anon, authenticated;
grant execute on function public.fornecedor_aprovado(uuid) to anon, authenticated;

-- Fotos: seguem o fornecedor (aprovado ou do próprio usuário).
drop policy if exists "photos_public_read_approved" on public.supplier_photos;
create policy "photos_public_read_approved" on public.supplier_photos
  for select using (public.fornecedor_aprovado(supplier_id) or public.fornecedor_do_usuario(supplier_id));

drop policy if exists "photos_owner_write" on public.supplier_photos;
create policy "photos_owner_write" on public.supplier_photos
  for all using (public.fornecedor_do_usuario(supplier_id))
  with check (public.fornecedor_do_usuario(supplier_id));

-- Contatos: dono, admin e assinante ativo (com fornecedor aprovado). Visitante e sem assinatura não leem.
drop policy if exists "contacts_read_subscribers" on public.supplier_contacts;
create policy "contacts_read_subscribers" on public.supplier_contacts
  for select using (
    public.is_admin()
    or public.fornecedor_do_usuario(supplier_id)
    or (public.has_active_subscription() and public.fornecedor_aprovado(supplier_id))
  );

drop policy if exists "contacts_write_owner_admin" on public.supplier_contacts;
create policy "contacts_write_owner_admin" on public.supplier_contacts
  for all using (public.is_admin() or public.fornecedor_do_usuario(supplier_id))
  with check (public.is_admin() or public.fornecedor_do_usuario(supplier_id));

-- Colunas de suppliers liberadas (sem owner_id).
revoke select on public.suppliers from anon, authenticated;
grant select (id, name, slug, description, category_id, subcategory_id, subcategory, supplier_type, bairro, city, state, sale_wholesale, sale_retail, sale_resellers, ships_other_cities, min_order, hours, tags, logo_url, approval_status, verified, featured, is_demo, views, created_at, updated_at)
  on public.suppliers to anon, authenticated;
