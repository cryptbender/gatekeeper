import type { EventRow, ScanResponse, Service } from "./types";

export interface ScanTicket {
  id: string;
  status: "active" | "revoked";
  guest_name: string;
  category: string | null;
  /** ISO time per service already used by this ticket */
  done: Partial<Record<Service, string>>;
}

/**
 * Pure mirror of the decision order inside public.check_in() (SQL).
 * Used by the local dev store and unit tests.
 *  1 unknown ticket            -> INVALID
 *  2 service already used      -> ALREADY_IN   (permanent; beats revocation and expiry)
 *  3 ticket revoked            -> REVOKED
 *  4 entry:  outside window    -> NOT_YET_OPEN / EXPIRED
 *    lunch/dinner: not inside  -> NOT_ENTERED  (no time-window check: the guest is already inside)
 *  5 otherwise                 -> SUCCESS
 */
export function evaluateScan(
  ticket: ScanTicket | undefined,
  event: Pick<EventRow, "valid_from" | "valid_until">,
  now: number,
  service: Service = "entry"
): ScanResponse {
  if (!ticket) return { result: "INVALID", service };
  const base = { service, guest_name: ticket.guest_name, category: ticket.category };
  const prev = ticket.done[service];
  if (prev) return { result: "ALREADY_IN", ...base, entered_at: prev };
  if (ticket.status === "revoked") return { result: "REVOKED", ...base };
  if (service === "entry") {
    if (now < new Date(event.valid_from).getTime()) return { result: "NOT_YET_OPEN", service };
    if (now > new Date(event.valid_until).getTime()) return { result: "EXPIRED", service };
  } else if (!ticket.done.entry) {
    return { result: "NOT_ENTERED", ...base };
  }
  return { result: "SUCCESS", ...base, entered_at: new Date(now).toISOString() };
}

/** Normalise raw scanner / camera output into a token candidate. */
export function normalizeToken(raw: string): string {
  return raw.replace(/\s+/g, "").toLowerCase();
}
