"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, MapPin, ScanLine } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { useApp } from "@/components/app-provider";
import { Avatar, StatsRow } from "@/components/guests/shared";
import { eventPhase, fmtDate, fmtDateTime, fmtTime, tzLabel } from "@/lib/time";

export default function DashboardPage() {
  const { event, guests, guestsLoading } = useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const recent = useMemo(() => guests.filter((g) => g.checked_in_at).sort((a, b) => b.checked_in_at!.localeCompare(a.checked_in_at!)).slice(0, 8), [guests]);
  const cats = useMemo(() => {
    const m = new Map<string, { total: number; entered: number }>();
    guests.forEach((g) => {
      const k = g.category ?? "General";
      const v = m.get(k) ?? { total: 0, entered: 0 };
      v.total++; if (g.checked_in_at) v.entered++;
      m.set(k, v);
    });
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  }, [guests]);

  if (!event) return null;
  const tz = event.timezone;
  const phase = eventPhase(event.valid_from, event.valid_until, now);
  const msg = phase === "open" ? "QR codes are accepted right now." : phase === "before" ? "Entry has not opened yet — scans are rejected until the start time." : "Entry window has closed — only guests already inside are recognised.";

  return (
    <>
      <PageHeader title={event.name} description={`${fmtDate(event.event_date)}${event.venue ? ` · ${event.venue}` : ""}`}
        actions={<Link href="/scanner"><Button variant="primary"><ScanLine className="h-4 w-4" />Open scanner</Button></Link>} />

      <StatsRow guests={guests} loading={guestsLoading && guests.length === 0} />

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-muted" />QR validity</h2>
            {phase === "open" ? <Badge tone="ok">Open</Badge> : phase === "before" ? <Badge tone="warn">Upcoming</Badge> : <Badge>Closed</Badge>}
          </div>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs text-muted">Valid from</dt><dd className="font-medium">{fmtDateTime(event.valid_from, tz)}</dd></div>
            <div><dt className="text-xs text-muted">Valid until</dt><dd className="font-medium">{fmtDateTime(event.valid_until, tz)}</dd></div>
            <div><dt className="text-xs text-muted">Timezone</dt><dd className="font-medium">{tz.replace(/_/g, " ")} ({tzLabel(tz)})</dd></div>
          </dl>
          <p className="mt-4 rounded-xl bg-subtle px-3 py-2 text-[13px] text-muted">{msg}</p>
          {event.venue && <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted"><MapPin className="h-3.5 w-3.5" />{event.venue}</p>}
        </Card>

        <Card className="p-5 lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold">By category</h2>
          {cats.length === 0 ? <p className="text-sm text-muted">No guests yet.</p> : (
            <ul className="space-y-4">
              {cats.map(([name, v]) => (
                <li key={name}>
                  <div className="mb-1.5 flex items-center justify-between text-sm"><span className="font-medium">{name}</span><span className="tabular-nums text-muted">{v.entered} / {v.total}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(v.entered / v.total) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 lg:col-span-1">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">Recent entries</h2><Link href="/guests" className="flex items-center gap-1 text-[13px] text-muted hover:text-ink">All guests <ArrowRight className="h-3.5 w-3.5" /></Link></div>
          {recent.length === 0 ? (
            <EmptyState icon={<ScanLine className="h-5 w-5" />} title="No entries yet" body="Approved scans appear here instantly." />
          ) : (
            <ul className="space-y-3">
              {recent.map((g) => (
                <li key={g.id} className="flex items-center gap-3">
                  <Avatar name={g.full_name} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{g.full_name}</p><p className="truncate text-xs text-muted">{g.category ?? "General"}</p></div>
                  <span className="text-xs tabular-nums text-muted">{fmtTime(g.checked_in_at!, tz)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
