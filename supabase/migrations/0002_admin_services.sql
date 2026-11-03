-- 0002: admin-only access, meal services (lunch / dinner) on the same QR, realtime.
-- Run AFTER 0001_init.sql. Safe on a database that already has data.

-- ───────── admins ─────────
create table public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
create policy admins_self_read on public.app_admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ───────── only admins can touch any data (a stray sign-up gets nothing) ─────────
drop policy if exists events_owner   on public.events;
drop policy if exists guests_owner   on public.guests;
drop policy if exists tickets_select on public.tickets;
drop policy if exists tickets_update on public.tickets;
drop policy if exists checkins_select on public.checkins;

create policy events_admin on public.events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy guests_admin on public.guests for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy tickets_admin_select on public.tickets for select to authenticated using (public.is_admin());
create policy tickets_admin_update on public.tickets for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy checkins_admin_select on public.checkins for select to authenticated using (public.is_admin());

-- ───────── services on the check-in table ─────────
alter table public.checkins add column if not exists service text not null default 'entry'
  check (service in ('entry', 'lunch', 'dinner'));
alter table public.checkins drop constraint if exists checkins_ticket_id_key;
alter table public.checkins add constraint checkins_ticket_service_key unique (ticket_id, service);
-- one row per (ticket, service): a guest can enter once, take lunch once, take dinner once.

-- ───────── atomic scan ─────────
drop function if exists public.check_in(uuid, text);
create or replace function public.check_in(p_event_id uuid, p_token text, p_service text default 'entry')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev record;
  t  record;
  v_time timestamptz;
  v_token text := lower(regexp_replace(coalesce(p_token, ''), '\s', '', 'g'));
begin
  if not public.is_admin() then
    return jsonb_build_object('result', 'FORBIDDEN');
  end if;
  if p_service not in ('entry', 'lunch', 'dinner') then
    raise exception 'Unknown service %', p_service;
  end if;

  select * into ev from events where id = p_event_id;
  if not found then return jsonb_build_object('result', 'INVALID', 'service', p_service); end if;

  select tk.id, tk.guest_id, tk.status, g.full_name, g.category
    into t
    from tickets tk join guests g on g.id = tk.guest_id
   where tk.qr_token = v_token and tk.event_id = p_event_id;
  if not found then return jsonb_build_object('result', 'INVALID', 'service', p_service); end if;

  -- Already done wins over everything else (permanent, even after the entry window closes).
  select checked_in_at into v_time from checkins where ticket_id = t.id and service = p_service;
  if found then
    return jsonb_build_object('result', 'ALREADY_IN', 'service', p_service, 'guest_name', t.full_name,
                              'category', t.category, 'entered_at', v_time);
  end if;

  if t.status = 'revoked' then
    return jsonb_build_object('result', 'REVOKED', 'service', p_service, 'guest_name', t.full_name, 'category', t.category);
  end if;

  if p_service = 'entry' then
    if now() < ev.valid_from then return jsonb_build_object('result', 'NOT_YET_OPEN', 'service', p_service); end if;
    if now() > ev.valid_until then return jsonb_build_object('result', 'EXPIRED', 'service', p_service); end if;
  else
    -- lunch / dinner only for guests who are already inside
    if not exists (select 1 from checkins where ticket_id = t.id and service = 'entry') then
      return jsonb_build_object('result', 'NOT_ENTERED', 'service', p_service, 'guest_name', t.full_name, 'category', t.category);
    end if;
  end if;

  insert into checkins (ticket_id, guest_id, event_id, service)
  values (t.id, t.guest_id, p_event_id, p_service)
  on conflict (ticket_id, service) do nothing
  returning checked_in_at into v_time;

  if v_time is null then  -- lost the race to another gate / food counter
    select checked_in_at into v_time from checkins where ticket_id = t.id and service = p_service;
    return jsonb_build_object('result', 'ALREADY_IN', 'service', p_service, 'guest_name', t.full_name,
                              'category', t.category, 'entered_at', v_time);
  end if;

  return jsonb_build_object('result', 'SUCCESS', 'service', p_service, 'guest_name', t.full_name,
                            'category', t.category, 'entered_at', v_time);
end $$;

-- Admin correction for a mistaken scan.
create or replace function public.undo_checkin(p_ticket_id uuid, p_service text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if p_service = 'entry' and exists (select 1 from checkins where ticket_id = p_ticket_id and service <> 'entry') then
    raise exception 'Undo lunch and dinner first';
  end if;
  delete from checkins where ticket_id = p_ticket_id and service = p_service;
end $$;

-- ───────── admin-aware versions of the other RPCs ─────────
create or replace function public.add_guests(p_event_id uuid, p_guests jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() or not exists (select 1 from events where id = p_event_id) then
    raise exception 'Event not found';
  end if;
  if jsonb_typeof(p_guests) <> 'array' or jsonb_array_length(p_guests) > 2000 then
    raise exception 'p_guests must be an array of at most 2000 items';
  end if;
  with ins as (
    insert into guests (event_id, full_name, phone, email, category)
    select p_event_id, trim(g->>'full_name'), nullif(trim(g->>'phone'), ''), nullif(trim(g->>'email'), ''), nullif(trim(g->>'category'), '')
      from jsonb_array_elements(p_guests) g
     where length(trim(coalesce(g->>'full_name', ''))) > 0
    returning id
  )
  insert into tickets (guest_id, event_id) select id, p_event_id from ins;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.regenerate_ticket(p_ticket_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare new_token text;
begin
  if not public.is_admin() or not exists (select 1 from tickets where id = p_ticket_id) then
    raise exception 'Ticket not found';
  end if;
  if exists (select 1 from checkins where ticket_id = p_ticket_id) then
    raise exception 'Guest has already entered; the ticket cannot be regenerated';
  end if;
  new_token := encode(gen_random_bytes(16), 'hex');
  update tickets set qr_token = new_token, status = 'active' where id = p_ticket_id;
  return new_token;
end $$;

revoke all on function public.check_in(uuid, text, text), public.undo_checkin(uuid, text),
  public.add_guests(uuid, jsonb), public.regenerate_ticket(uuid) from public, anon;
grant execute on function public.check_in(uuid, text, text), public.undo_checkin(uuid, text),
  public.add_guests(uuid, jsonb), public.regenerate_ticket(uuid) to authenticated;

-- ───────── realtime (dashboard + guest list update instantly) ─────────
do $$ begin
  begin alter publication supabase_realtime add table public.checkins; exception when others then null; end;
  begin alter publication supabase_realtime add table public.guests;   exception when others then null; end;
  begin alter publication supabase_realtime add table public.tickets;  exception when others then null; end;
end $$;

-- If the demo user already exists (created in the Supabase dashboard), make it an admin now.
insert into public.app_admins (user_id)
select id from auth.users where email = 'demo@gatekeeper.com'
on conflict do nothing;
