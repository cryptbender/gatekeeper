"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Ban, Clock, Lock, WifiOff, XCircle } from "lucide-react";
import { SERVICE_LABEL, type ScanResponse, type Service } from "@/lib/types";
import { fmtTime } from "@/lib/time";

export type UiResult = (ScanResponse | { result: "ERROR" }) & { at: number; service: Service };

interface Look {
  bg: string; title: string; sub?: string; icon: "check" | "warn" | "x" | "clock" | "ban" | "wifi" | "lock"; ms: number;
}

/** Wording per outcome and per service (the spec's exact texts for Entry). */
export function lookFor(result: string, service: Service): Look {
  const S = SERVICE_LABEL[service].toUpperCase();
  const meal = service !== "entry";
  switch (result) {
    case "SUCCESS": return { bg: "#059669", title: `${S} APPROVED`, sub: "SUCCESS", icon: "check", ms: 1800 };
    case "ALREADY_IN":
      return meal
        ? { bg: "#dc2626", title: `${S} ALREADY TAKEN`, sub: `This guest has already availed ${service}.`, icon: "warn", ms: 3200 }
        : { bg: "#dc2626", title: "ALREADY IN!", sub: "This guest has already entered.", icon: "warn", ms: 3200 };
    case "NOT_ENTERED": return { bg: "#b45309", title: "NOT ENTERED YET", sub: `Scan this guest at Entry first, then ${service} can be served.`, icon: "clock", ms: 3000 };
    case "INVALID": return { bg: "#b91c1c", title: "INVALID QR CODE", sub: "This QR code is not registered in the system.", icon: "x", ms: 2800 };
    case "EXPIRED": return { bg: "#b45309", title: "TICKET EXPIRED", sub: "This ticket is outside its validity period.", icon: "clock", ms: 2800 };
    case "NOT_YET_OPEN": return { bg: "#b45309", title: "ENTRY NOT YET OPEN", sub: "Entry is not currently permitted.", icon: "clock", ms: 2800 };
    case "REVOKED": return { bg: "#b91c1c", title: "TICKET REVOKED", sub: "This ticket has been cancelled by the organizer.", icon: "ban", ms: 3000 };
    case "FORBIDDEN": return { bg: "#475569", title: "NOT ALLOWED", sub: "This account can’t scan. Contact the organizer.", icon: "lock", ms: 3200 };
    default: return { bg: "#475569", title: "COULDN’T REACH SERVER", sub: "This scan was NOT recorded. Scan again.", icon: "wifi", ms: 3200 };
  }
}

function Icon({ kind }: { kind: Look["icon"] }) {
  if (kind === "check") {
    return (
      <svg viewBox="0 0 120 120" className="h-full w-full" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <motion.circle cx="60" cy="60" r="50" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease: "easeOut" }} />
        <motion.path d="M36 62 L54 80 L86 44" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: 0.3, ease: "easeOut" }} />
      </svg>
    );
  }
  const C = { warn: AlertTriangle, x: XCircle, clock: Clock, ban: Ban, wifi: WifiOff, lock: Lock }[kind];
  return (
    <motion.div className="h-full w-full" initial={{ scale: 0.4, rotate: -12 }} animate={kind === "warn" ? { scale: 1, rotate: [0, -10, 10, -8, 8, 0] } : { scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 380, damping: 14, rotate: { duration: 0.6 } }}>
      <C className="h-full w-full text-white" strokeWidth={1.6} />
    </motion.div>
  );
}

export function ResultOverlay({ result, tz, onDismiss }: { result: UiResult | null; tz: string; onDismiss: () => void }) {
  const look = result ? lookFor(result.result, result.service) : null;
  const r = result as (ScanResponse & { at: number }) | null;
  return (
    <AnimatePresence>
      {result && look && (
        <motion.div key={result.at} role="alert" aria-live="assertive" onClick={onDismiss}
          className="fixed inset-0 z-[60] flex cursor-pointer select-none flex-col items-center justify-center overflow-hidden px-6 text-center text-white safe-t safe-b"
          initial={{ opacity: 0, backgroundColor: look.bg }} animate={{ opacity: 1, backgroundColor: look.bg }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
          {/* glow */}
          <motion.div aria-hidden className="pointer-events-none absolute left-1/2 top-[32%] h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25 blur-3xl"
            initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: [0.4, 1.1, 1], opacity: [0, 0.9, 0.5] }} transition={{ duration: 0.7 }} />
          {result.result === "ALREADY_IN" && (
            <motion.div aria-hidden className="absolute inset-0 bg-black" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.35, 0, 0.3, 0] }} transition={{ duration: 0.7 }} />
          )}

          <span className="absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-black/25 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.25em] safe-t">{SERVICE_LABEL[result.service]} scan</span>
          <div className="relative flex w-full max-w-md flex-col items-center">
            <div className="h-28 w-28 sm:h-36 sm:w-36"><Icon kind={look.icon} /></div>
            {look.sub && result.result === "SUCCESS" && (
              <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-6 text-sm font-semibold tracking-[0.3em] text-white/85">SUCCESS</motion.p>
            )}
            <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 24 }}
              className={`${result.result === "SUCCESS" ? "mt-1" : "mt-6"} text-4xl font-extrabold tracking-tight sm:text-5xl`}>{look.title}</motion.h1>
            {look.sub && result.result !== "SUCCESS" && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-3 max-w-sm text-base text-white/90 sm:text-lg">{look.sub}</motion.p>
            )}

            {r?.guest_name && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, type: "spring", stiffness: 260, damping: 24 }}
                className="mt-8 w-full rounded-2xl bg-black/20 p-5 text-left backdrop-blur-sm">
                <dl className="space-y-3">
                  <div><dt className="text-[11px] font-semibold uppercase tracking-widest text-white/70">Guest name</dt><dd className="break-words text-2xl font-bold leading-tight">{r.guest_name}</dd></div>
                  {result.result !== "REVOKED" && result.result !== "NOT_ENTERED" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div><dt className="text-[11px] font-semibold uppercase tracking-widest text-white/70">Category</dt><dd className="text-lg font-semibold">{r.category ?? "General"}</dd></div>
                      {result.result === "SUCCESS" && <div><dt className="text-[11px] font-semibold uppercase tracking-widest text-white/70">Status</dt><dd className="text-lg font-semibold">{result.service === "entry" ? "ENTERED" : `${SERVICE_LABEL[result.service].toUpperCase()} AVAILED`}</dd></div>}
                      {r.entered_at && <div className="col-span-2"><dt className="text-[11px] font-semibold uppercase tracking-widest text-white/70">{result.result === "SUCCESS" ? `${SERVICE_LABEL[result.service]} time` : `Previous ${result.service === "entry" ? "entry" : result.service}`}</dt><dd className="text-lg font-semibold tabular-nums">{fmtTime(r.entered_at, tz)}</dd></div>}
                    </div>
                  )}
                </dl>
              </motion.div>
            )}
          </div>

          <motion.div aria-hidden className="absolute bottom-0 left-0 h-1.5 bg-white/70" initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: look.ms / 1000, ease: "linear" }} />
          <p className="absolute bottom-4 text-xs text-white/70">Tap to continue · scanning resumes automatically</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
