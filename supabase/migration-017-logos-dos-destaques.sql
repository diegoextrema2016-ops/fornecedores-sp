-- ============================================================================
-- Migração 017: logos dos destaques visíveis para visitantes, com o depósito privado
--
-- Problema: a home mostra os fornecedores em destaque para visitantes (migração 014), mas o
-- depósito de imagens é privado (migração 009). O logo só abria por uma cópia antiga em cache.
--
-- Solução: uma regra de leitura a mais, que vale somente para o arquivo que é o logo de um
-- fornecedor aprovado e marcado como destaque. O site pede um link assinado para esses arquivos.
--
-- O que NÃO muda: o depósito continua privado; fotos, logos dos demais fornecedores, contatos e
-- fichas continuam restritos; as regras de assinantes, donos e administradores ficam como estão.
-- Quando o fornecedor sai dos destaques, a regra deixa de valer para o logo dele na hora
-- (um link já emitido ainda funciona por até 1 hora, que é a validade da assinatura).
-- ============================================================================

create or replace function public.logo_de_destaque(p_caminho text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.suppliers s
    where s.featured
      and s.approval_status = 'approved'
      and s.logo_url is not null
      and split_part(s.logo_url, '/supplier-images/', 2) = p_caminho
  );
$$;

revoke all on function public.logo_de_destaque(text) from public;
grant execute on function public.logo_de_destaque(text) to anon, authenticated;

drop policy if exists "supplier_images_logo_destaque_read" on storage.objects;
create policy "supplier_images_logo_destaque_read" on storage.objects
  for select using (bucket_id = 'supplier-images' and public.logo_de_destaque(name));
