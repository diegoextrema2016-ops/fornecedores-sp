-- Dados de TESTE (banco local). Personas com ids fixos; fornecedores de exemplo com contato e fotos.
-- Usuários entram com os gatilhos normais: o trigger handle_new_user cria o perfil de cada um.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a001', 'sem-assinatura@teste.local', '{"name":"Sem Assinatura"}'),
  ('00000000-0000-0000-0000-00000000a002', 'expirado@teste.local',       '{"name":"Expirado"}'),
  ('00000000-0000-0000-0000-00000000a003', 'ativo@teste.local',          '{"name":"Assinante Ativo"}'),
  ('00000000-0000-0000-0000-00000000a004', 'dono@teste.local',           '{"name":"Dono Fornecedor"}'),
  ('00000000-0000-0000-0000-00000000a005', 'admin@teste.local',          '{"name":"Admin"}'),
  ('00000000-0000-0000-0000-00000000a006', 'fornecedor@teste.local',     '{"name":"Fornecedor Aprovado"}');

-- Daqui em diante, gatilhos de regra de negócio ficam desligados só nesta semeadura (dados de teste conhecidos).
set session_replication_role = replica;

update public.profiles set type = 'admin'      where id = '00000000-0000-0000-0000-00000000a005';
update public.profiles set type = 'fornecedor' where id in ('00000000-0000-0000-0000-00000000a004', '00000000-0000-0000-0000-00000000a006');

insert into public.subscriptions (user_id, plan, amount, starts_at, expires_at, status) values
  ('00000000-0000-0000-0000-00000000a001', 'anual', 1, now(), now() + interval '30 days', 'pending'),
  ('00000000-0000-0000-0000-00000000a002', 'anual', 1, now() - interval '400 days', now() - interval '1 day', 'active'),
  ('00000000-0000-0000-0000-00000000a003', 'anual', 1, now(), now() + interval '300 days', 'active'),
  ('00000000-0000-0000-0000-00000000a005', 'anual', 1, now(), now() + interval '300 days', 'active');

with cat as (select id from public.categories order by sort_order limit 1),
     reg as (select slug from public.regions order by sort_order limit 1)
insert into public.suppliers (id, owner_id, name, slug, description, category_id, bairro, approval_status, is_demo, supplier_type, sale_wholesale, verified)
select v.id::uuid, v.owner::uuid, v.name, v.slug, v.descr, cat.id, reg.slug, v.status, false, 'atacadista', true, v.verified
from cat, reg, (values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a006', 'Loja Aprovada Um', 'loja-aprovada-um', 'Descrição privada da loja um', 'approved', true),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000a006', 'Loja Aprovada Dois', 'loja-aprovada-dois', 'Descrição privada da loja dois', 'approved', false),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000a004', 'Loja Pendente do Dono', 'loja-pendente-dono', 'Cadastro pendente do dono', 'pending', false),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000a006', 'Loja Pendente Outra', 'loja-pendente-outra', 'Cadastro pendente de outro', 'pending', false)
) as v(id, owner, name, slug, descr, status, verified);

insert into public.supplier_photos (supplier_id, url, position) values
  ('10000000-0000-0000-0000-000000000001', 'https://x.supabase.co/storage/v1/object/public/supplier-images/a/1.webp', 0),
  ('10000000-0000-0000-0000-000000000001', 'https://x.supabase.co/storage/v1/object/public/supplier-images/a/2.webp', 1),
  ('10000000-0000-0000-0000-000000000003', 'https://x.supabase.co/storage/v1/object/public/supplier-images/b/1.webp', 0);

insert into public.supplier_contacts (supplier_id, responsible, email, whatsapp, instagram) values
  ('10000000-0000-0000-0000-000000000001', 'Contato Um', 'um@teste.local', '5511999990001', 'loja_um'),
  ('10000000-0000-0000-0000-000000000003', 'Contato Dono', 'dono@teste.local', '5511999990003', 'loja_dono');

set session_replication_role = origin;
