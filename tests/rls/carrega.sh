#!/bin/sh
# Cria o banco de TESTE local, aplica o shim e o schema real do repositório na ordem das migrações.
# Uso: sh tests/rls/carrega.sh <socket_dir> <porta> <nome_do_banco>
set -e
DIR=$(cd "$(dirname "$0")/../.." && pwd)
SOCK=$1; PORTA=$2; DB=$3
P="psql -h $SOCK -p $PORTA -U postgres -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
$P -d $DB -f "$DIR/tests/rls/shim-supabase.sql"
$P -d $DB -f "$DIR/supabase/schema.sql"
for m in 002-fase1 003-site-conectado 004-duplicados 005-buscas-populares 006-seguranca; do
  $P -d $DB -f "$DIR/supabase/migration-$m.sql"
done
# Privilégios padrão do Supabase para as tabelas do schema public (RLS continua valendo).
$P -d $DB -c "grant usage on schema public to anon, authenticated, service_role" \
  -c "grant all on all tables in schema public to anon, authenticated, service_role" \
  -c "grant all on all functions in schema public to anon, authenticated, service_role" \
  -c "grant all on all sequences in schema public to anon, authenticated, service_role"
echo "banco $DB carregado (shim + schema + migrações 002-006)"
