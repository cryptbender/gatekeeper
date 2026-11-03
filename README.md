# Gatekeeper — Event QR Entry Management

Next.js (App Router) · TypeScript · Tailwind · Supabase · Framer Motion · Lucide · qr-scanner · qrcode · SheetJS · PapaParse · jsPDF

Create an event with a manual QR validity window → add guests (manual or CSV/Excel) → one unique QR per guest → print wristbands → staff pick **Entry / Lunch / Dinner** and scan → each action works once per guest and shows live on the dashboard.

**Access:** admin-only. Sign-in is `demo@gatekeeper.com` / `123456` (created by `supabase/seed_admin.sql`; change the password once live). There is no public sign-up — the login screen tells visitors to contact the organizer.

## Quick start (local dev mode, no credentials)

```bash
npm install
npm run dev        # http://localhost:3000
```
With no Supabase keys the app runs in **LOCAL DEV MODE** (amber banner): data lives in this browser's localStorage. It exists to exercise the UI. It has **no server-side duplicate protection** — never use it for a real event.

## Going live with Supabase (≈10 minutes)

1. Create a project at supabase.com.
2. **SQL Editor** → run, in this order: `supabase/migrations/0001_init.sql`, then `supabase/migrations/0002_admin_services.sql`, then `supabase/seed_admin.sql` (creates the admin login).
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up". (Even if left on, non-admin accounts can see and do nothing: every table and RPC requires `is_admin()`.)
4. Copy `.env.example` to `.env.local` and fill in **Project URL** (just `https://xxxx.supabase.co` — no `/rest/v1`) and **anon public key** (Settings → API). Never use the `service_role` key anywhere in this app.
5. `npm run dev`, open `/login`, sign in as the admin, create your event.

### Deploy to Vercel
Import the repo, add the same two env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`), deploy. Vercel serves HTTPS, which the phone camera requires.

## How one-time entry is enforced (server-side)

`public.check_in(event_id, token, service)` (Postgres, `SECURITY DEFINER`, admins only) is the only way a check-in can be written; browsers have read-only access to `checkins` via RLS.
`service` is `entry`, `lunch` or `dinner`. Order of decisions: unknown token → INVALID · service already used → ALREADY_IN (checked first, so it is permanent) · revoked → REVOKED · **entry**: before window → NOT_YET_OPEN, after → EXPIRED · **lunch/dinner**: guest not yet entered → NOT_ENTERED (meals ignore the entry window) · else `INSERT … ON CONFLICT (ticket_id, service) DO NOTHING`. `checkins` is `UNIQUE (ticket_id, service)`, so two gates or food counters scanning the same QR for the same service at the same instant cannot both succeed; the loser gets ALREADY_IN with the winner's timestamp. Admins can undo a mistaken record from the guest's QR dialog (entry can't be undone while lunch/dinner exist).

**Real-time:** the app subscribes to Supabase Realtime (`checkins`, `guests`, `tickets`); new scans appear on every open dashboard/guest list immediately, with a slow poll as a safety net. Migration 0002 adds the tables to the `supabase_realtime` publication. The validity window can be edited only before it opens (trigger), and check-ins live in their own table so edits never reset them.

QR content = the random 128-bit token only (upper-cased hex, QR alphanumeric mode). No names, ids or URLs.

## Scanners

* **Camera**: Start → rear camera by default, camera picker, torch (where the device exposes it), full-screen mode, sound + vibration toggles. Needs HTTPS or `localhost`. iOS Safari/Chrome both work via `getUserMedia`; vibration is not supported on iPhone (sound is).
* **USB / Bluetooth (keyboard-wedge)**: set the scanner to HID keyboard mode, suffix Enter or Tab (or none). Open the Scanner page; no field needs focus. Detection is by typing speed, so normal typing/Tab navigation is never intercepted. A manual code box is provided as a fallback.
* Staff can use separate devices at multiple gates on the same organizer login; the guest list refreshes every 6 s.

## Commands

| | |
|---|---|
| `npm run typecheck` | TypeScript |
| `npm test` | 65 unit tests (vitest) |
| `npm run test:sql` | 68 SQL tests against a throwaway local PostgreSQL (needs `psql`, `pgbench`, a `postgres` OS user; see `tests/sql-reset.sh`) |
| `npm run test:int` | 10 integration tests: the real supabase-js store → PostgREST (v12, the API layer Supabase uses) → Postgres with the real migrations + RLS (needs the same setup as `test:sql`, plus the PostgREST binary at `/tmp/pgrst/postgrest`; see `tests/integration/`) |
| `npm run build` | production build |

## Checklist

**Built and verified by automated tests**
- [x] Event create/edit; validity from/until with date+time pickers, timezone, past-midnight windows, end>start validation, locked after entry opens, check-ins preserved
- [x] Manual guest add/edit/delete; CSV/XLSX/XLS import (worker thread), auto column mapping, preview, duplicate + invalid detection, import summary
- [x] Unique 128-bit tokens, QR generation, individual PNG, bulk ZIP, wristband strip + ticket card PDFs (A4), print preview; printed QRs decode from the rasterized PDF at 150 DPI
- [x] Atomic check-in in PostgreSQL: SUCCESS / ALREADY_IN / INVALID / EXPIRED / NOT_YET_OPEN / REVOKED / NOT_ENTERED; entry races (5 × 40 parallel connections) and lunch races (3 × 40) → exactly one SUCCESS each
- [x] Admin-only access: non-admin users see no data and cannot call any RPC; seed creates the demo admin (idempotent); admin undo
- [x] Lunch / Dinner on the same QR: need prior entry, once each, independent, still work after the entry window closes
- [x] Keyboard-wedge detector (Enter/Tab/no-suffix, slow Bluetooth, human typing untouched)
- [x] The real supabase-js data layer verified through PostgREST: embedded selects, RPCs, >1000-row paging, admin/non-admin isolation, error messages, 40-way parallel lunch race over HTTP, mis-pasted Supabase URL sanitised
- [x] Typecheck clean, production build passes, clean-room `npm ci` + build from the zip

**Built, but NOT verified on real devices/services** (needs you)
- [ ] Camera scanning on Android, iPhone, tablet, laptop webcam (code uses `qr-scanner`; never run on a real camera here)
- [ ] USB and Bluetooth scanners (logic tested with simulated keystroke timing only)
- [ ] Torch, vibration, sound, full-screen on real phones
- [ ] Visual QA of the UI at 360/390/430/768/1024/1440 px — layouts are built responsive (bottom nav + cards on mobile, sidebar + tables on desktop) but I did not open them in a browser
- [ ] Running against a hosted Supabase project (SQL verified on local PostgreSQL 16 with a small auth shim). Not exercised against real Supabase: `seed_admin.sql` writing to the real `auth` schema (fallback: create the user in Authentication → Users, then run its last statement), GoTrue sign-in, and **Realtime** push (the 6 s poll covers it if Realtime isn't active)
- [ ] Vercel deployment (build passes; not deployed)
- [ ] Non-Latin guest names in PDFs (rendered via canvas in the browser; Latin path is tested)
- [ ] Physical print test on your printer/wristband stock — do one before printing the batch

**Known limits / decisions**
- Admin-only: all staff share admin logins for now (no limited staff role). Create more admins in Authentication → Users, then `insert into app_admins select id from auth.users where email='…';`
- `xlsx@0.18.5` (npm) has published advisories (prototype pollution / ReDoS on crafted files); it only parses files the organizer chooses, in a worker. Consider SheetJS's CDN build for hardened use.
- Local dev mode is single-browser and not race-safe across tabs
