// Drives the REAL supabaseStore (supabase-js -> HTTP -> PostgREST -> Postgres with the real migrations + RLS).
// Run: ./tests/sql-reset.sh && ./tests/integration/start.sh && npx vitest run -c vitest.int.config.ts
import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DataStore } from "@/lib/types";

const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const ADMIN = "11111111-1111-1111-1111-111111111111";
const PLAIN = "22222222-2222-2222-2222-222222222222";
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(sub: string) {
  const h = b64({ alg: "HS256", typ: "JWT" }), p = b64({ role: "authenticated", aud: "authenticated", sub, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
}
async function storeFor(sub: string): Promise<DataStore> {
  vi.resetModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = '  "http://127.0.0.1:54321/rest/v1/"  '; // also proves the URL sanitiser on a mispasted value
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = jwt(sub); // acts as the signed-in user's access token
  return (await import("@/lib/data/supabase-store")).supabaseStore;
}

let admin: DataStore, plain: DataStore;
let eventId = "";
const now = Date.now();
beforeAll(async () => { admin = await storeFor(ADMIN); plain = await storeFor(PLAIN); });

describe("supabaseStore against real PostgREST + Postgres", () => {
  it("isAdmin: true for the admin, false for an ordinary signed-in user", async () => {
    expect(await admin.isAdmin()).toBe(true);
    expect(await plain.isAdmin()).toBe(false);
  });

  it("createEvent / listEvents / updateEvent (timestamps, constraint, validity guard)", async () => {
    const ev = await admin.createEvent({ name: "Gala", event_date: "2026-11-03", valid_from: new Date(now - 3600e3).toISOString(), valid_until: new Date(now + 3600e3).toISOString(), timezone: "Asia/Kolkata", venue: "Hall" });
    eventId = ev.id;
    expect(ev.timezone).toBe("Asia/Kolkata");
    expect((await admin.listEvents()).map((e) => e.id)).toContain(eventId);
    await expect(admin.createEvent({ name: "Bad", event_date: "2026-11-03", valid_from: "2026-11-03T10:00:00Z", valid_until: "2026-11-03T10:00:00Z", timezone: "UTC" })).rejects.toThrow(/events_valid_range|violates check/);
    await expect(admin.updateEvent(eventId, { valid_until: new Date(now + 7200e3).toISOString() })).rejects.toThrow(/cannot be changed after entry has opened/);
    expect((await admin.updateEvent(eventId, { name: "Gala 2026" })).name).toBe("Gala 2026");
  });

  it("addGuests (RPC) + loadGuests: embedded ticket/checkins shape is parsed correctly", async () => {
    const n = await admin.addGuests(eventId, [
      { full_name: "Rahul Kumar", phone: "9876543210", email: "rahul@example.com", category: "VIP" },
      { full_name: "Aman Khan", category: "General" },
      { full_name: "   " }, // blank -> skipped by the server
    ]);
    expect(n).toBe(2);
    const g = await admin.loadGuests(eventId);
    expect(g).toHaveLength(2);
    const r = g.find((x) => x.full_name === "Rahul Kumar")!;
    expect(r).toMatchObject({ phone: "9876543210", email: "rahul@example.com", category: "VIP", ticket_status: "active", checked_in_at: null, lunch_at: null, dinner_at: null });
    expect(r.qr_token).toMatch(/^[0-9a-f]{32}$/);
    expect(r.ticket_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("entry -> lunch -> dinner flow through the API, reflected in loadGuests", async () => {
    const [rahul] = (await admin.loadGuests(eventId)).filter((x) => x.full_name === "Rahul Kumar");
    const t = rahul.qr_token;
    expect((await admin.checkIn(eventId, t, "lunch")).result).toBe("NOT_ENTERED");
    const a = await admin.checkIn(eventId, t.toUpperCase() + "\r\n", "entry"); // upper-case payload + scanner suffix
    expect(a).toMatchObject({ result: "SUCCESS", service: "entry", guest_name: "Rahul Kumar", category: "VIP" });
    expect((await admin.checkIn(eventId, t)).result).toBe("ALREADY_IN");           // default service = entry
    expect((await admin.checkIn(eventId, t, "lunch")).result).toBe("SUCCESS");
    expect((await admin.checkIn(eventId, t, "lunch")).result).toBe("ALREADY_IN");
    expect((await admin.checkIn(eventId, t, "dinner")).result).toBe("SUCCESS");
    const row = (await admin.loadGuests(eventId)).find((x) => x.id === rahul.id)!;
    expect(row.checked_in_at).toBe(a.entered_at);
    expect(row.lunch_at && row.dinner_at).toBeTruthy();
    expect((await admin.checkIn(eventId, "not-a-token", "entry")).result).toBe("INVALID");
  });

  it("undo: entry blocked while meals exist (server message surfaces); lunch can be undone and retaken", async () => {
    const rahul = (await admin.loadGuests(eventId)).find((x) => x.full_name === "Rahul Kumar")!;
    await expect(admin.undoCheckin(rahul.ticket_id, "entry")).rejects.toThrow(/Undo lunch and dinner first/);
    await admin.undoCheckin(rahul.ticket_id, "lunch");
    expect((await admin.loadGuests(eventId)).find((x) => x.id === rahul.id)!.lunch_at).toBeNull();
    expect((await admin.checkIn(eventId, rahul.qr_token, "lunch")).result).toBe("SUCCESS");
  });

  it("updateGuest, revoke / restore, regenerate", async () => {
    const aman = (await admin.loadGuests(eventId)).find((x) => x.full_name === "Aman Khan")!;
    await admin.updateGuest(aman.id, { full_name: "Aman K. Khan", phone: "", email: "", category: "VIP" });
    await admin.setTicketStatus(aman.ticket_id, "revoked");
    let row = (await admin.loadGuests(eventId)).find((x) => x.id === aman.id)!;
    expect(row).toMatchObject({ full_name: "Aman K. Khan", category: "VIP", phone: null, ticket_status: "revoked" });
    expect((await admin.checkIn(eventId, aman.qr_token)).result).toBe("REVOKED");
    await admin.setTicketStatus(aman.ticket_id, "active");
    const fresh = await admin.regenerateTicket(aman.ticket_id);
    expect(fresh).toMatch(/^[0-9a-f]{32}$/);
    expect((await admin.checkIn(eventId, aman.qr_token)).result).toBe("INVALID");
    expect((await admin.checkIn(eventId, fresh)).result).toBe("SUCCESS");
    await expect(admin.regenerateTicket(aman.ticket_id)).rejects.toThrow(/already entered/);
    row = (await admin.loadGuests(eventId)).find((x) => x.id === aman.id)!;
    expect(row.qr_token).toBe(fresh);
  });

  it("40 simultaneous lunch scans over HTTP -> exactly one SUCCESS", async () => {
    await admin.addGuests(eventId, [{ full_name: "Race Guest" }]);
    const g = (await admin.loadGuests(eventId)).find((x) => x.full_name === "Race Guest")!;
    await admin.checkIn(eventId, g.qr_token, "entry");
    const res = await Promise.all(Array.from({ length: 40 }, () => admin.checkIn(eventId, g.qr_token, "lunch")));
    expect(res.filter((r) => r.result === "SUCCESS")).toHaveLength(1);
    expect(res.filter((r) => r.result === "ALREADY_IN")).toHaveLength(39);
  });

  it("loads more than 1000 guests (pagination) in a stable order", async () => {
    const list = Array.from({ length: 1200 }, (_, i) => ({ full_name: `Bulk ${String(i).padStart(4, "0")}`, email: `b${i}@x.com` }));
    expect(await admin.addGuests(eventId, list)).toBe(1200);
    const all = await admin.loadGuests(eventId);
    expect(all.length).toBe(1200 + 3);
    expect(new Set(all.map((g) => g.id)).size).toBe(all.length); // no duplicates / gaps across pages
    expect(new Set(all.map((g) => g.qr_token)).size).toBe(all.length);
  });

  it("non-admin user: no data, no actions", async () => {
    expect(await plain.listEvents()).toEqual([]);
    expect(await plain.loadGuests(eventId)).toEqual([]);
    expect((await plain.checkIn(eventId, "anything", "entry")).result).toBe("FORBIDDEN");
    await expect(plain.addGuests(eventId, [{ full_name: "Intruder" }])).rejects.toThrow(/Event not found/);
    await expect(plain.createEvent({ name: "X", event_date: "2026-11-03", valid_from: "2026-11-03T10:00:00Z", valid_until: "2026-11-03T12:00:00Z", timezone: "UTC" })).rejects.toThrow(/row-level security/);
  });

  it("deleteGuests and deleteEvent cascade", async () => {
    const all = await admin.loadGuests(eventId);
    await admin.deleteGuests(all.slice(0, 250).map((g) => g.id)); // exercises chunked deletes
    expect((await admin.loadGuests(eventId)).length).toBe(all.length - 250);
    await admin.deleteEvent(eventId);
    expect((await admin.listEvents()).map((e) => e.id)).not.toContain(eventId);
  });
});
