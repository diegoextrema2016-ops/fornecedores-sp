-- Migração 007: catálogo exclusivo para assinantes ativos.
-- STATUS: CANDIDATA. Testada só em banco local de teste (tests/rls). NÃO aplicar em produção sem aprovação.
--
-- Regras:
--   visitante (sem login)        : nada do catálogo (privilégio revogado; a API responde "permissão negada").
--   cadastrado sem assinatura    : categorias ativas, subcategorias e bairros (para o cadastro de fornecedor). Nada de fornecedor.
--   assinante ativo              : fornecedores aprovados, fotos e contatos (contatos já são protegidos na migração 006).
--   fornecedor dono              : os próprios cadastros em qualquer status (políticas *_owner_* já existentes, mantidas).
--   admin                        : tudo (políticas *_admin_* já existentes, mantidas).
--   build (papel build_publico)  : só executa catalogo_slugs(), que devolve tipo e slug. Nada mais.
begin;

-- ---------- Taxonomia: cadastrados (autenticados) leem; visitante não ----------
revoke select on public.categories, public.subcategories, public.regions from anon;

drop policy if exists "categories_public_read" on public.categories;
create policy "categories_authenticated_read" on public.categories
  for select to authenticated
  using (status = 'active');

drop policy if exists "subcategories_public_read" on public.subcategories;
create policy "subcategories_authenticated_read" on public.subcategories
  for select to authenticated
  using (true);

drop policy if exists "regions_public_read" on public.regions;
create policy "regions_authenticated_read" on public.regions
  for select to authenticated
  using (true);

-- ---------- Fornecedores: só assinante ativo lê os aprovados ----------
revoke select on public.suppliers, public.supplier_photos from anon;

drop policy if exists "suppliers_public_read_approved" on public.suppliers;
create policy "suppliers_subscriber_read_approved" on public.suppliers
  for select to authenticated
  using (approval_status = 'approved' and public.has_active_subscription());

drop policy if exists "photos_public_read_approved" on public.supplier_photos;
create policy "photos_subscriber_read_approved" on public.supplier_photos
  for select to authenticated
  using (
    exists (select 1 from public.suppliers s where s.id = supplier_id and s.owner_id = auth.uid())
    or (
      public.has_active_subscription()
      and exists (select 1 from public.suppliers s where s.id = supplier_id and s.approval_status = 'approved')
    )
  );

-- ---------- Build: uma função, só slugs ----------
-- Roda como dono (bypass de RLS) mas devolve apenas tipo e slug. Sem nome, descrição, foto, contato ou contagem.
create or replace function public.catalogo_slugs()
returns table (tipo text, slug text)
language sql
stable
security definer
set search_path = public
as $$
  select 'categoria'::text, c.slug from public.categories c where c.status <> 'inactive'
  union all
  select 'regiao'::text, r.slug from public.regions r
  union all
  select 'fornecedor'::text, s.slug from public.suppliers s
  where s.approval_status = 'approved' and s.is_demo = false
$$;

revoke all on function public.catalogo_slugs() from public, anon, authenticated;

-- O papel de login do build NÃO é criado aqui (não pode haver senha no repositório).
-- Criação manual, com senha gerada e guardada no cofre do GitHub/Vercel. Ver docs/proposta-protecao-catalogo.md, seção 5.

commit;
