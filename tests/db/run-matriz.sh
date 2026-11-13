#!/usr/bin/env bash
# Recria um banco PostgreSQL local com o schema e as migrações do repositório, carrega dados fictícios
# e mede o que cada perfil consegue ler (RLS e grants). Não toca em produção.
# Uso: PGHOST=/caminho/do/socket PGPORT=5544 PGUSER=postgres bash tests/db/run-matriz.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PSQL="psql -h ${PGHOST:-/tmp} -p ${PGPORT:-5432} -U ${PGUSER:-postgres} -v ON_ERROR_STOP=1 -q"
DB=fornecedores_matriz
$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
for f in tests/db/00-supabase-stubs.sql supabase/schema.sql supabase/migration-002-fase1.sql \
         supabase/migration-003-site-conectado.sql supabase/migration-004-duplicados.sql \
         supabase/migration-005-buscas-populares.sql supabase/migration-006-seguranca.sql \
         ${MIGRACAO_007:-} ${MIGRACAO_008:-} tests/db/01-seed.sql tests/db/02-matriz.sql; do
  [ -n "$f" ] && $PSQL -d $DB -f "$f" >/dev/null
done

persona() { # nome, papel (anon|authenticated), uid
  echo "== $1"
  $PSQL -d $DB -At -c "set role $2" -c "select set_config('request.jwt.claim.sub', '$3', false)" -c "select metrica || '=' || valor from public.__matriz() order by metrica" -c "reset role" | grep -v '^SET$\|^set_config\|^RESET$' | grep '=' | sed 's/^/   /'
}
persona "visitante (sem login)"                 anon          ""
persona "sem assinatura"                        authenticated 00000000-0000-0000-0000-000000000001
persona "assinatura vencida"                    authenticated 00000000-0000-0000-0000-000000000002
persona "assinatura pendente"                   authenticated 00000000-0000-0000-0000-000000000003
persona "assinante ativo"                       authenticated 00000000-0000-0000-0000-000000000004
persona "dono de fornecedor"                    authenticated 00000000-0000-0000-0000-000000000005
persona "administrador"                         authenticated 00000000-0000-0000-0000-000000000006
