-- Migração 015: a visão pública de destaques passa a expor created_at,
-- para que visitantes e assinantes vejam os mesmos fornecedores na mesma ordem.
-- Só acrescenta uma coluna ao final; não altera dados nem políticas.
create or replace view public.destaques_publicos as
select s.id, s.name, s.slug, s.description, s.category_id, s.subcategory, s.bairro, s.city, s.tags, s.logo_url, s.verified, s.created_at
from public.suppliers s
where s.featured = true and s.approval_status = 'approved';

grant select on public.destaques_publicos to anon, authenticated;
