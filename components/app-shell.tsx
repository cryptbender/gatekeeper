"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogOut, Printer, ScanLine, Settings, Users, FlaskConical } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useApp } from "./app-provider";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { Badge, Spinner, ToastHost } from "./ui";
import { EventGate } from "./event-gate";
import { eventPhase } from "@/lib/time";

const NAV = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard },
  { href: "/guests", label: "Guest List", short: "Guests", icon: Users },
  { href: "/scanner", label: "QR Scanner", short: "Scan", icon: ScanLine },
  { href: "/printing", label: "QR Printing", short: "Print", icon: Printer },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, event, mode, userEmail, signOut } = useApp();
  const path = usePathname();
  const fullBleed = path.startsWith("/scanner");

  if (!ready) {
    return <div className="grid min-h-dvh place-items-center"><Spinner className="h-6 w-6" /></div>;
  }

  const phase = event ? eventPhase(event.valid_from, event.valid_until) : null;
  const phaseBadge = phase === "open" ? <Badge tone="ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Entry open</Badge>
    : phase === "before" ? <Badge tone="warn">Not open yet</Badge> : phase === "closed" ? <Badge>Entry closed</Badge> : null;

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-surface lg:flex">
        <div className="flex h-16 items-center px-5"><Logo /></div>
        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {NAV.map((n) => {
            const active = path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={cn("relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition", active ? "text-ink" : "text-muted hover:bg-subtle hover:text-ink")}>
                {active && <motion.span layoutId="side-active" className="absolute inset-0 rounded-lg bg-subtle" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <n.icon className="relative h-[18px] w-[18px]" /><span className="relative">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          {event && (
            <div className="mb-2 rounded-xl bg-subtle p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Current event</p>
              <p className="mt-0.5 truncate text-sm font-medium">{event.name}</p>
              <div className="mt-2">{phaseBadge}</div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="min-w-0 truncate text-xs text-muted">{userEmail ?? "Local session"}</p>
            {mode === "supabase" && <button onClick={() => void signOut()} aria-label="Sign out" className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-ink"><LogOut className="h-4 w-4" /></button>}
          </div>
        </div>
      </aside>

      {/* Top bar */}
      {!fullBleed && (
        <header className="sticky top-0 z-20 border-b bg-bg/85 backdrop-blur-md safe-t">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="lg:hidden"><Logo /></div>
              {event && <div className="hidden min-w-0 items-center gap-3 lg:flex"><p className="truncate text-sm font-medium">{event.name}</p>{phaseBadge}</div>}
            </div>
            <div className="flex items-center gap-1">
              {event && <div className="mr-1 sm:hidden">{phaseBadge}</div>}
              <ThemeToggle />
            </div>
          </div>
        </header>
      )}

      {mode === "local" && !fullBleed && (
        <div className="flex items-center justify-center gap-2 border-b bg-warn/10 px-4 py-2 text-center text-xs font-medium text-warn">
          <FlaskConical className="h-3.5 w-3.5 shrink-0" />
          LOCAL DEV MODE — data is stored in this browser only. Add Supabase keys to go live.
        </div>
      )}

      <main className={cn(fullBleed ? "" : "px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12", !fullBleed && "mx-auto max-w-[1280px]")}>
        {event || path.startsWith("/settings") ? children : <EventGate />}
      </main>

      {/* Mobile bottom nav */}
      <nav className="safe-b fixed inset-x-0 bottom-0 z-30 border-t bg-surface/95 backdrop-blur-md lg:hidden" aria-label="Primary">
        <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
          {NAV.map((n) => {
            const active = path.startsWith(n.href);
            const center = n.href === "/scanner";
            return (
              <li key={n.href} className="flex justify-center">
                <Link href={n.href} aria-label={n.label} className={cn("flex flex-col items-center gap-1 py-2 text-[11px] font-medium", center ? "-mt-5" : "", active ? "text-ink" : "text-muted")}>
                  {center ? (
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-ink shadow-pop ring-4 ring-surface"><n.icon className="h-6 w-6" /></span>
                  ) : (
                    <n.icon className={cn("h-5 w-5", active && "text-accent")} />
                  )}
                  {n.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <ToastHost />
    </div>
  );
}
