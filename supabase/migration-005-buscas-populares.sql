-- Buscas feitas no site (alimenta os "Populares" da home).
-- Rode uma vez no SQL Editor do Supabase. Não há leitura direta da tabela: só pelas funções abaixo.

create table if not exists public.buscas (
  id        bigint generated always as identity primary key,
  termo     text not null check (char_length(termo) between 2 and 60),
  criada_em timestamptz not null default now()
);

alter table public.buscas enable row level security;

-- Registra uma busca (termo em minúsculas, sem espaços nas pontas). Qualquer visitante pode chamar.
create or replace function public.registra_busca(p_termo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := lower(btrim(p_termo));
begin
  if char_length(t) between 2 and 60 then
    insert into public.buscas (termo) values (t);
  end if;
end;
$$;

-- Termos mais buscados nos últimos 60 dias, com pelo menos 2 buscas.
create or replace function public.buscas_populares(p_limite int default 5)
returns table (termo text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select b.termo, count(*) as total
  from public.buscas b
  where b.criada_em > now() - interval '60 days'
  group by b.termo
  having count(*) >= 2
  order by total desc, b.termo
  limit greatest(p_limite, 1);
$$;

grant execute on function public.registra_busca(text) to anon, authenticated;
grant execute on function public.buscas_populares(int) to anon, authenticated;
