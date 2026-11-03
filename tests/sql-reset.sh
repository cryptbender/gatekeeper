#!/usr/bin/env bash
# Recreates the throwaway test database: shim + 0001 + 0002 + seed, then a second "organizer" admin and a non-admin.
set -e
cd "$(dirname "$0")/.."
su postgres -c "psql -q -c 'drop database if exists eqr_test with (force)' -c 'create database eqr_test'" 2>/dev/null
for f in tests/sql-shim.sql supabase/migrations/0001_init.sql supabase/migrations/0002_admin_services.sql; do
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d eqr_test -f $PWD/$f"
done
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d eqr_test" <<'SQL'
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','org@x.com'),('22222222-2222-2222-2222-222222222222','other@x.com');
insert into public.app_admins(user_id) values ('11111111-1111-1111-1111-111111111111');  -- org = admin, other = plain signed-in user
SQL
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d eqr_test -f $PWD/supabase/seed_admin.sql"
echo "DB reset OK"
