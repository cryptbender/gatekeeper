#!/usr/bin/env bash
# Recreates the throwaway test database from the shim + real migration.
set -e
cd "$(dirname "$0")/.."
su postgres -c "psql -q -c 'drop database if exists eqr_test' -c 'create database eqr_test'" 2>/dev/null
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d eqr_test -f $PWD/tests/sql-shim.sql"
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d eqr_test -f $PWD/supabase/migrations/0001_init.sql"
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d eqr_test" <<'SQL'
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','org@x.com'),('22222222-2222-2222-2222-222222222222','other@x.com');
SQL
echo "DB reset OK"
