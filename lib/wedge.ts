import { useEffect, useRef } from "react";

/**
 * Detects keyboard-wedge barcode scanners (USB / Bluetooth HID) by typing speed.
 * Scanners "type" a whole code in a few dozen ms, usually followed by Enter or Tab.
 * Humans are far slower, so slow input is never intercepted and normal navigation keeps working.
 */
export class WedgeDetector {
  private buf = "";
  private t0 = 0;
  private last = 0;
  constructor(private o = { minLen: 8, maxAvgMs: 70, gapMs: 120, noSuffixMinLen: 16, noSuffixAvgMs: 40 }) {}

  private avg() { const n = this.buf.length; return n < 2 ? 0 : (this.last - this.t0) / (n - 1); }
  private reset() { this.buf = ""; }
  private take(minLen: number, maxAvg: number): string | null {
    const ok = this.buf.length >= minLen && this.avg() <= maxAvg;
    const c = ok ? this.buf : null;
    this.reset();
    return c;
  }

  key(key: string, now: number): { prevent: boolean; emit?: string } {
    if (key.length === 1) {
      if (this.buf && now - this.last > this.o.gapMs) this.reset();
      if (!this.buf) this.t0 = now;
      this.buf += key; this.last = now;
      return { prevent: this.buf.length >= 3 && this.avg() <= this.o.maxAvgMs };
    }
    if (key === "Enter" || key === "Tab") {
      const fresh = this.buf && now - this.last <= this.o.gapMs;
      const code = fresh ? this.take(this.o.minLen, this.o.maxAvgMs) : (this.reset(), null);
      return code ? { prevent: true, emit: code } : { prevent: false };
    }
    return { prevent: false }; // Shift, arrows, etc. never reset or intercept
  }

  /** For scanners that send no Enter/Tab: call after a short idle gap. */
  idle(now: number): string | null {
    if (!this.buf || now - this.last < this.o.gapMs) return null;
    return this.take(this.o.noSuffixMinLen, this.o.noSuffixAvgMs);
  }
}

export function useWedgeScanner(onCode: (code: string) => void, enabled: boolean) {
  const cb = useRef(onCode);
  cb.current = onCode;
  useEffect(() => {
    if (!enabled) return;
    const det = new WedgeDetector();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; // never hijack typing in fields
      const r = det.key(e.key, performance.now());
      if (r.prevent) e.preventDefault();
      clearTimeout(timer);
      if (r.emit) cb.current(r.emit);
      else timer = setTimeout(() => { const c = det.idle(performance.now()); if (c) cb.current(c); }, 160);
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); clearTimeout(timer); };
  }, [enabled]);
}
