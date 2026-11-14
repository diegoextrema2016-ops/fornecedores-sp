-- ============================================================================
-- Migração 008: o campo owner_id deixa de ser legível pela API.
-- Rode DEPOIS da migração 007 e DEPOIS de publicar o app que pede colunas explícitas
-- (js/api.js: SUPPLIER_COLUMNS). Antes disso, select=* e RETURNING * falhariam.
-- Pode ser executada mais de uma vez (idempotente). Não apaga nenhum dado.
--
-- Por que: owner_id identifica o dono de cada fornecedor (decisão D7). Visitantes e cadastrados
-- não precisam dele. Como o privilégio de coluna vale para quem executa a consulta, as políticas
-- que comparavam s.owner_id = auth.uid() por dentro de subconsultas deixariam de funcionar.
-- Por isso elas passam a usar fornecedor_do_usuario(id), que roda com privilégio do dono do banco
-- e devolve só true ou false.
-- ============================================================================

-- ---------- 1) Políticas de fornecedores: dono checado pela função ----------
-- Leitura do dono usa owner_id = auth.uid() direto (não a função): em INSERT ... RETURNING a função
-- não enxerga a linha recém-inserida na mesma instrução, e o cadastro falharia. A expressão de
-- política não depende do privilégio de coluna, então isso não reabre owner_id para a API.
drop policy if exists "suppliers_owner_read" on public.suppliers;
create policy "suppliers_owner_read" on public.suppliers
  for select using (owner_id = auth.uid());

drop policy if exists "suppliers_owner_update" on public.suppliers;
create policy "suppliers_owner_update" on public.suppliers
  for update using (public.fornecedor_do_usuario(id))
  with check (public.fornecedor_do_usuario(id));

drop policy if exists "suppliers_owner_delete" on public.suppliers;
create policy "suppliers_owner_delete" on public.suppliers
  for delete using (public.fornecedor_do_usuario(id));

-- ---------- 2) Fotos e contatos: dono checado pela função ----------
drop policy if exists "photos_owner_write" on public.supplier_photos;
create policy "photos_owner_write" on public.supplier_photos
  for all using (public.fornecedor_do_usuario(supplier_id))
  with check (public.fornecedor_do_usuario(supplier_id));

drop policy if exists "contacts_read_subscribers" on public.supplier_contacts;
create policy "contacts_read_subscribers" on public.supplier_contacts
  for select using (
    public.is_admin()
    or public.fornecedor_do_usuario(supplier_id)
    or (
      public.has_active_subscription()
      and exists (select 1 from public.suppliers s where s.id = supplier_id and s.approval_status = 'approved')
    )
  );

drop policy if exists "contacts_write_owner_admin" on public.supplier_contacts;
create policy "contacts_write_owner_admin" on public.supplier_contacts
  for all using (public.is_admin() or public.fornecedor_do_usuario(supplier_id))
  with check (public.is_admin() or public.fornecedor_do_usuario(supplier_id));

-- ---------- 3) Privilégio de coluna: owner_id fora da API ----------
-- Revoga a leitura da tabela inteira e concede somente as colunas que o site usa.
-- INSERT, UPDATE e DELETE continuam válidos pelas políticas acima.
revoke select on public.suppliers from anon, authenticated;
grant select (
  id, name, slug, description, category_id, subcategory_id, subcategory, supplier_type,
  bairro, city, state, sale_wholesale, sale_retail, sale_resellers, ships_other_cities,
  min_order, hours, tags, logo_url, approval_status, verified, featured, is_demo, views,
  created_at, updated_at
) on public.suppliers to anon, authenticated;

-- ---------- 4) Privilégios: o mínimo que o app usa; o RLS faz o resto ----------
-- Os privilégios padrão do Supabase dão tudo a anon e authenticated. Corrigimos:
--  a) TRUNCATE, REFERENCES e TRIGGER saem de todas as tabelas. TRUNCATE APAGA A TABELA INTEIRA e ignora o RLS:
--     sem isso, qualquer conta logada poderia esvaziar suppliers. O app não usa nenhum dos três.
--  b) anon não escreve em nenhuma tabela pública (o RLS já bloqueava, mas o privilégio não deve existir).
--  c) anon não lê perfis, assinaturas nem favoritos (o site não consulta essas tabelas sem login).
--     supplier_photos e supplier_contacts continuam legíveis por anon porque o select embutido de
--     suppliers exige o privilégio de tabela; o RLS retorna zero linhas para visitante.
--  d) rate_limits e buscas são uso interno: só as funções security definer acessam.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;
revoke all on public.profiles, public.subscriptions, public.favorites from anon;
revoke all on public.rate_limits from anon, authenticated;
revoke all on public.buscas from anon, authenticated;
