// LOCAL DEV MODE — used only when Supabase env vars are missing.
// Data lives in this browser's localStorage. There is NO server-side protection here:
// do not use for a real event. It exists so the whole UI can be exercised without credentials.
import { evaluateScan, normalizeToken } from "../scan";
import { randomHex } from "../utils";
import type {
  DataStore, EventInput, EventRow, GuestInput, GuestRow, ScanResponse, Service, TicketStatus,
} from "../types";

interface DB {
  events: EventRow[];
  guests: Omit<GuestRow, "ticket_id" | "qr_token" | "ticket_status" | "checked_in_at" | "lunch_at" | "dinner_at">[];
  tickets: { id: string; guest_id: string; event_id: string; qr_token: string; status: TicketStatus }[];
  checkins: { id: string; ticket_id: string; guest_id: string; event_id: string; checked_in_at: string; service?: Service }[];
}
const KEY = "eqr.local.v1";
const empty = (): DB => ({ events: [], guests: [], tickets: [], checkins: [] });

function read(): DB {
  if (typeof localStorage === "undefined") return empty();
  try { return { ...empty(), ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<DB>) }; }
  catch { return empty(); }
}
function write(db: DB) { localStorage.setItem(KEY, JSON.stringify(db)); }
const uid = () => crypto.randomUUID();

export const localStore: DataStore = {
  mode: "local",

  async isAdmin() { return true; },

  async listEvents() {
    return read().events.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async createEvent(input: EventInput) {
    const db = read();
    const ev: EventRow = {
      id: uid(), name: input.name, description: input.description ?? null, venue: input.venue ?? null,
      event_date: input.event_date, valid_from: input.valid_from, valid_until: input.valid_until,
      timezone: input.timezone, created_at: new Date().toISOString(),
    };
    if (new Date(ev.valid_until) <= new Date(ev.valid_from)) throw new Error("Valid until must be after valid from");
    db.events.push(ev); write(db);
    return ev;
  },

  async updateEvent(id, patch) {
    const db = read();
    const ev = db.events.find((e) => e.id === id);
    if (!ev) throw new Error("Event not found");
    const next = { ...ev, ...patch };
    if ((patch.valid_from || patch.valid_until) &&
        (next.valid_from !== ev.valid_from || next.valid_until !== ev.valid_until) &&
        Date.now() >= new Date(ev.valid_from).getTime()) {
      throw new Error("Validity cannot be changed after entry has opened");
    }
    if (new Date(next.valid_until) <= new Date(next.valid_from)) throw new Error("Valid until must be after valid from");
    Object.assign(ev, next); write(db);
    return ev;
  },

  async deleteEvent(id) {
    const db = read();
    db.events = db.events.filter((e) => e.id !== id);
    db.guests = db.guests.filter((g) => g.event_id !== id);
    db.tickets = db.tickets.filter((t) => t.event_id !== id);
    db.checkins = db.checkins.filter((c) => c.event_id !== id);
    write(db);
  },

  async loadGuests(eventId) {
    const db = read();
    const tickets = new Map(db.tickets.map((t) => [t.guest_id, t]));
    const at = (ticketId: string, s: Service) =>
      db.checkins.find((c) => c.ticket_id === ticketId && (c.service ?? "entry") === s)?.checked_in_at ?? null;
    return db.guests.filter((g) => g.event_id === eventId).flatMap((g) => {
      const t = tickets.get(g.id);
      if (!t) return [];
      return [{ ...g, ticket_id: t.id, qr_token: t.qr_token, ticket_status: t.status,
        checked_in_at: at(t.id, "entry"), lunch_at: at(t.id, "lunch"), dinner_at: at(t.id, "dinner") } as GuestRow];
    });
  },

  async addGuests(eventId, guests: GuestInput[]) {
    const db = read();
    if (!db.events.some((e) => e.id === eventId)) throw new Error("Event not found");
    let n = 0;
    for (const g of guests) {
      const name = g.full_name?.trim();
      if (!name) continue;
      const id = uid();
      db.guests.push({ id, event_id: eventId, full_name: name, phone: g.phone?.trim() || null,
        email: g.email?.trim() || null, category: g.category?.trim() || null, created_at: new Date().toISOString() });
      db.tickets.push({ id: uid(), guest_id: id, event_id: eventId, qr_token: randomHex(16), status: "active" });
      n++;
    }
    write(db);
    return n;
  },

  async updateGuest(guestId, patch) {
    const db = read();
    const g = db.guests.find((x) => x.id === guestId);
    if (!g) throw new Error("Guest not found");
    g.full_name = patch.full_name.trim();
    g.phone = patch.phone?.trim() || null;
    g.email = patch.email?.trim() || null;
    g.category = patch.category?.trim() || null;
    write(db);
  },

  async deleteGuests(ids) {
    const db = read();
    const set = new Set(ids);
    const tix = new Set(db.tickets.filter((t) => set.has(t.guest_id)).map((t) => t.id));
    db.guests = db.guests.filter((g) => !set.has(g.id));
    db.tickets = db.tickets.filter((t) => !set.has(t.guest_id));
    db.checkins = db.checkins.filter((c) => !tix.has(c.ticket_id));
    write(db);
  },

  async setTicketStatus(ticketId, status) {
    const db = read();
    const t = db.tickets.find((x) => x.id === ticketId);
    if (t) t.status = status;
    write(db);
  },

  async regenerateTicket(ticketId) {
    const db = read();
    const t = db.tickets.find((x) => x.id === ticketId);
    if (!t) throw new Error("Ticket not found");
    if (db.checkins.some((c) => c.ticket_id === ticketId)) throw new Error("Guest has already entered; the ticket cannot be regenerated");
    t.qr_token = randomHex(16); t.status = "active";
    write(db);
    return t.qr_token;
  },

  // localStorage reads/writes here are synchronous (no await between read and write),
  // so within one browser the check + insert cannot interleave.
  async checkIn(eventId, token, service = "entry"): Promise<ScanResponse> {
    const db = read();
    const ev = db.events.find((e) => e.id === eventId);
    if (!ev) return { result: "INVALID", service };
    const t = db.tickets.find((x) => x.event_id === eventId && x.qr_token === normalizeToken(token));
    const g = t && db.guests.find((x) => x.id === t.guest_id);
    const done: Partial<Record<Service, string>> = {};
    if (t) for (const c of db.checkins) if (c.ticket_id === t.id) done[c.service ?? "entry"] = c.checked_in_at;
    const res = evaluateScan(
      t && g ? { id: t.id, status: t.status, guest_name: g.full_name, category: g.category, done } : undefined,
      ev, Date.now(), service
    );
    if (res.result === "SUCCESS" && t && g) {
      db.checkins.push({ id: uid(), ticket_id: t.id, guest_id: g.id, event_id: eventId, checked_in_at: res.entered_at!, service });
      write(db);
    }
    return res;
  },

  async undoCheckin(ticketId, service) {
    const db = read();
    if (service === "entry" && db.checkins.some((c) => c.ticket_id === ticketId && (c.service ?? "entry") !== "entry")) {
      throw new Error("Undo lunch and dinner first");
    }
    db.checkins = db.checkins.filter((c) => !(c.ticket_id === ticketId && (c.service ?? "entry") === service));
    write(db);
  },
};
