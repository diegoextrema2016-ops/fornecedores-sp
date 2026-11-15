-- Migração 014: destaques da home visíveis para todos os visitantes, sem contatos.
-- A visão lista só fornecedores marcados como destaque e aprovados, e só colunas públicas.
-- WhatsApp, Instagram, telefone, endereço e e-mail continuam só em supplier_contacts (assinantes).
create or replace view public.destaques_publicos as
select s.id, s.name, s.slug, s.description, s.category_id, s.subcategory, s.bairro, s.city, s.tags, s.logo_url, s.verified
from public.suppliers s
where s.featured = true and s.approval_status = 'approved';

grant select on public.destaques_publicos to anon, authenticated;
