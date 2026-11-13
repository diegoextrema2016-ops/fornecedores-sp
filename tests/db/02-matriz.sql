-- Medições feitas com as permissões de cada papel (RLS e grants reais). Só leitura.
-- Colunas e linhas que o papel não pode ler aparecem como "negado" em vez de derrubar a medição.
create or replace function public.__owner_id_visivel() returns text language plpgsql as $$
begin
  perform owner_id from public.suppliers limit 1;
  return 'sim';
exception when insufficient_privilege then
  return 'negado';
end $$;

create or replace function public.__matriz() returns table (metrica text, valor text)
language sql stable as $$
  select 'fornecedores_visiveis', count(*)::text from public.suppliers
  union all select 'fornecedores_nao_aprovados_visiveis', count(*)::text from public.suppliers where approval_status <> 'approved'
  union all select 'fornecedores_demo_visiveis', count(*)::text from public.suppliers where is_demo
  union all select 'owner_id_em_fornecedores', public.__owner_id_visivel()
  union all select 'contatos_visiveis', count(*)::text from public.supplier_contacts
  union all select 'whatsapp_visivel', count(whatsapp)::text from public.supplier_contacts
  union all select 'endereco_visivel', count(*)::text from public.supplier_contacts where address <> ''
  union all select 'fotos_visiveis', count(*)::text from public.supplier_photos
  union all select 'perfis_visiveis', count(*)::text from public.profiles
  union all select 'assinaturas_visiveis', count(*)::text from public.subscriptions
  union all select 'favoritos_visiveis', count(*)::text from public.favorites
  union all select 'storage_objetos_visiveis', count(*)::text from storage.objects
  union all select 'categorias_visiveis', count(*)::text from public.categories
  union all select 'regioes_visiveis', count(*)::text from public.regions
$$;
grant execute on function public.__matriz() to anon, authenticated;
grant execute on function public.__owner_id_visivel() to anon, authenticated;
