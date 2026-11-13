-- Correção: o limite de 200 arquivos por pasta bloqueava o administrador.
-- O administrador envia as fotos de todos os fornecedores para a própria pasta,
-- então, ao passar de 200 imagens, nenhum novo cadastro com foto era aceito
-- ("new row violates row-level security policy").
-- Agora o administrador envia sem o limite; contas comuns continuam limitadas
-- à própria pasta e a 200 arquivos.

drop policy if exists "supplier_images_owner_upload" on storage.objects;
create policy "supplier_images_owner_upload" on storage.objects
  for insert with check (
    bucket_id = 'supplier-images'
    and (
      public.is_admin()
      or (
        auth.uid()::text = (storage.foldername(name))[1]
        and (
          select count(*) from storage.objects o
          where o.bucket_id = 'supplier-images' and (storage.foldername(o.name))[1] = auth.uid()::text
        ) < 200
      )
    )
  );
