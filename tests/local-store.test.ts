import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;

import { localStore as s } from "@/lib/data/local-store";
import { qrPayload } from "@/lib/qr";

async function setup(from: string, until: string) {
  const ev = await s.createEvent({ name: "Gala", event_date: "2026-11-02", valid_from: from, valid_until: until, timezone: "UTC" });
  await s.addGuests(ev.id, [{ full_name: "Rahul Kumar", category: "VIP" }, { full_name: "Aman Khan" }]);
  const guests = await s.loadGuests(ev.id);
  return { ev, guests };
}

beforeEach(() => { mem.clear(); vi.useRealTimers(); });

describe("check-in (local store; same decision logic as SQL check_in)", () => {
  it("first scan SUCCESS, second ALREADY_IN with the original timestamp; persists across reloads", async () => {
    const { ev, guests } = await setup(new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 3600e3).toISOString());
    const a = await s.checkIn(ev.id, guests[0].qr_token);
    expect(a.result).toBe("SUCCESS");
    const b = await s.checkIn(ev.id, guests[0].qr_token);
    expect(b.result).toBe("ALREADY_IN");
    expect(b.entered_at).toBe(a.entered_at);
    const reloaded = await s.loadGuests(ev.id); // "browser refresh"
    expect(reloaded.find((g) => g.id === guests[0].id)!.checked_in_at).toBe(a.entered_at);
    expect(reloaded.find((g) => g.id === guests[1].id)!.checked_in_at).toBeNull();
  });

  it("20 simultaneous scans of one ticket -> exactly one SUCCESS", async () => {
    const { ev, guests } = await setup(new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 3600e3).toISOString());
    const res = await Promise.all(Array.from({ length: 20 }, () => s.checkIn(ev.id, guests[0].qr_token)));
    expect(res.filter((r) => r.result === "SUCCESS")).toHaveLength(1);
    expect(res.filter((r) => r.result === "ALREADY_IN")).toHaveLength(19);
  });

  it("accepts the upper-case QR payload and scanner whitespace", async () => {
    const { ev, guests } = await setup(new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 3600e3).toISOString());
    expect((await s.checkIn(ev.id, qrPayload(guests[0].qr_token) + "\r\n")).result).toBe("SUCCESS");
  });

  it("unknown token -> INVALID; token from another event -> INVALID", async () => {
    const a = await setup(new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 3600e3).toISOString());
    const b = await setup(new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 3600e3).toISOString());
    expect((await s.checkIn(a.ev.id, "deadbeef")).result).toBe("INVALID");
    expect((await s.checkIn(a.ev.id, b.guests[0].qr_token)).result).toBe("INVALID");
  });

  it("before validity -> NOT_YET_OPEN; after -> EXPIRED; neither records an entry", async () => {
    const early = await setup(new Date(Date.now() + 3600e3).toISOString(), new Date(Date.now() + 7200e3).toISOString());
    expect((await s.checkIn(early.ev.id, early.guests[0].qr_token)).result).toBe("NOT_YET_OPEN");
    const late = await setup(new Date(Date.now() - 7200e3).toISOString(), new Date(Date.now() - 3600e3).toISOString());
    expect((await s.checkIn(late.ev.id, late.guests[0].qr_token)).result).toBe("EXPIRED");
    expect((await s.loadGuests(late.ev.id)).every((g) => g.checked_in_at === null)).toBe(true);
  });

  it("entry stays ENTERED after validity expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T13:00:00Z"));
    const { ev, guests } = await setup("2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z");
    expect((await s.checkIn(ev.id, guests[0].qr_token)).result).toBe("SUCCESS");
    vi.setSystemTime(new Date("2026-11-03T08:00:00Z"));
    expect((await s.checkIn(ev.id, guests[0].qr_token)).result).toBe("ALREADY_IN");
    expect((await s.checkIn(ev.id, guests[1].qr_token)).result).toBe("EXPIRED");
  });

  it("revoked ticket rejected; restoring works; regenerate invalidates the old QR", async () => {
    const { ev, guests } = await setup(new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 3600e3).toISOString());
    await s.setTicketStatus(guests[0].ticket_id, "revoked");
    expect((await s.checkIn(ev.id, guests[0].qr_token)).result).toBe("REVOKED");
    await s.setTicketStatus(guests[0].ticket_id, "active");
    const fresh = await s.regenerateTicket(guests[0].ticket_id);
    expect((await s.checkIn(ev.id, guests[0].qr_token)).result).toBe("INVALID");
    expect((await s.checkIn(ev.id, fresh)).result).toBe("SUCCESS");
    await expect(s.regenerateTicket(guests[0].ticket_id)).rejects.toThrow(/already entered/);
  });

  it("validity edits keep check-ins; edits are blocked once entry has opened", async () => {
    const future = await setup(new Date(Date.now() + 3600e3).toISOString(), new Date(Date.now() + 7200e3).toISOString());
    await s.updateEvent(future.ev.id, { valid_until: new Date(Date.now() + 9000e3).toISOString() });
    const open = await setup(new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 3600e3).toISOString());
    await s.checkIn(open.ev.id, open.guests[0].qr_token);
    await expect(s.updateEvent(open.ev.id, { valid_until: new Date(Date.now() + 9000e3).toISOString() })).rejects.toThrow(/cannot be changed/);
    expect((await s.loadGuests(open.ev.id)).find((g) => g.id === open.guests[0].id)!.checked_in_at).not.toBeNull();
  });

  it("rejects an end time that is not after the start", async () => {
    await expect(s.createEvent({ name: "X", event_date: "2026-11-02", valid_from: "2026-11-02T10:00:00Z", valid_until: "2026-11-02T10:00:00Z", timezone: "UTC" })).rejects.toThrow();
  });

  it("generates unique, high-entropy tokens containing no personal data", async () => {
    const ev = await s.createEvent({ name: "Big", event_date: "2026-11-02", valid_from: "2026-11-02T10:00:00Z", valid_until: "2026-11-02T20:00:00Z", timezone: "UTC" });
    await s.addGuests(ev.id, Array.from({ length: 500 }, (_, i) => ({ full_name: `Guest ${i}`, email: `g${i}@x.com` })));
    const g = await s.loadGuests(ev.id);
    expect(new Set(g.map((x) => x.qr_token)).size).toBe(500);
    for (const x of g) { expect(x.qr_token).toMatch(/^[0-9a-f]{32}$/); expect(x.qr_token).not.toContain(x.id.slice(0, 8)); }
  });
});

describe("services on one QR (local store mirrors SQL check_in)", () => {
  const open = () => setup(new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 3600e3).toISOString());

  it("lunch/dinner require entry first, then each works exactly once and shows in the guest row", async () => {
    const { ev, guests } = await open();
    const t = guests[0].qr_token;
    expect((await s.checkIn(ev.id, t, "lunch")).result).toBe("NOT_ENTERED");
    expect((await s.checkIn(ev.id, t, "entry")).result).toBe("SUCCESS");
    expect((await s.checkIn(ev.id, t, "lunch")).result).toBe("SUCCESS");
    expect((await s.checkIn(ev.id, t, "lunch")).result).toBe("ALREADY_IN");
    expect((await s.checkIn(ev.id, t, "dinner")).result).toBe("SUCCESS");
    expect((await s.checkIn(ev.id, t, "dinner")).result).toBe("ALREADY_IN");
    const g = (await s.loadGuests(ev.id)).find((x) => x.id === guests[0].id)!;
    expect(g.checked_in_at && g.lunch_at && g.dinner_at).toBeTruthy();
    const other = (await s.loadGuests(ev.id)).find((x) => x.id === guests[1].id)!;
    expect([other.checked_in_at, other.lunch_at, other.dinner_at]).toEqual([null, null, null]);
  });

  it("20 simultaneous lunch scans -> exactly one SUCCESS", async () => {
    const { ev, guests } = await open();
    await s.checkIn(ev.id, guests[0].qr_token, "entry");
    const res = await Promise.all(Array.from({ length: 20 }, () => s.checkIn(ev.id, guests[0].qr_token, "lunch")));
    expect(res.filter((r) => r.result === "SUCCESS")).toHaveLength(1);
  });

  it("admin undo: lunch can be undone and re-taken; entry cannot be undone while meals exist", async () => {
    const { ev, guests } = await open();
    const g = guests[0];
    await s.checkIn(ev.id, g.qr_token, "entry"); await s.checkIn(ev.id, g.qr_token, "lunch");
    await expect(s.undoCheckin(g.ticket_id, "entry")).rejects.toThrow(/Undo lunch and dinner first/);
    await s.undoCheckin(g.ticket_id, "lunch");
    expect((await s.checkIn(ev.id, g.qr_token, "lunch")).result).toBe("SUCCESS");
  });

  it("entries recorded by the previous version (no service field) still count as ENTRY", async () => {
    const { ev, guests } = await open();
    const db = JSON.parse(mem.get("eqr.local.v1")!);
    db.checkins.push({ id: "old", ticket_id: guests[0].ticket_id, guest_id: guests[0].id, event_id: ev.id, checked_in_at: new Date().toISOString() });
    mem.set("eqr.local.v1", JSON.stringify(db));
    expect((await s.checkIn(ev.id, guests[0].qr_token, "entry")).result).toBe("ALREADY_IN");
    expect((await s.checkIn(ev.id, guests[0].qr_token, "lunch")).result).toBe("SUCCESS");
  });
});
