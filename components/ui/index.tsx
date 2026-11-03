"use client";

import { forwardRef, useEffect, useId } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/components/app-provider";

/* ───────── Button ───────── */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, type = "button", ...p }, ref
) {
  const v = {
    primary: "bg-accent text-accent-ink hover:opacity-90 shadow-card border-transparent",
    secondary: "bg-surface text-ink hover:bg-subtle border-line shadow-card",
    ghost: "bg-transparent text-muted hover:text-ink hover:bg-subtle border-transparent",
    danger: "bg-danger text-white hover:opacity-90 border-transparent shadow-card",
  }[variant];
  const s = { sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg", md: "h-10 px-4 text-sm gap-2 rounded-xl", lg: "h-12 px-5 text-base gap-2 rounded-xl" }[size];
  return (
    <button ref={ref} type={type} disabled={disabled || loading}
      className={cn("inline-flex select-none items-center justify-center whitespace-nowrap border font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50", v, s, className)} {...p}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
});

/* ───────── Card ───────── */
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border bg-surface shadow-card", className)} {...p}>{children}</div>;
}

/* ───────── Badge ───────── */
export function Badge({ tone = "neutral", className, children }: { tone?: "neutral" | "ok" | "danger" | "warn" | "accent"; className?: string; children: React.ReactNode }) {
  const t = {
    neutral: "bg-subtle text-muted",
    ok: "bg-ok/10 text-ok",
    danger: "bg-danger/10 text-danger",
    warn: "bg-warn/10 text-warn",
    accent: "bg-accent/10 text-accent",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide", t, className)}>{children}</span>;
}

/* ───────── Form controls ───────── */
const ctl = "w-full rounded-xl border bg-surface px-3.5 text-sm text-ink placeholder:text-muted/70 shadow-card transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60";

export function Field({ label, hint, error, children, optional }: { label: string; hint?: string; error?: string | null; children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink">
        {label}{optional && <span className="font-normal text-muted">optional</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(ctl, "h-11", className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(ctl, "min-h-[88px] py-2.5", className)} {...p} />;
});
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return <select ref={ref} className={cn(ctl, "h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", className)}
    style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")" }} {...p}>{children}</select>;
});

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <button id={id} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-line")}>
        <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 34 }}
          className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow", checked ? "right-0.5" : "left-0.5")} />
      </button>
    </div>
  );
}

/* ───────── Modal (bottom sheet on mobile, dialog on desktop) ───────── */
export function Modal({ open, onClose, title, description, children, wide, footer }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 520, damping: 40 }}
            className={cn("relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border bg-surface shadow-pop sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
              </div>
              <button onClick={onClose} aria-label="Close" className="-mr-1.5 rounded-lg p-1.5 text-muted transition hover:bg-subtle hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer && <div className="safe-b flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ───────── Misc ───────── */
export function Spinner({ className }: { className?: string }) { return <Loader2 className={cn("h-5 w-5 animate-spin text-muted", className)} />; }

export function Skeleton({ className }: { className?: string }) { return <div className={cn("animate-pulse rounded-lg bg-subtle", className)} />; }

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border bg-subtle text-muted">{icon}</div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ───────── Toasts ───────── */
export function ToastHost() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 p-3 safe-t sm:items-end sm:p-5">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? AlertCircle : Info;
          const tone = t.kind === "success" ? "text-ok" : t.kind === "error" ? "text-danger" : "text-accent";
          return (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: -12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 500, damping: 36 }}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-surface p-3.5 shadow-pop">
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", tone)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.body && <p className="mt-0.5 break-words text-[13px] text-muted">{t.body}</p>}
              </div>
              <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
