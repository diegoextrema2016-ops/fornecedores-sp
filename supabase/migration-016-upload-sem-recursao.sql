-- Migração 016: corrige a recursão infinita (42P17) no envio de logos e fotos.
-- A política de INSERT conferia o limite de arquivos consultando storage.objects,
-- o que disparava as próprias políticas de SELECT e voltava para a mesma política.
-- A contagem passa para uma função com security definer, que não cai nessa recursão.
-- O limite de 200 arquivos por conta continua valendo.

create or replace function public.armazenamento_tem_espaco(p_uid text)
returns boolean
language sql
security definer
stable
set search_path = public, storage
as $$
  select (
    select count(*)
    from storage.objects o
    where o.bucket_id = 'supplier-images'
      and (storage.foldername(o.name))[1] = p_uid
  ) < 200;
$$;

revoke all on function public.armazenamento_tem_espaco(text) from public, anon;
grant execute on function public.armazenamento_tem_espaco(text) to authenticated;

drop policy if exists "supplier_images_owner_upload" on storage.objects;
create policy "supplier_images_owner_upload" on storage.objects
  for insert with check (
    bucket_id = 'supplier-images'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.armazenamento_tem_espaco(auth.uid()::text)
  );
