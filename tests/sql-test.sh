#!/usr/bin/env bash
# Runs against a throwaway local Postgres (see README "Testing the database"). Needs: psql, pgbench.
set -u
DB=${DB:-eqr_test}
ORG=11111111-1111-1111-1111-111111111111
OTHER=22222222-2222-2222-2222-222222222222
PASS=0; FAIL=0
psqlr() { su postgres -c "psql -X -At -d $DB -v ON_ERROR_STOP=0" 2>&1; }
as() { local u=$1; shift; printf "set role authenticated; set request.jwt.claim.sub='%s'; %s" "$u" "$*" | psqlr | grep -v '^SET$'; }
sup() { printf "%s" "$*" | psqlr; }
check() { # name expected actual
  if [[ "$3" == *"$2"* ]]; then echo "  PASS  $1"; PASS=$((PASS+1)); else echo "  FAIL  $1  (expected '$2', got '$3')"; FAIL=$((FAIL+1)); fi
}
tok() { sup "select qr_token from tickets tk join guests g on g.id=tk.guest_id where g.full_name='$1' and tk.event_id='$2'"; }

NOW="now()"
EV=$(as $ORG "insert into events(name,event_date,valid_from,valid_until,timezone) values ('Gala',current_date,now()-interval '1 hour',now()+interval '1 hour','UTC') returning id;" | head -1)
check "organizer creates event (owner_id defaults to auth.uid())" "-" "$EV"
N=$(as $ORG "select add_guests('$EV','[{\"full_name\":\"Rahul Kumar\",\"category\":\"VIP\"},{\"full_name\":\"Aman Khan\"},{\"full_name\":\"  \"}]');")
check "add_guests creates guests+tickets, skips blank names" "2" "$N"
T1=$(tok "Rahul Kumar" "$EV"); T2=$(tok "Aman Khan" "$EV")
check "token is 32 hex chars" "32" "${#T1}"

R=$(as $ORG "select check_in('$EV','$T1')->>'result';");               check "A first scan -> SUCCESS" "SUCCESS" "$R"
R=$(as $ORG "select check_in('$EV','$T1')->>'result';");               check "B second scan -> ALREADY_IN" "ALREADY_IN" "$R"
R=$(as $ORG "select check_in('$EV','$(echo $T1 | tr a-f A-F)')->>'result';"); check "upper-case payload still resolves (ALREADY_IN)" "ALREADY_IN" "$R"
R=$(as $ORG "select check_in('$EV','not-a-real-token')->>'result';");  check "C unknown token -> INVALID" "INVALID" "$R"
R=$(as $ORG "select check_in('$EV','$(echo $T2 | tr a-f A-F)
')->>'result';");                                                      check "upper-case + trailing newline -> SUCCESS" "SUCCESS" "$R"
S1=$(as $ORG "select checked_in_at from checkins where ticket_id=(select id from tickets where qr_token='$T1');")
S2=$(as $ORG "select check_in('$EV','$T1')->>'entered_at';")
check "ALREADY_IN reports the ORIGINAL timestamp" "$(echo $S1 | cut -c1-16)" "$(echo $S2 | cut -c1-16 | tr T ' ')"

echo "-- RLS isolation"
R=$(as $OTHER "select count(*) from events;");                          check "non-admin sees 0 events" "0" "$R"
R=$(as $OTHER "select count(*) from guests;");                          check "non-admin sees 0 guests" "0" "$R"
R=$(as $OTHER "select count(*) from checkins;");                        check "non-admin sees 0 check-ins" "0" "$R"
R=$(as $OTHER "select check_in('$EV','$T1')->>'result';");              check "non-admin user cannot check in (FORBIDDEN)" "FORBIDDEN" "$R"
R=$(as $OTHER "select add_guests('$EV','[{\"full_name\":\"Intruder\"}]');"); check "non-admin cannot add_guests" "Event not found" "$R"
R=$(as $ORG "insert into checkins(ticket_id,guest_id,event_id) select id,guest_id,event_id from tickets limit 1;"); check "browser cannot insert check-ins directly" "row-level security" "$R"
R=$(as $ORG "delete from checkins;");                                   check "browser cannot delete check-ins" "DELETE 0" "$R"
R=$(as $OTHER "select check_in('$EV','$T1')->>'result';");
R=$(as postgres "select 1;" 2>&1 | head -1)
R=$(printf "set role anon; select check_in('$EV','$T1');" | psqlr); check "anon role cannot call check_in" "permission denied" "$R"

echo "-- validity rules"
FUT=$(as $ORG "insert into events(name,event_date,valid_from,valid_until,timezone) values ('Future',current_date,now()+interval '1 hour',now()+interval '3 hours','UTC') returning id;" | head -1)
as $ORG "select add_guests('$FUT','[{\"full_name\":\"Early Bird\"}]');" >/dev/null
TF=$(tok "Early Bird" "$FUT")
R=$(as $ORG "select check_in('$FUT','$TF')->>'result';");               check "E before validity -> NOT_YET_OPEN" "NOT_YET_OPEN" "$R"
R=$(as $ORG "update events set valid_until=valid_until+interval '1 hour' where id='$FUT';"); check "validity editable before event opens" "UPDATE 1" "$R"
R=$(as $ORG "update events set valid_until=valid_until+interval '1 hour' where id='$EV';");  check "validity locked once entry has opened" "cannot be changed" "$R"
R=$(as $ORG "update events set valid_until=valid_from where id='$FUT';"); check "end must be after start (constraint)" "events_valid_range" "$R"
R=$(as $ORG "update events set name='Gala (renamed)' where id='$EV';");  check "non-validity edit allowed after open" "UPDATE 1" "$R"
R=$(as $ORG "select count(*) from checkins where event_id='$EV';");     check "check-ins untouched by event edits" "2" "$R"

PAST=$(as $ORG "insert into events(name,event_date,valid_from,valid_until,timezone) values ('Past',current_date,now()-interval '3 hour',now()-interval '1 hour','UTC') returning id;" | head -1)
as $ORG "select add_guests('$PAST','[{\"full_name\":\"Latecomer\"}]');" >/dev/null
TP=$(tok "Latecomer" "$PAST")
R=$(as $ORG "select check_in('$PAST','$TP')->>'result';");              check "D after validity -> EXPIRED" "EXPIRED" "$R"
R=$(as $ORG "select count(*) from checkins where event_id='$PAST';");   check "EXPIRED/NOT_YET_OPEN create no check-in" "0" "$R"

echo "-- ENTERED is permanent after expiry"
sup "alter table events disable trigger events_guard_validity; update events set valid_until = now() - interval '1 minute' where id='$EV'; alter table events enable trigger events_guard_validity;" >/dev/null
R=$(as $ORG "select check_in('$EV','$T1')->>'result';");                check "already-entered guest after expiry -> ALREADY_IN (not EXPIRED)" "ALREADY_IN" "$R"
as $ORG "select add_guests('$EV','[{\"full_name\":\"Never Came\"}]');" >/dev/null
TN=$(tok "Never Came" "$EV")
R=$(as $ORG "select check_in('$EV','$TN')->>'result';");                check "guest who never entered, after expiry -> EXPIRED" "EXPIRED" "$R"
sup "alter table events disable trigger events_guard_validity; update events set valid_until = now() + interval '1 hour' where id='$EV'; alter table events enable trigger events_guard_validity;" >/dev/null

echo "-- revoke / regenerate"
R=$(as $ORG "update tickets set status='revoked' where qr_token='$TN';"); check "organizer can revoke a ticket" "UPDATE 1" "$R"
R=$(as $ORG "select check_in('$EV','$TN')->>'result';");                check "revoked ticket -> REVOKED" "REVOKED" "$R"
NEW=$(as $ORG "select regenerate_ticket((select id from tickets where qr_token='$TN'));")
R=$(as $ORG "select check_in('$EV','$TN')->>'result';");                check "old QR dead after regenerate -> INVALID" "INVALID" "$R"
R=$(as $ORG "select check_in('$EV','$NEW')->>'result';");               check "new QR works -> SUCCESS" "SUCCESS" "$R"
R=$(as $ORG "select regenerate_ticket((select id from tickets where qr_token='$NEW'));"); check "cannot regenerate after entry" "already entered" "$R"
R=$(as $OTHER "select regenerate_ticket((select id from tickets where qr_token='$NEW'));"); check "non-admin cannot regenerate a ticket" "Ticket not found" "$R"

echo "-- integrity"
sup "insert into guests(id,event_id,full_name) values ('99999999-9999-9999-9999-999999999999','$EV','No Ticket Yet');" >/dev/null
R=$(sup "insert into tickets(guest_id,event_id) values ('99999999-9999-9999-9999-999999999999','$FUT');"); check "ticket/guest event mismatch rejected (composite FK)" "violates foreign key" "$R"
R=$(sup "insert into checkins(ticket_id,guest_id,event_id) select ticket_id,guest_id,event_id from checkins limit 1;"); check "UNIQUE(ticket_id): second check-in row impossible" "duplicate key" "$R"
as $ORG "delete from guests where full_name='Never Came';" >/dev/null
R=$(sup "select count(*) from tickets where qr_token='$NEW';");         check "deleting a guest cascades to ticket+checkin" "0" "$R"


echo "-- admin account + seed"
R=$(sup "select count(*) from app_admins a join auth.users u on u.id=a.user_id where u.email='demo@gatekeeper.com';"); check "seed made demo@gatekeeper.com an admin" "1" "$R"
R=$(sup "select (encrypted_password = crypt('123456', encrypted_password))::text from auth.users where email='demo@gatekeeper.com';"); check "demo password hash matches 123456" "true" "$R"
R=$(sup "select count(*) from auth.identities i join auth.users u on u.id=i.user_id where u.email='demo@gatekeeper.com' and i.provider='email';"); check "demo has an email identity" "1" "$R"
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $PWD/supabase/seed_admin.sql" >/dev/null 2>&1
R=$(sup "select count(*) from auth.users where email='demo@gatekeeper.com';"); check "seed is idempotent (still one demo user)" "1" "$R"
DEMO=$(sup "select id from auth.users where email='demo@gatekeeper.com';")
R=$(as $DEMO "select is_admin();");                                      check "demo user is_admin() = true" "t" "$R"
R=$(as $OTHER "select is_admin();");                                     check "ordinary signed-in user is_admin() = false" "f" "$R"
R=$(as $DEMO "select count(*) from events;");                            check "any admin sees all events (not just own)" "$(sup 'select count(*) from events;')" "$R"

echo "-- services: entry / lunch / dinner on one QR"
as $ORG "select add_guests('$EV','[{\"full_name\":\"Foodie\"},{\"full_name\":\"Skipper\"}]');" >/dev/null
TFD=$(tok "Foodie" "$EV"); TSK=$(tok "Skipper" "$EV")
R=$(as $ORG "select check_in('$EV','$TFD','lunch')->>'result';");        check "lunch BEFORE entry -> NOT_ENTERED" "NOT_ENTERED" "$R"
R=$(as $ORG "select count(*) from checkins c join tickets t on t.id=c.ticket_id where t.qr_token='$TFD';"); check "rejected lunch recorded nothing" "0" "$R"
R=$(as $ORG "select check_in('$EV','$TFD','entry')->>'result';");        check "entry -> SUCCESS" "SUCCESS" "$R"
R=$(as $ORG "select check_in('$EV','$TFD','lunch')->>'result';");        check "lunch after entry -> SUCCESS" "SUCCESS" "$R"
R=$(as $ORG "select check_in('$EV','$TFD','lunch')->>'result';");        check "second lunch -> ALREADY_IN" "ALREADY_IN" "$R"
R=$(as $ORG "select check_in('$EV','$TFD','lunch')->>'service';");       check "response names the service" "lunch" "$R"
R=$(as $ORG "select check_in('$EV','$TFD','dinner')->>'result';");       check "dinner is independent of lunch -> SUCCESS" "SUCCESS" "$R"
R=$(as $ORG "select check_in('$EV','$TFD','dinner')->>'result';");       check "second dinner -> ALREADY_IN" "ALREADY_IN" "$R"
R=$(as $ORG "select count(*) from checkins c join tickets t on t.id=c.ticket_id where t.qr_token='$TFD';"); check "one QR holds 3 records (entry, lunch, dinner)" "3" "$R"
R=$(as $ORG "select check_in('$EV','$TFD','brunch')->>'result';");       check "unknown service rejected" "Unknown service" "$R"
R=$(as $ORG "select check_in('$EV','$TSK','dinner')->>'result';");       check "dinner for a guest who never entered -> NOT_ENTERED" "NOT_ENTERED" "$R"
as $ORG "select check_in('$EV','$TSK','entry');" >/dev/null
sup "alter table events disable trigger events_guard_validity; update events set valid_until = now() - interval '1 minute' where id='$EV'; alter table events enable trigger events_guard_validity;" >/dev/null
R=$(as $ORG "select check_in('$EV','$TSK','dinner')->>'result';");       check "meals still work after the ENTRY window closes" "SUCCESS" "$R"
sup "alter table events disable trigger events_guard_validity; update events set valid_until = now() + interval '1 hour' where id='$EV'; alter table events enable trigger events_guard_validity;" >/dev/null
R=$(as $OTHER "select check_in('$EV','$TFD','lunch')->>'result';");      check "non-admin cannot redeem lunch" "FORBIDDEN" "$R"
R=$(as $OTHER "select undo_checkin((select id from tickets where qr_token='$TFD'),'lunch');"); check "non-admin cannot undo" "Not allowed" "$R"
R=$(as $ORG "select undo_checkin((select id from tickets where qr_token='$TFD'),'entry');"); check "cannot undo ENTRY while meals exist" "Undo lunch and dinner first" "$R"
as $ORG "select undo_checkin((select id from tickets where qr_token='$TFD'),'lunch');" >/dev/null
R=$(as $ORG "select check_in('$EV','$TFD','lunch')->>'result';");        check "admin undo lunch, then lunch is available again" "SUCCESS" "$R"
as $ORG "update tickets set status='revoked' where qr_token='$TFD';" >/dev/null
R=$(as $ORG "select check_in('$EV','$TSK','lunch')->>'result';");        check "lunch for another guest unaffected by revocation" "SUCCESS" "$R"
as $ORG "update tickets set status='active' where qr_token='$TFD';" >/dev/null

echo "-- CONCURRENCY: 5 rounds x 40 simultaneous scans of ONE ticket (pgbench, real parallel connections)"
sup "create table if not exists race_results(round int, result text); grant all on race_results to authenticated; truncate race_results;" >/dev/null
for round in 1 2 3 4 5; do
  as $ORG "select add_guests('$EV','[{\"full_name\":\"Race $round\"}]');" >/dev/null
  TR=$(tok "Race $round" "$EV")
  cat > /tmp/race.sql <<SQL
set role authenticated;
set request.jwt.claim.sub = '$ORG';
insert into race_results select $round, check_in('$EV','$TR')->>'result';
SQL
  chmod 644 /tmp/race.sql
  su postgres -c "/usr/lib/postgresql/16/bin/pgbench -n -c 40 -j 8 -t 1 -f /tmp/race.sql $DB" >/dev/null 2>&1
  OK=$(sup "select count(*) from race_results where round=$round and result='SUCCESS';")
  DUP=$(sup "select count(*) from race_results where round=$round and result='ALREADY_IN';")
  ROWS=$(sup "select count(*) from checkins c join tickets t on t.id=c.ticket_id where t.qr_token='$TR';")
  check "round $round: exactly 1 SUCCESS, 39 ALREADY_IN, 1 check-in row" "1/39/1" "$OK/$DUP/$ROWS"
done
echo "-- CONCURRENCY on LUNCH: 3 rounds x 40 simultaneous lunch scans"
for round in 11 12 13; do
  as $ORG "select add_guests('$EV','[{\"full_name\":\"LunchRace $round\"}]');" >/dev/null
  TR=$(tok "LunchRace $round" "$EV"); as $ORG "select check_in('$EV','$TR','entry');" >/dev/null
  cat > /tmp/race.sql <<SQL
set role authenticated;
set request.jwt.claim.sub = '$ORG';
insert into race_results select $round, check_in('$EV','$TR','lunch')->>'result';
SQL
  chmod 644 /tmp/race.sql
  su postgres -c "/usr/lib/postgresql/16/bin/pgbench -n -c 40 -j 8 -t 1 -f /tmp/race.sql $DB" >/dev/null 2>&1
  OK=$(sup "select count(*) from race_results where round=$round and result='SUCCESS';")
  DUP=$(sup "select count(*) from race_results where round=$round and result='ALREADY_IN';")
  ROWS=$(sup "select count(*) from checkins c join tickets t on t.id=c.ticket_id where t.qr_token='$TR' and c.service='lunch';")
  check "lunch round $round: exactly 1 SUCCESS, 39 ALREADY_IN, 1 lunch row" "1/39/1" "$OK/$DUP/$ROWS"
done
echo; echo "SQL TESTS: $PASS passed, $FAIL failed"; [ $FAIL -eq 0 ]
