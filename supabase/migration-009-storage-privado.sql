-- ============================================================================
-- Migração 009: imagens dos fornecedores em Storage privado (somente com URL assinada).
-- Rode DEPOIS das migrações 007 e 008 e DEPOIS de publicar o app que gera URLs assinadas.
-- Pode ser executada mais de uma vez (idempotente). Não apaga nenhum arquivo.
--
-- O que muda:
--  1) Bucket supplier-images deixa de ser público: o link direto não entrega mais a imagem.
--  2) Leitura de imagens: assinante ativo ou administrador lê imagens de fornecedores aprovados;
--     o dono lê as da própria pasta (já existia); o administrador lê tudo (já existia).
--  3) Exclusão: o administrador pode apagar imagens de qualquer dono (botão de limpeza, decisão D4).
--
-- Nota: as URLs guardadas em logo_url e supplier_photos.url continuam no formato
-- /object/public/supplier-images/... (a constraint da migração 006 exige esse formato).
-- O app extrai o caminho dessas URLs e pede uma URL assinada. A URL pública deixa de funcionar.
-- ============================================================================

-- ---------- 1) Bucket privado ----------
update storage.buckets set public = false where id = 'supplier-images';

-- ---------- 2) Leitura: assinante ativo ou admin, imagem de fornecedor aprovado ----------
-- O id do fornecedor é o segundo segmento do caminho: <uid-do-uploader>/<supplier_id>/arquivo.
-- Atenção: dentro da subconsulta, "name" seria suppliers.name. Por isso o caminho é qualificado
-- com storage.objects.name (o teste de acesso pegou esse erro).
DROP POLICY IF EXISTS "supplier_images_catalog_read"
ON storage.objects;

CREATE POLICY "supplier_images_catalog_read"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'supplier-images'
  AND (
    public.is_admin()
    OR (
      public.has_active_subscription()
      AND EXISTS (
        SELECT 1
        FROM public.suppliers s
        WHERE s.approval_status = 'approved'
          AND s.id::text =
            (storage.foldername(storage.objects.name))[2]
      )
    )
  )
);

-- ---------- 3) Exclusão pelo administrador (limpeza de órfãs e troca de imagem de outro dono) ----------
drop policy if exists "supplier_images_admin_delete" on storage.objects;
create policy "supplier_images_admin_delete" on storage.objects
  for delete using (bucket_id = 'supplier-images' and public.is_admin());
