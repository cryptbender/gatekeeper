"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Badge, Card, Skeleton } from "@/components/ui";
import { Check, Moon, Utensils, LogIn } from "lucide-react";
import { entryStatus, SERVICES, serviceTime, SERVICE_LABEL, type GuestRow, type Service } from "@/lib/types";
import { fmtTime } from "@/lib/time";
import { cachedQr } from "@/lib/qr";
import { cn, initials } from "@/lib/utils";

export function StatusBadge({ g }: { g: Pick<GuestRow, "checked_in_at" | "ticket_status"> }) {
  const s = entryStatus(g);
  if (s === "ENTERED") return <Badge tone="ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Entered</Badge>;
  if (s === "REVOKED") return <Badge tone="danger"><span className="h-1.5 w-1.5 rounded-full bg-danger" />Revoked</Badge>;
  return <Badge><span className="h-1.5 w-1.5 rounded-full bg-muted/60" />Not entered</Badge>;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-semibold text-accent", className)}>{initials(name)}</div>;
}

export const SERVICE_ICON = { entry: LogIn, lunch: Utensils, dinner: Moon } as const;

export function useStats(guests: GuestRow[]) {
  return useMemo(() => {
    const total = guests.length;
    const n = (f: (g: GuestRow) => string | null) => guests.filter((g) => f(g)).length;
    const entered = n((g) => g.checked_in_at), lunch = n((g) => g.lunch_at), dinner = n((g) => g.dinner_at);
    const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
    return { total, entered, lunch, dinner, notEntered: total - entered, pct: pct(entered), lunchPct: pct(lunch), dinnerPct: pct(dinner) };
  }, [guests]);
}

export function StatsRow({ guests, loading }: { guests: GuestRow[]; loading?: boolean }) {
  const s = useStats(guests);
  const items = [
    { label: "Total guests", value: s.total, pct: null as number | null, tone: "", bar: "" },
    { label: "Entered", value: s.entered, pct: s.pct, tone: "text-ok", bar: "bg-ok" },
    { label: "Lunch availed", value: s.lunch, pct: s.lunchPct, tone: "text-warn", bar: "bg-warn" },
    { label: "Dinner availed", value: s.dinner, pct: s.dinnerPct, tone: "text-accent", bar: "bg-accent" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it, i) => (
        <motion.div key={it.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.25 }}>
          <Card className="p-4 sm:p-5">
            <p className="text-[13px] text-muted">{it.label}</p>
            {loading ? <Skeleton className="mt-2 h-8 w-16" /> : (
              <div className="mt-1 flex items-baseline gap-2">
                <motion.p key={it.value} initial={{ opacity: 0.4, y: 3 }} animate={{ opacity: 1, y: 0 }} className={cn("text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl", it.tone)}>{it.value.toLocaleString()}</motion.p>
                {it.pct !== null && <span className="text-xs tabular-nums text-muted">{it.pct}%</span>}
              </div>
            )}
            {it.pct !== null && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle"><motion.div className={cn("h-full rounded-full", it.bar)} initial={false} animate={{ width: `${it.pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} /></div>
            )}
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

/** Entry / Lunch / Dinner pills for one guest (mobile cards). */
export function ServiceChips({ g, tz }: { g: GuestRow; tz: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SERVICES.map((sv: Service) => {
        const t = serviceTime(g, sv); const Ic = SERVICE_ICON[sv];
        return (
          <span key={sv} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium", t ? "bg-ok/10 text-ok" : "bg-subtle text-muted")}>
            {t ? <Check className="h-3 w-3" /> : <Ic className="h-3 w-3" />}{SERVICE_LABEL[sv]}{t && <span className="tabular-nums opacity-80"> {fmtTime(t, tz)}</span>}
          </span>
        );
      })}
    </div>
  );
}

/** Table cell for lunch / dinner. */
export function ServiceCell({ at, tz }: { at: string | null; tz: string }) {
  return at ? <span className="inline-flex items-center gap-1 text-[13px] font-medium text-ok"><Check className="h-3.5 w-3.5" /><span className="tabular-nums">{fmtTime(at, tz)}</span></span> : <span className="text-muted">—</span>;
}

/** QR image — always black on white with its quiet zone baked in. */
export function QrImage({ token, size = 220, className }: { token: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let live = true; cachedQr(token, 900).then((u) => live && setSrc(u)); return () => { live = false; }; }, [token]);
  return (
    <div className={cn("overflow-hidden rounded-xl bg-white", className)} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} width={size} height={size} alt="Guest QR code" className="block h-full w-full" /> : <Skeleton className="h-full w-full rounded-none" />}
    </div>
  );
}
