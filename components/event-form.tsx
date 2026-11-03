"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Lock } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "./ui";
import type { EventInput, EventRow } from "@/lib/types";
import { allTimezones, eventPhase, fmtDateTime, tzLabel, utcToZonedParts, zonedToUtcIso } from "@/lib/time";

const pad = (n: number) => String(n).padStart(2, "0");
const addDay = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd + 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

export function EventForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial?: EventRow | null; submitLabel: string; onSubmit: (v: EventInput) => Promise<void>; onCancel?: () => void;
}) {
  const browserTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const tzs = useMemo(() => {
    const l = allTimezones();
    return l.includes(browserTz) ? l : [browserTz, ...l];
  }, [browserTz]);

  const init = useMemo(() => {
    if (initial) {
      const f = utcToZonedParts(initial.valid_from, initial.timezone);
      const u = utcToZonedParts(initial.valid_until, initial.timezone);
      return { tz: initial.timezone, eventDate: initial.event_date, fd: f.date, ft: f.time, ud: u.date, ut: u.time };
    }
    const today = utcToZonedParts(new Date().toISOString(), browserTz).date;
    return { tz: browserTz, eventDate: today, fd: today, ft: "17:00", ud: addDay(today), ut: "02:00" };
  }, [initial, browserTz]);

  const [name, setName] = useState(initial?.name ?? "");
  const [venue, setVenue] = useState(initial?.venue ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [tz, setTz] = useState(init.tz);
  const [eventDate, setEventDate] = useState(init.eventDate);
  const [fd, setFd] = useState(init.fd);
  const [ft, setFt] = useState(init.ft);
  const [ud, setUd] = useState(init.ud);
  const [ut, setUt] = useState(init.ut);
  const [touched, setTouched] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const locked = Boolean(initial && eventPhase(initial.valid_from, initial.valid_until) !== "before");

  const validity = useMemo(() => {
    if (!fd || !ft || !ud || !ut) return null;
    const from = zonedToUtcIso(fd, ft, tz), until = zonedToUtcIso(ud, ut, tz);
    const mins = Math.round((new Date(until).getTime() - new Date(from).getTime()) / 60000);
    return { from, until, mins };
  }, [fd, ft, ud, ut, tz]);

  const rangeError = validity && validity.mins <= 0 ? "Valid until must be later than valid from." : null;
  const dur = validity && validity.mins > 0 ? `${Math.floor(validity.mins / 60)}h${validity.mins % 60 ? ` ${validity.mins % 60}m` : ""}` : "";

  function changeEventDate(v: string) {
    setEventDate(v);
    if (!touched && v) { setFd(v); setUd(addDay(v)); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr("Event name is required.");
    if (!eventDate) return setErr("Event date is required.");
    if (!validity || rangeError) return setErr(rangeError ?? "Set the validity period.");
    setBusy(true);
    try {
      const payload: EventInput = {
        name: name.trim(), venue: venue.trim() || null, description: description.trim() || null,
        event_date: eventDate, timezone: tz, valid_from: validity.from, valid_until: validity.until,
      };
      await onSubmit(payload);
    } catch (ex) { setErr(ex instanceof Error ? ex.message : "Something went wrong"); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Event name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Annual Gala 2026" autoFocus={!initial} maxLength={120} /></Field></div>
        <Field label="Event date"><Input type="date" value={eventDate} onChange={(e) => changeEventDate(e.target.value)} /></Field>
        <Field label="Venue" optional><Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Grand Ballroom, Mumbai" maxLength={160} /></Field>
        <div className="sm:col-span-2"><Field label="Description" optional><Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} /></Field></div>
      </div>

      <div className="rounded-2xl border bg-subtle/50 p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><CalendarClock className="h-[18px] w-[18px]" /></div>
          <div>
            <h3 className="text-sm font-semibold">QR validity period</h3>
            <p className="text-[13px] text-muted">First entry is only accepted inside this window. Guests who already entered stay ENTERED.</p>
          </div>
        </div>

        {locked && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[13px] text-warn">
            <Lock className="h-4 w-4 shrink-0" /> Entry has already opened — validity can no longer be edited.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valid from — date"><Input type="date" disabled={locked} value={fd} onChange={(e) => { setTouched(true); setFd(e.target.value); }} /></Field>
          <Field label="Valid from — time"><Input type="time" disabled={locked} value={ft} onChange={(e) => { setTouched(true); setFt(e.target.value); }} /></Field>
          <Field label="Valid until — date"><Input type="date" disabled={locked} value={ud} onChange={(e) => { setTouched(true); setUd(e.target.value); }} /></Field>
          <Field label="Valid until — time"><Input type="time" disabled={locked} value={ut} onChange={(e) => { setTouched(true); setUt(e.target.value); }} /></Field>
          <div className="sm:col-span-2">
            <Field label="Timezone" hint="Times above are interpreted in this timezone.">
              <Select disabled={locked} value={tz} onChange={(e) => setTz(e.target.value)}>
                {tzs.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
              </Select>
            </Field>
          </div>
        </div>

        <div className="mt-4 rounded-xl border bg-surface px-4 py-3 text-sm">
          {rangeError ? <p className="font-medium text-danger">{rangeError}</p> : validity ? (
            <p>
              <span className="font-medium">{fmtDateTime(validity.from, tz)}</span>
              <span className="mx-2 text-muted">→</span>
              <span className="font-medium">{fmtDateTime(validity.until, tz)}</span>
              <span className="ml-2 text-muted">({tzLabel(tz)} · {dur})</span>
            </p>
          ) : <p className="text-muted">Choose a start and end.</p>}
        </div>
      </div>

      {err && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        <Button type="submit" variant="primary" loading={busy} disabled={Boolean(rangeError)}>{submitLabel}</Button>
      </div>
    </form>
  );
}
