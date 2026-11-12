-- Papel de login do BUILD, somente no banco de TESTE. Em produção a criação é manual, com senha gerada e
-- guardada no cofre (ver docs/proposta-protecao-catalogo.md, seção 5). Nunca colocar senha real no repositório.
create role build_publico login password 'teste-local-nao-usar' connection limit 2;
alter role build_publico set statement_timeout = '10s';
alter role build_publico set default_transaction_read_only = on;
grant usage on schema public to build_publico;
grant execute on function public.catalogo_slugs() to build_publico;
