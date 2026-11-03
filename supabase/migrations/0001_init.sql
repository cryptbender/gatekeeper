-- Event QR Entry — schema, RLS and atomic check-in.
-- Run in Supabase: SQL Editor -> paste -> Run. Safe to run once on a fresh project.

create extension if not exists pgcrypto;

-- ───────────────────────── tables ─────────────────────────
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  description text,
  venue       text,
  event_date  date not null,
  valid_from  timestamptz not null,
  valid_until timestamptz not null,
  timezone    text not null default 'UTC',
  created_at  timestamptz not null default now(),
  constraint events_valid_range check (valid_until > valid_from)
);
create index events_owner_idx on public.events(owner_id);

create table public.guests (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  full_name  text not null check (length(trim(full_name)) > 0),
  phone      text,
  email      text,
  category   text,
  created_at timestamptz not null default now(),
  unique (id, event_id)
);
create index guests_event_idx on public.guests(event_id);
create index guests_event_email_idx on public.guests(event_id, lower(email));
create index guests_event_phone_idx on public.guests(event_id, phone);

create table public.tickets (
  id         uuid primary key default gen_random_uuid(),
  guest_id   uuid not null unique,
  event_id   uuid not null,
  -- 128-bit random token, lowercase hex. The ONLY thing a QR code contains.
  qr_token   text not null unique default encode(gen_random_bytes(16), 'hex'),
  status     text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  unique (id, event_id),
  foreign key (guest_id, event_id) references public.guests(id, event_id) on delete cascade
);
create index tickets_event_idx on public.tickets(event_id);

create table public.checkins (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null unique,          -- UNIQUE = at most one successful entry per ticket
  guest_id      uuid not null references public.guests(id) on delete cascade,
  event_id      uuid not null references public.events(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  foreign key (ticket_id, event_id) references public.tickets(id, event_id) on delete cascade
);
create index checkins_event_idx on public.checkins(event_id);

-- ───────────────── validity edits are blocked once entry opens ─────────────────
-- Check-ins live in their own table, so editing validity can never reset them.
create or replace function public.guard_validity_edit() returns trigger
language plpgsql as $$
begin
  if (new.valid_from <> old.valid_from or new.valid_until <> old.valid_until)
     and now() >= old.valid_from then
    raise exception 'Validity cannot be changed after entry has opened';
  end if;
  return new;
end $$;
create trigger events_guard_validity before update on public.events
  for each row execute function public.guard_validity_edit();

-- ───────────────────────── row level security ─────────────────────────
alter table public.events   enable row level security;
alter table public.guests   enable row level security;
alter table public.tickets  enable row level security;
alter table public.checkins enable row level security;

create policy events_owner on public.events
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy guests_owner on public.guests
  for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

-- Tickets: owners may read and revoke/restore. Creation and token changes go through RPCs.
create policy tickets_select on public.tickets
  for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy tickets_update on public.tickets
  for update to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

-- Check-ins: read-only from the browser. Only public.check_in() can write.
create policy checkins_select on public.checkins
  for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

-- ───────────────────────── RPCs ─────────────────────────

-- Create many guests + one ticket each, in a single transaction.
create or replace function public.add_guests(p_event_id uuid, p_guests jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not exists (select 1 from events where id = p_event_id and owner_id = auth.uid()) then
    raise exception 'Event not found';
  end if;
  if jsonb_typeof(p_guests) <> 'array' or jsonb_array_length(p_guests) > 2000 then
    raise exception 'p_guests must be an array of at most 2000 items';
  end if;

  with ins as (
    insert into guests (event_id, full_name, phone, email, category)
    select p_event_id,
           trim(g->>'full_name'),
           nullif(trim(g->>'phone'), ''),
           nullif(trim(g->>'email'), ''),
           nullif(trim(g->>'category'), '')
      from jsonb_array_elements(p_guests) g
     where length(trim(coalesce(g->>'full_name', ''))) > 0
    returning id
  )
  insert into tickets (guest_id, event_id) select id, p_event_id from ins;
  get diagnostics n = row_count;
  return n;
end $$;

-- Issue a fresh token for a guest who has not entered yet (old QR stops working).
create or replace function public.regenerate_ticket(p_ticket_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare new_token text;
begin
  if not exists (
    select 1 from tickets tk join events e on e.id = tk.event_id
     where tk.id = p_ticket_id and e.owner_id = auth.uid()
  ) then
    raise exception 'Ticket not found';
  end if;
  if exists (select 1 from checkins where ticket_id = p_ticket_id) then
    raise exception 'Guest has already entered; the ticket cannot be regenerated';
  end if;
  new_token := encode(gen_random_bytes(16), 'hex');
  update tickets set qr_token = new_token, status = 'active' where id = p_ticket_id;
  return new_token;
end $$;

-- Atomic check-in. Returns one of:
-- SUCCESS | ALREADY_IN | INVALID | REVOKED | EXPIRED | NOT_YET_OPEN
-- Concurrency: INSERT .. ON CONFLICT (ticket_id) DO NOTHING on a UNIQUE column means
-- that when two gates scan the same ticket at once, exactly one insert wins.
create or replace function public.check_in(p_event_id uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev record;
  t  record;
  v_time timestamptz;
  -- strip ALL whitespace (scanners append \r\n / \t); real tokens never contain any
  v_token text := lower(regexp_replace(coalesce(p_token, ''), '\s', '', 'g'));
begin
  select * into ev from events where id = p_event_id and owner_id = auth.uid();
  if not found then
    return jsonb_build_object('result', 'INVALID');
  end if;

  select tk.id, tk.guest_id, tk.status, g.full_name, g.category
    into t
    from tickets tk join guests g on g.id = tk.guest_id
   where tk.qr_token = v_token and tk.event_id = p_event_id;
  if not found then
    return jsonb_build_object('result', 'INVALID');
  end if;

  -- ENTERED is permanent: checked before validity so expiry never "un-enters" a guest.
  select checked_in_at into v_time from checkins where ticket_id = t.id;
  if found then
    return jsonb_build_object('result', 'ALREADY_IN', 'guest_name', t.full_name,
                              'category', t.category, 'entered_at', v_time);
  end if;

  if t.status = 'revoked' then
    return jsonb_build_object('result', 'REVOKED', 'guest_name', t.full_name, 'category', t.category);
  end if;
  if now() < ev.valid_from then
    return jsonb_build_object('result', 'NOT_YET_OPEN');
  end if;
  if now() > ev.valid_until then
    return jsonb_build_object('result', 'EXPIRED');
  end if;

  insert into checkins (ticket_id, guest_id, event_id)
  values (t.id, t.guest_id, p_event_id)
  on conflict (ticket_id) do nothing
  returning checked_in_at into v_time;

  if v_time is null then  -- lost the race to another gate
    select checked_in_at into v_time from checkins where ticket_id = t.id;
    return jsonb_build_object('result', 'ALREADY_IN', 'guest_name', t.full_name,
                              'category', t.category, 'entered_at', v_time);
  end if;

  return jsonb_build_object('result', 'SUCCESS', 'guest_name', t.full_name,
                            'category', t.category, 'entered_at', v_time);
end $$;

revoke all on function public.add_guests(uuid, jsonb)   from public, anon;
revoke all on function public.regenerate_ticket(uuid)   from public, anon;
revoke all on function public.check_in(uuid, text)      from public, anon;
grant execute on function public.add_guests(uuid, jsonb)  to authenticated;
grant execute on function public.regenerate_ticket(uuid)  to authenticated;
grant execute on function public.check_in(uuid, text)     to authenticated;
