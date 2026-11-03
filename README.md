# Gatekeeper — Event QR Entry Management

Next.js (App Router) · TypeScript · Tailwind · Supabase · Framer Motion · Lucide · qr-scanner · qrcode · SheetJS · PapaParse · jsPDF

Create an event with a manual QR validity window → add guests (manual or CSV/Excel) → unique QR per guest → print wristbands → scan at the door → first scan = ENTERED, every later scan = ALREADY IN.

## Quick start (local dev mode, no credentials)

```bash
npm install
npm run dev        # http://localhost:3000
```
With no Supabase keys the app runs in **LOCAL DEV MODE** (amber banner): data lives in this browser's localStorage. It exists to exercise the UI. It has **no server-side duplicate protection** — never use it for a real event.

## Going live with Supabase (≈10 minutes)

1. Create a project at supabase.com.
2. **SQL Editor** → paste all of `supabase/migrations/0001_init.sql` → Run.
3. **Authentication → Providers → Email**: keep enabled. For a quick start, turn off "Confirm email" (or confirm via the email link).
4. Copy `.env.example` to `.env.local` and fill in **Project URL** and **anon public key** (Settings → API). Never use the `service_role` key anywhere in this app.
5. `npm run dev`, open `/login`, create the organizer account, create your event.

### Deploy to Vercel
Import the repo, add the same two env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`), deploy. Vercel serves HTTPS, which the phone camera requires.

## How one-time entry is enforced (server-side)

`public.check_in(event_id, token)` (Postgres, `SECURITY DEFINER`) is the only way a check-in can be written; browsers have read-only access to `checkins` via RLS.
Order of decisions: unknown token → INVALID · already entered → ALREADY_IN (checked *before* validity, so entry is permanent) · revoked → REVOKED · before window → NOT_YET_OPEN · after window → EXPIRED · else `INSERT … ON CONFLICT (ticket_id) DO NOTHING`. `checkins.ticket_id` is `UNIQUE`, so two gates scanning at the same instant cannot both succeed; the loser gets ALREADY_IN with the winner's timestamp. The validity window can be edited only before it opens (trigger), and check-ins live in their own table so edits never reset them.

QR content = the random 128-bit token only (upper-cased hex, QR alphanumeric mode). No names, ids or URLs.

## Scanners

* **Camera**: Start → rear camera by default, camera picker, torch (where the device exposes it), full-screen mode, sound + vibration toggles. Needs HTTPS or `localhost`. iOS Safari/Chrome both work via `getUserMedia`; vibration is not supported on iPhone (sound is).
* **USB / Bluetooth (keyboard-wedge)**: set the scanner to HID keyboard mode, suffix Enter or Tab (or none). Open the Scanner page; no field needs focus. Detection is by typing speed, so normal typing/Tab navigation is never intercepted. A manual code box is provided as a fallback.
* Staff can use separate devices at multiple gates on the same organizer login; the guest list refreshes every 6 s.

## Commands

| | |
|---|---|
| `npm run typecheck` | TypeScript |
| `npm test` | 52 unit tests (vitest) |
| `npm run test:sql` | 41 SQL tests against a throwaway local PostgreSQL (needs `psql`, `pgbench`, a `postgres` OS user; see `tests/sql-reset.sh`) |
| `npm run build` | production build |

## Checklist

**Built and verified by automated tests**
- [x] Event create/edit; validity from/until with date+time pickers, timezone, past-midnight windows, end>start validation, locked after entry opens, check-ins preserved
- [x] Manual guest add/edit/delete; CSV/XLSX/XLS import (worker thread), auto column mapping, preview, duplicate + invalid detection, import summary
- [x] Unique 128-bit tokens, QR generation, individual PNG, bulk ZIP, wristband strip + ticket card PDFs (A4), print preview; printed QRs decode from the rasterized PDF at 150 DPI
- [x] Atomic check-in in PostgreSQL: SUCCESS / ALREADY_IN / INVALID / EXPIRED / NOT_YET_OPEN / REVOKED; 5 rounds × 40 truly parallel connections → exactly one SUCCESS each; RLS isolation between users; anon cannot call RPCs; regenerate/revoke
- [x] Keyboard-wedge detector (Enter/Tab/no-suffix, slow Bluetooth, human typing untouched)
- [x] Typecheck clean, production build passes

**Built, but NOT verified on real devices/services** (needs you)
- [ ] Camera scanning on Android, iPhone, tablet, laptop webcam (code uses `qr-scanner`; never run on a real camera here)
- [ ] USB and Bluetooth scanners (logic tested with simulated keystroke timing only)
- [ ] Torch, vibration, sound, full-screen on real phones
- [ ] Visual QA of the UI at 360/390/430/768/1024/1440 px — layouts are built responsive (bottom nav + cards on mobile, sidebar + tables on desktop) but I did not open them in a browser
- [ ] Running against a hosted Supabase project (SQL verified on local PostgreSQL 16 with a small auth shim; supabase-js calls, email sign-up, RPC grants not exercised against Supabase itself)
- [ ] Vercel deployment (build passes; not deployed)
- [ ] Non-Latin guest names in PDFs (rendered via canvas in the browser; Latin path is tested)
- [ ] Physical print test on your printer/wristband stock — do one before printing the batch

**Known limits / decisions**
- One organizer login per account; all gates share it (no separate staff accounts yet)
- Guest list sync is polling (6 s), not Supabase Realtime
- `xlsx@0.18.5` (npm) has published advisories (prototype pollution / ReDoS on crafted files); it only parses files the organizer chooses, in a worker. Consider SheetJS's CDN build for hardened use.
- Local dev mode is single-browser and not race-safe across tabs
