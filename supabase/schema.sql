-- ============================================================================
-- SP FORNECEDORES — esquema do banco (Supabase / PostgreSQL)
-- Execute este arquivo no SQL Editor do Supabase (uma única vez, em projeto novo).
-- Depois, crie um usuário administrador (ver README.md, seção "Banco de dados").
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------- Perfis (espelha auth.users) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  type        text not null default 'comprador'
              check (type in ('comprador', 'fornecedor', 'moderador', 'admin')),
  created_at  timestamptz not null default now()
);

-- ---------- Categorias e subcategorias ----------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text not null default '',
  icon        text not null default '📦',
  image_url   text,
  status      text not null default 'active' check (status in ('active', 'inactive')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.subcategories (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  name        text not null,
  slug        text not null,
  unique (category_id, slug)
);

-- ---------- Fornecedores ----------
create table if not exists public.suppliers (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid references public.profiles(id) on delete set null,
  name                text not null check (char_length(name) between 2 and 120),
  slug                text not null unique,
  description         text not null default '' check (char_length(description) <= 600),
  category_id         uuid references public.categories(id) on delete restrict,
  subcategory_id      uuid references public.subcategories(id) on delete set null,
  supplier_type       text check (supplier_type in ('fabricante', 'distribuidor', 'atacadista', 'varejista')),
  bairro              text not null default '',   -- slug da região (ex.: 25-de-marco, bras, pari)
  city                text not null default 'São Paulo',
  state               char(2) not null default 'SP',
  sale_wholesale      boolean not null default false,
  sale_retail         boolean not null default false,
  sale_resellers      boolean not null default false,
  ships_other_cities  boolean not null default false,
  min_order           text not null default '',
  hours               text not null default '',
  tags                text[] not null default '{}',
  logo_url            text,
  approval_status     text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  verified            boolean not null default false,   -- selo "verificado", controlado só pelo admin
  featured            boolean not null default false,   -- destaque na home, controlado só pelo admin
  is_demo             boolean not null default false,
  views               int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists suppliers_category_idx on public.suppliers(category_id);
create index if not exists suppliers_bairro_idx on public.suppliers(bairro);
create index if not exists suppliers_status_idx on public.suppliers(approval_status);
create index if not exists suppliers_search_idx on public.suppliers
  using gin (to_tsvector('portuguese', coalesce(name,'') || ' ' || coalesce(description,'')));

-- ---------- Contatos (protegidos: só dono, admin e assinante ativo leem) ----------
create table if not exists public.supplier_contacts (
  supplier_id uuid primary key references public.suppliers(id) on delete cascade,
  responsible text not null default '',
  email       text not null default '',
  whatsapp    text,           -- somente dígitos, com DDI quando possível (ex.: 5511987654321)
  whatsapp_url text,          -- link de WhatsApp quando não há número
  instagram   text,           -- handle sem @
  site        text,
  address     text not null default '',
  number      text not null default '',
  complement  text not null default '',
  cep         text not null default ''
);

-- ---------- Assinaturas (Pix confirmado manualmente pelo admin) ----------
create table if not exists public.subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  plan         text not null default 'anual',
  amount       numeric(10,2) not null,
  starts_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  status       text not null default 'pending' check (status in ('pending', 'active', 'cancelled')),
  payment_note text not null default '',   -- ex.: data do Pix conferido
  created_at   timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions(user_id);

create or replace function public.has_active_subscription()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = auth.uid() and s.status = 'active' and s.expires_at > now()
  );
$$;

create table if not exists public.supplier_photos (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  url         text not null,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- Favoritos ----------
create table if not exists public.favorites (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, supplier_id)
);

-- ---------- Funções auxiliares ----------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.type = 'admin'
  );
$$;

-- Impede que usuários comuns alterem colunas de controle (status, selo, destaque, dono).
create or replace function public.guard_supplier_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.approval_status := 'pending';
    new.verified := false;
    new.featured := false;
    new.is_demo := false;
    new.views := 0;
    new.owner_id := auth.uid();
  else
    new.approval_status := old.approval_status;
    new.verified := old.verified;
    new.featured := old.featured;
    new.is_demo := old.is_demo;
    new.views := old.views;
    new.owner_id := old.owner_id;
  end if;
  return new;
end;
$$;

drop trigger if exists suppliers_guard on public.suppliers;
create trigger suppliers_guard
  before insert or update on public.suppliers
  for each row execute function public.guard_supplier_columns();

-- Incrementa visualizações de um fornecedor aprovado (sem expor UPDATE público).
create or replace function public.increment_supplier_views(p_supplier_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.suppliers set views = views + 1
  where id = p_supplier_id and approval_status = 'approved';
$$;
grant execute on function public.increment_supplier_views(uuid) to anon, authenticated;

-- ---------- Row Level Security ----------
alter table public.profiles        enable row level security;
alter table public.categories      enable row level security;
alter table public.subcategories   enable row level security;
alter table public.suppliers       enable row level security;
alter table public.supplier_photos enable row level security;
alter table public.favorites       enable row level security;
alter table public.supplier_contacts enable row level security;
alter table public.subscriptions enable row level security;

-- Perfis: cada um vê e edita o próprio nome; ninguém muda o próprio tipo.
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own_name" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and type = (select p.type from public.profiles p where p.id = auth.uid()));
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Categorias: todos leem as ativas; só admin escreve.
create policy "categories_public_read" on public.categories
  for select using (status = 'active' or public.is_admin());
create policy "categories_admin_write" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

create policy "subcategories_public_read" on public.subcategories
  for select using (true);
create policy "subcategories_admin_write" on public.subcategories
  for all using (public.is_admin()) with check (public.is_admin());

-- Fornecedores: público vê só aprovados; dono vê e edita os próprios; admin tudo.
create policy "suppliers_public_read_approved" on public.suppliers
  for select using (approval_status = 'approved');
create policy "suppliers_owner_read" on public.suppliers
  for select using (owner_id = auth.uid());
create policy "suppliers_insert_pending" on public.suppliers
  for insert with check (auth.uid() is not null or public.is_admin());
create policy "suppliers_owner_update" on public.suppliers
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "suppliers_owner_delete" on public.suppliers
  for delete using (owner_id = auth.uid());
create policy "suppliers_admin_all" on public.suppliers
  for all using (public.is_admin()) with check (public.is_admin());

-- Fotos: seguem o fornecedor.
create policy "photos_public_read_approved" on public.supplier_photos
  for select using (exists (select 1 from public.suppliers s
    where s.id = supplier_id and (s.approval_status = 'approved' or s.owner_id = auth.uid())));
create policy "photos_owner_write" on public.supplier_photos
  for all using (exists (select 1 from public.suppliers s where s.id = supplier_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.suppliers s where s.id = supplier_id and s.owner_id = auth.uid()));
create policy "photos_admin_all" on public.supplier_photos
  for all using (public.is_admin()) with check (public.is_admin());

-- Contatos: dono do fornecedor, admin e assinante ativo. Visitante comum não lê.
create policy "contacts_read_subscribers" on public.supplier_contacts
  for select using (
    public.is_admin()
    or public.has_active_subscription()
    or exists (select 1 from public.suppliers s where s.id = supplier_id and s.owner_id = auth.uid())
  );
create policy "contacts_write_owner_admin" on public.supplier_contacts
  for all using (
    public.is_admin()
    or exists (select 1 from public.suppliers s where s.id = supplier_id and s.owner_id = auth.uid())
  ) with check (
    public.is_admin()
    or exists (select 1 from public.suppliers s where s.id = supplier_id and s.owner_id = auth.uid())
  );

-- Assinaturas: cada um vê as próprias; só admin cria ou confirma.
create policy "subscriptions_read_own_or_admin" on public.subscriptions
  for select using (user_id = auth.uid() or public.is_admin());
create policy "subscriptions_admin_write" on public.subscriptions
  for all using (public.is_admin()) with check (public.is_admin());

-- Favoritos: somente o próprio usuário.
create policy "favorites_own" on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Storage (imagens de logos e fotos) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('supplier-images', 'supplier-images', true, 512000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Leitura pública; upload só autenticado, dentro de uma pasta com o próprio id do usuário.
create policy "supplier_images_public_read" on storage.objects
  for select using (bucket_id = 'supplier-images');
create policy "supplier_images_owner_upload" on storage.objects
  for insert with check (bucket_id = 'supplier-images' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "supplier_images_owner_delete" on storage.objects
  for delete using (bucket_id = 'supplier-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------- Dados iniciais: categorias e regiões ----------
insert into public.categories (name, slug, description, icon, sort_order) values
  ('Eletrônicos', 'eletronicos', 'Eletroeletrônicos, áudio, games e pequenos aparelhos.', '🔌', 1),
  ('Vapers e acessórios', 'vapers-e-acessorios', 'Acessórios relacionados. Veja o aviso de conformidade no cadastro.', '🧩', 2),
  ('Moda feminina', 'moda-feminina', 'Vestuário feminino para lojas e revendas.', '👗', 3),
  ('Moda masculina', 'moda-masculina', 'Camisetas, calças, camisas e peças masculinas.', '👔', 4),
  ('Roupas infantis', 'roupas-infantis', 'Roupas para bebês, crianças e adolescentes.', '🧸', 5),
  ('Tênis', 'tenis', 'Tênis esportivos, casuais e de moda.', '👟', 6),
  ('Calçados', 'calcados', 'Sapatos, sandálias, botas e chinelos.', '👞', 7),
  ('Bolsas', 'bolsas', 'Bolsas, mochilas e carteiras.', '👜', 8),
  ('Perfumes', 'perfumes', 'Perfumes e fragrâncias para revenda.', '🧴', 9),
  ('Cosméticos', 'cosmeticos', 'Maquiagem, skincare e higiene pessoal.', '💄', 10),
  ('Acessórios', 'acessorios', 'Acessórios de moda e de uso diário.', '🕶️', 11),
  ('Bijuterias', 'bijuterias', 'Bijuterias, semijoias e acessórios de metal.', '💍', 12),
  ('Relógios', 'relogios', 'Relógios analógicos e digitais.', '⌚', 13),
  ('Óculos', 'oculos', 'Armações, óculos de sol e acessórios.', '👓', 14),
  ('Utilidades domésticas', 'utilidades-domesticas', 'Cozinha, limpeza e organização da casa.', '🏠', 15),
  ('Importados', 'importados', 'Produtos importados e de origem internacional.', '🌎', 16),
  ('Brinquedos', 'brinquedos', 'Brinquedos, jogos e itens de papelaria infantil.', '🪀', 17),
  ('Informática', 'informatica', 'Componentes, periféricos e acessórios de computador.', '💻', 18),
  ('Capinhas e acessórios para celular', 'capinhas-celular', 'Capinhas, películas, cabos e carregadores.', '📱', 19),
  ('Outros segmentos', 'outros-segmentos', 'Outros tipos de fornecedores.', '📦', 20)
on conflict (slug) do nothing;
