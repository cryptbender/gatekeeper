"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, MapPin, ScanLine } from "lucide-react";
import { motion } from "framer-motion";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { useApp } from "@/components/app-provider";
import { Avatar, SERVICE_ICON, StatsRow } from "@/components/guests/shared";
import { eventPhase, fmtDate, fmtDateTime, fmtTime, tzLabel } from "@/lib/time";
import { SERVICES, SERVICE_LABEL, serviceTime, type Service } from "@/lib/types";
import { cn } from "@/lib/utils";

const VERB: Record<Service, string> = { entry: "entered", lunch: "had lunch", dinner: "had dinner" };
const TONE: Record<Service, string> = { entry: "bg-ok/10 text-ok", lunch: "bg-warn/10 text-warn", dinner: "bg-accent/10 text-accent" };

export default function DashboardPage() {
  const { event, guests, guestsLoading, live } = useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const activity = useMemo(() => {
    const list: { key: string; name: string; sv: Service; at: string }[] = [];
    for (const g of guests) for (const sv of SERVICES) { const at = serviceTime(g, sv); if (at) list.push({ key: `${g.id}-${sv}`, name: g.full_name, sv, at }); }
    return list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  }, [guests]);

  const cats = useMemo(() => {
    const m = new Map<string, { total: number; entered: number; lunch: number; dinner: number }>();
    guests.forEach((g) => {
      const k = g.category ?? "General";
      const v = m.get(k) ?? { total: 0, entered: 0, lunch: 0, dinner: 0 };
      v.total++; if (g.checked_in_at) v.entered++; if (g.lunch_at) v.lunch++; if (g.dinner_at) v.dinner++;
      m.set(k, v);
    });
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  }, [guests]);

  if (!event) return null;
  const tz = event.timezone;
  const phase = eventPhase(event.valid_from, event.valid_until, now);
  const msg = phase === "open" ? "Entry QR codes are accepted right now." : phase === "before" ? "Entry has not opened yet — entry scans are rejected until the start time." : "Entry window has closed — lunch and dinner still work for guests already inside.";

  return (
    <>
      <PageHeader title={event.name} description={`${fmtDate(event.event_date)}${event.venue ? ` · ${event.venue}` : ""}`}
        actions={<>
          <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium", live ? "text-ok" : "text-muted")}>
            <span className="relative flex h-2 w-2"><span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60", live && "animate-ping bg-ok")} /><span className={cn("relative inline-flex h-2 w-2 rounded-full", live ? "bg-ok" : "bg-muted")} /></span>
            {live ? "Live" : "Connecting…"}
          </span>
          <Link href="/scanner"><Button variant="primary"><ScanLine className="h-4 w-4" />Open scanner</Button></Link>
        </>} />

      <StatsRow guests={guests} loading={guestsLoading && guests.length === 0} />

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-muted" />QR validity</h2>
            {phase === "open" ? <Badge tone="ok">Open</Badge> : phase === "before" ? <Badge tone="warn">Upcoming</Badge> : <Badge>Closed</Badge>}
          </div>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs text-muted">Entry valid from</dt><dd className="font-medium">{fmtDateTime(event.valid_from, tz)}</dd></div>
            <div><dt className="text-xs text-muted">Entry valid until</dt><dd className="font-medium">{fmtDateTime(event.valid_until, tz)}</dd></div>
            <div><dt className="text-xs text-muted">Timezone</dt><dd className="font-medium">{tz.replace(/_/g, " ")} ({tzLabel(tz)})</dd></div>
          </dl>
          <p className="mt-4 rounded-xl bg-subtle px-3 py-2 text-[13px] text-muted">{msg}</p>
          {event.venue && <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted"><MapPin className="h-3.5 w-3.5" />{event.venue}</p>}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold">By category</h2>
          {cats.length === 0 ? <p className="text-sm text-muted">No guests yet.</p> : (
            <ul className="space-y-4">
              {cats.map(([name, v]) => (
                <li key={name}>
                  <div className="mb-1.5 flex items-center justify-between text-sm"><span className="font-medium">{name}</span><span className="tabular-nums text-muted">{v.total} guests</span></div>
                  {([["Entered", v.entered, "bg-ok"], ["Lunch", v.lunch, "bg-warn"], ["Dinner", v.dinner, "bg-accent"]] as const).map(([l, n, c]) => (
                    <div key={l} className="mb-1 flex items-center gap-2"><span className="w-12 text-[11px] text-muted">{l}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle"><div className={cn("h-full rounded-full transition-all", c)} style={{ width: `${(n / v.total) * 100}%` }} /></div>
                      <span className="w-10 text-right text-[11px] tabular-nums text-muted">{n}/{v.total}</span></div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">Live activity</h2><Link href="/guests" className="flex items-center gap-1 text-[13px] text-muted hover:text-ink">All guests <ArrowRight className="h-3.5 w-3.5" /></Link></div>
          {activity.length === 0 ? (
            <EmptyState icon={<ScanLine className="h-5 w-5" />} title="No activity yet" body="Entries, lunches and dinners appear here the moment they’re scanned." />
          ) : (
            <ul className="space-y-3">
              {activity.map((a) => { const Ic = SERVICE_ICON[a.sv]; return (
                <motion.li key={a.key} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
                  <Avatar name={a.name} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{a.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted"><span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium", TONE[a.sv])}><Ic className="h-3 w-3" />{SERVICE_LABEL[a.sv]}</span>{VERB[a.sv]}</p></div>
                  <span className="text-xs tabular-nums text-muted">{fmtTime(a.at, tz)}</span>
                </motion.li>
              ); })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
