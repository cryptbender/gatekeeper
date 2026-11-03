import type { EventRow, ScanResponse } from "./types";

export interface ScanTicket {
  id: string;
  status: "active" | "revoked";
  guest_name: string;
  category: string | null;
  checked_in_at: string | null;
}

/**
 * Pure mirror of the decision order inside public.check_in() (SQL).
 * Used by the local dev store and unit tests. Order matters:
 * ENTERED is permanent, so ALREADY_IN is decided before validity.
 */
export function evaluateScan(
  ticket: ScanTicket | undefined,
  event: Pick<EventRow, "valid_from" | "valid_until">,
  now: number
): ScanResponse {
  if (!ticket) return { result: "INVALID" };
  if (ticket.checked_in_at) {
    return { result: "ALREADY_IN", guest_name: ticket.guest_name, category: ticket.category, entered_at: ticket.checked_in_at };
  }
  if (ticket.status === "revoked") return { result: "REVOKED", guest_name: ticket.guest_name, category: ticket.category };
  if (now < new Date(event.valid_from).getTime()) return { result: "NOT_YET_OPEN" };
  if (now > new Date(event.valid_until).getTime()) return { result: "EXPIRED" };
  return { result: "SUCCESS", guest_name: ticket.guest_name, category: ticket.category, entered_at: new Date(now).toISOString() };
}

/** Normalise raw scanner / camera output into a token candidate. */
export function normalizeToken(raw: string): string {
  return raw.replace(/[\r\n\t]+/g, "").trim().toLowerCase();
}
