export type TicketStatus = "active" | "revoked";

/** One QR, three actions. */
export type Service = "entry" | "lunch" | "dinner";
export const SERVICES: Service[] = ["entry", "lunch", "dinner"];
export const SERVICE_LABEL: Record<Service, string> = { entry: "Entry", lunch: "Lunch", dinner: "Dinner" };

export interface EventRow {
  id: string;
  name: string;
  description: string | null;
  venue: string | null;
  event_date: string; // YYYY-MM-DD
  valid_from: string; // ISO instant (UTC)
  valid_until: string; // ISO instant (UTC)
  timezone: string;
  created_at: string;
}

export interface EventInput {
  name: string;
  description?: string | null;
  venue?: string | null;
  event_date: string;
  valid_from: string;
  valid_until: string;
  timezone: string;
}

export interface GuestInput {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  category?: string | null;
}

/** A guest joined with their ticket and the time of each service they have used. */
export interface GuestRow {
  id: string;
  event_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  category: string | null;
  created_at: string;
  ticket_id: string;
  qr_token: string;
  ticket_status: TicketStatus;
  checked_in_at: string | null; // entry time
  lunch_at: string | null;
  dinner_at: string | null;
}

export const serviceTime = (g: Pick<GuestRow, "checked_in_at" | "lunch_at" | "dinner_at">, s: Service) =>
  s === "entry" ? g.checked_in_at : s === "lunch" ? g.lunch_at : g.dinner_at;

export type EntryStatus = "ENTERED" | "NOT_ENTERED" | "REVOKED";

export type ScanResultCode =
  | "SUCCESS"
  | "ALREADY_IN"
  | "INVALID"
  | "REVOKED"
  | "EXPIRED"
  | "NOT_YET_OPEN"
  | "NOT_ENTERED"
  | "FORBIDDEN";

export interface ScanResponse {
  result: ScanResultCode;
  service?: Service;
  guest_name?: string;
  category?: string | null;
  entered_at?: string;
}

export interface DataStore {
  readonly mode: "supabase" | "local";
  /** Local mode: always true. Supabase mode: is the signed-in user an admin? */
  isAdmin(): Promise<boolean>;
  listEvents(): Promise<EventRow[]>;
  createEvent(input: EventInput): Promise<EventRow>;
  updateEvent(id: string, patch: Partial<EventInput>): Promise<EventRow>;
  deleteEvent(id: string): Promise<void>;
  loadGuests(eventId: string): Promise<GuestRow[]>;
  addGuests(eventId: string, guests: GuestInput[]): Promise<number>;
  updateGuest(guestId: string, patch: GuestInput): Promise<void>;
  deleteGuests(guestIds: string[]): Promise<void>;
  setTicketStatus(ticketId: string, status: TicketStatus): Promise<void>;
  regenerateTicket(ticketId: string): Promise<string>;
  checkIn(eventId: string, token: string, service?: Service): Promise<ScanResponse>;
  undoCheckin(ticketId: string, service: Service): Promise<void>;
}

export function entryStatus(g: Pick<GuestRow, "checked_in_at" | "ticket_status">): EntryStatus {
  if (g.checked_in_at) return "ENTERED";
  if (g.ticket_status === "revoked") return "REVOKED";
  return "NOT_ENTERED";
}
