// Timezone helpers built on Intl only (no date library).

export function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Wall-clock date + time in `tz` -> UTC ISO string. Handles DST by iterating. */
export function zonedToUtcIso(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm, 0);
  let guess = wall - tzOffsetMs(wall, tz);
  guess = wall - tzOffsetMs(guess, tz);
  return new Date(guess).toISOString();
}

/** UTC instant -> { date: "YYYY-MM-DD", time: "HH:mm" } in `tz`. */
export function utcToZonedParts(iso: string, tz: string) {
  const ms = new Date(iso).getTime();
  const z = new Date(ms + tzOffsetMs(ms, tz));
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${z.getUTCFullYear()}-${pad(z.getUTCMonth() + 1)}-${pad(z.getUTCDate())}`,
    time: `${pad(z.getUTCHours())}:${pad(z.getUTCMinutes())}`,
  };
}

export function fmtDateTime(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

export function fmtTime(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

export function fmtDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export function tzLabel(tz: string) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date()).find((p) => p.type === "timeZoneName");
    return part?.value ?? tz;
  } catch { return tz; }
}

export function allTimezones(): string[] {
  const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  const list = fn ? fn("timeZone") : [];
  return list.length ? list : ["UTC", "Asia/Kolkata", "Europe/London", "America/New_York", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney"];
}

export type Phase = "before" | "open" | "closed";
export function eventPhase(validFrom: string, validUntil: string, now = Date.now()): Phase {
  if (now < new Date(validFrom).getTime()) return "before";
  if (now > new Date(validUntil).getTime()) return "closed";
  return "open";
}
