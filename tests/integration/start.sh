#!/usr/bin/env bash
# Starts PostgREST (as the postgres OS user) + the /rest/v1 gateway against the throwaway eqr_test database.
cd "$(dirname "$0")/../.."
pkill -f "postgrest tests" 2>/dev/null; pkill -f gateway.mjs 2>/dev/null; sleep 1
cp tests/integration/pgrst.conf /tmp/pgrst/pgrst.conf; chmod 644 /tmp/pgrst/pgrst.conf
(su postgres -c "nohup /tmp/pgrst/postgrest /tmp/pgrst/pgrst.conf >/tmp/pgrst/log.txt 2>&1 &")
(nohup node tests/integration/gateway.mjs >/tmp/pgrst/gw.txt 2>&1 &)
for i in $(seq 1 20); do curl -s -o /dev/null http://127.0.0.1:54321/ && break; sleep 0.5; done
curl -s -o /dev/null -w "gateway -> postgrest HTTP %{http_code}\n" http://127.0.0.1:54321/
