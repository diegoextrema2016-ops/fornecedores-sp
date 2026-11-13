-- Carga de teste como superusuário: desliga triggers só nesta sessão (os dados entram como o banco já tem).
set session_replication_role = replica;
-- Dados fictícios para a matriz de acesso (não são fornecedores reais).
-- Perfis: visitante (sem login), sem assinatura, assinatura vencida, assinatura pendente,
-- assinante ativo, dono de fornecedor, administrador.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'sem-assinatura@teste.test'),
  ('00000000-0000-0000-0000-000000000002', 'vencida@teste.test'),
  ('00000000-0000-0000-0000-000000000003', 'pendente@teste.test'),
  ('00000000-0000-0000-0000-000000000004', 'ativo@teste.test'),
  ('00000000-0000-0000-0000-000000000005', 'dono@teste.test'),
  ('00000000-0000-0000-0000-000000000006', 'admin@teste.test')
on conflict do nothing;

insert into public.profiles (id, name, email, type) values
  ('00000000-0000-0000-0000-000000000001', 'Sem assinatura', 'sem-assinatura@teste.test', 'comprador'),
  ('00000000-0000-0000-0000-000000000002', 'Vencida', 'vencida@teste.test', 'comprador'),
  ('00000000-0000-0000-0000-000000000003', 'Pendente', 'pendente@teste.test', 'comprador'),
  ('00000000-0000-0000-0000-000000000004', 'Ativo', 'ativo@teste.test', 'comprador'),
  ('00000000-0000-0000-0000-000000000005', 'Dono', 'dono@teste.test', 'fornecedor'),
  ('00000000-0000-0000-0000-000000000006', 'Admin', 'admin@teste.test', 'admin') on conflict (id) do update set name = excluded.name, email = excluded.email, type = excluded.type;

insert into public.categories (id, name, slug, sort_order, status) values
  ('10000000-0000-0000-0000-000000000001', 'Moda feminina', 'moda-feminina', 1, 'active'),
  ('10000000-0000-0000-0000-000000000002', 'Bolsas', 'bolsas', 2, 'active')
on conflict (slug) do nothing;
insert into public.regions (slug, name, sort_order) values ('bras', 'Brás', 1), ('pari', 'Pari', 2) on conflict (slug) do nothing;

-- Fornecedores em todos os estados: aprovado (com contato), pendente, recusado e aprovado de demonstração.
insert into public.suppliers (id, owner_id, name, slug, description, category_id, bairro, city, state, approval_status, is_demo) values
  ('20000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000005', 'Loja Aprovada', 'loja-aprovada', 'Roupas femininas para revenda.', (select id from public.categories where slug = 'moda-feminina'), 'bras', 'São Paulo', 'SP', 'approved', false),
  ('20000000-0000-0000-0000-000000000012', null, 'Loja Pendente', 'loja-pendente', 'Aguardando aprovação.', (select id from public.categories where slug = 'moda-feminina'), 'bras', 'São Paulo', 'SP', 'pending', false),
  ('20000000-0000-0000-0000-000000000013', null, 'Loja Recusada', 'loja-recusada', 'Recusada no cadastro.', (select id from public.categories where slug = 'bolsas'), 'pari', 'São Paulo', 'SP', 'rejected', false),
  ('20000000-0000-0000-0000-000000000014', null, 'Loja Demo', 'loja-demo', 'Exemplo de demonstração.', (select id from public.categories where slug = 'bolsas'), 'pari', 'São Paulo', 'SP', 'approved', true);

insert into public.supplier_contacts (supplier_id, responsible, email, whatsapp, instagram, site, address, number, complement, cep) values
  ('20000000-0000-0000-0000-000000000011', 'Responsável Teste', 'contato@teste.test', '5511999990000', 'lojateste', 'loja.teste.test', 'Rua Teste', '10', 'sala 1', '01000000'),
  ('20000000-0000-0000-0000-000000000012', 'Pendente Teste', 'pendente-contato@teste.test', '5511999991111', 'pendente', null, 'Rua Pendente', '20', '', '01001000');

insert into public.supplier_photos (supplier_id, url, position) values
  ('20000000-0000-0000-0000-000000000011', 'https://teste.supabase.co/storage/v1/object/public/supplier-images/teste/foto-aprovada.webp', 0),
  ('20000000-0000-0000-0000-000000000012', 'https://teste.supabase.co/storage/v1/object/public/supplier-images/teste/foto-pendente.webp', 0);

insert into public.subscriptions (user_id, plan, amount, starts_at, expires_at, status) values
  ('00000000-0000-0000-0000-000000000002', 'mensal', 29.90, now() - interval '40 days', now() - interval '10 days', 'active'),
  ('00000000-0000-0000-0000-000000000003', 'mensal', 29.90, now(), now() + interval '30 days', 'pending'),
  ('00000000-0000-0000-0000-000000000004', 'mensal', 29.90, now() - interval '1 day', now() + interval '29 days', 'active');

insert into public.favorites (user_id, supplier_id) values
  ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000011');
reset session_replication_role;

-- Arquivo de foto do dono (pasta do dono) para testar a listagem do bucket.
insert into storage.objects (bucket_id, name, owner) values
  ('supplier-images', '00000000-0000-0000-0000-000000000005/20000000-0000-0000-0000-000000000011/logo.webp', '00000000-0000-0000-0000-000000000005');
