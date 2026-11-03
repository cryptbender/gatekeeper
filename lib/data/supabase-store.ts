import { getSupabase } from "../supabase";
import { normalizeToken } from "../scan";
import type {
  DataStore, EventInput, EventRow, GuestInput, GuestRow, ScanResponse, Service, TicketStatus,
} from "../types";

const PAGE = 1000;

function fail(error: { message: string } | null): never {
  throw new Error(error?.message ?? "Unknown database error");
}

type Joined = {
  id: string; event_id: string; full_name: string; phone: string | null; email: string | null;
  category: string | null; created_at: string;
  tickets: { id: string; qr_token: string; status: TicketStatus } | { id: string; qr_token: string; status: TicketStatus }[] | null;
  checkins: { service: Service; checked_in_at: string }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export const supabaseStore: DataStore = {
  mode: "supabase",

  async isAdmin() {
    const { data, error } = await getSupabase().rpc("is_admin");
    if (error) fail(error);
    return data === true;
  },

  async listEvents() {
    const { data, error } = await getSupabase().from("events").select("*").order("created_at", { ascending: false });
    if (error) fail(error);
    return data as EventRow[];
  },

  async createEvent(input: EventInput) {
    const { data, error } = await getSupabase().from("events").insert(input).select().single();
    if (error) fail(error);
    return data as EventRow;
  },

  async updateEvent(id, patch) {
    const { data, error } = await getSupabase().from("events").update(patch).eq("id", id).select().single();
    if (error) fail(error);
    return data as EventRow;
  },

  async deleteEvent(id) {
    const { error } = await getSupabase().from("events").delete().eq("id", id);
    if (error) fail(error);
  },

  async loadGuests(eventId) {
    const sb = getSupabase();
    const rows: GuestRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from("guests")
        .select("id,event_id,full_name,phone,email,category,created_at,tickets(id,qr_token,status),checkins(service,checked_in_at)")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) fail(error);
      const batch = (data ?? []) as unknown as Joined[];
      for (const g of batch) {
        const t = one(g.tickets);
        if (!t) continue;
        const at = (s: Service) => g.checkins?.find((c) => c.service === s)?.checked_in_at ?? null;
        rows.push({
          id: g.id, event_id: g.event_id, full_name: g.full_name, phone: g.phone, email: g.email,
          category: g.category, created_at: g.created_at,
          ticket_id: t.id, qr_token: t.qr_token, ticket_status: t.status,
          checked_in_at: at("entry"), lunch_at: at("lunch"), dinner_at: at("dinner"),
        });
      }
      if (batch.length < PAGE) break;
    }
    return rows;
  },

  async addGuests(eventId, guests) {
    const sb = getSupabase();
    let created = 0;
    for (let i = 0; i < guests.length; i += 500) {
      const { data, error } = await sb.rpc("add_guests", { p_event_id: eventId, p_guests: guests.slice(i, i + 500) });
      if (error) fail(error);
      created += Number(data ?? 0);
    }
    return created;
  },

  async updateGuest(guestId, patch: GuestInput) {
    const { error } = await getSupabase().from("guests").update({
      full_name: patch.full_name.trim(),
      phone: patch.phone?.trim() || null,
      email: patch.email?.trim() || null,
      category: patch.category?.trim() || null,
    }).eq("id", guestId);
    if (error) fail(error);
  },

  async deleteGuests(ids) {
    const sb = getSupabase();
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await sb.from("guests").delete().in("id", ids.slice(i, i + 200));
      if (error) fail(error);
    }
  },

  async setTicketStatus(ticketId, status) {
    const { error } = await getSupabase().from("tickets").update({ status }).eq("id", ticketId);
    if (error) fail(error);
  },

  async regenerateTicket(ticketId) {
    const { data, error } = await getSupabase().rpc("regenerate_ticket", { p_ticket_id: ticketId });
    if (error) fail(error);
    return data as string;
  },

  async checkIn(eventId, token, service = "entry"): Promise<ScanResponse> {
    const { data, error } = await getSupabase().rpc("check_in", { p_event_id: eventId, p_token: normalizeToken(token), p_service: service });
    if (error) fail(error);
    return data as ScanResponse;
  },

  async undoCheckin(ticketId, service) {
    const { error } = await getSupabase().rpc("undo_checkin", { p_ticket_id: ticketId, p_service: service });
    if (error) fail(error);
  },
};
