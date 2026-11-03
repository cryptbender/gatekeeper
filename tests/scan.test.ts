import { describe, expect, it } from "vitest";
import { evaluateScan, normalizeToken, type ScanTicket } from "@/lib/scan";

const ev = { valid_from: "2026-11-02T12:00:00Z", valid_until: "2026-11-02T20:00:00Z" };
const T = (o: Partial<ScanTicket> = {}): ScanTicket => ({ id: "t1", status: "active", guest_name: "Rahul Kumar", category: "VIP", checked_in_at: null, ...o });
const at = (iso: string) => Date.parse(iso);

describe("evaluateScan", () => {
  it("A: first valid scan -> SUCCESS with entry time", () => {
    const r = evaluateScan(T(), ev, at("2026-11-02T13:00:00Z"));
    expect(r.result).toBe("SUCCESS");
    expect(r.guest_name).toBe("Rahul Kumar");
    expect(r.entered_at).toBe("2026-11-02T13:00:00.000Z");
  });
  it("B: already entered -> ALREADY_IN with previous time", () => {
    const r = evaluateScan(T({ checked_in_at: "2026-11-02T13:00:00.000Z" }), ev, at("2026-11-02T14:00:00Z"));
    expect(r).toMatchObject({ result: "ALREADY_IN", entered_at: "2026-11-02T13:00:00.000Z" });
  });
  it("C: unknown token -> INVALID", () => expect(evaluateScan(undefined, ev, at("2026-11-02T13:00:00Z")).result).toBe("INVALID"));
  it("D: after validity -> EXPIRED", () => expect(evaluateScan(T(), ev, at("2026-11-02T20:00:01Z")).result).toBe("EXPIRED"));
  it("E: before validity -> NOT_YET_OPEN", () => expect(evaluateScan(T(), ev, at("2026-11-02T11:59:59Z")).result).toBe("NOT_YET_OPEN"));
  it("ENTERED is permanent: after expiry a past entrant still gets ALREADY_IN, not EXPIRED", () => {
    const r = evaluateScan(T({ checked_in_at: "2026-11-02T13:00:00.000Z" }), ev, at("2026-11-03T09:00:00Z"));
    expect(r.result).toBe("ALREADY_IN");
  });
  it("revoked ticket is rejected before entry", () => expect(evaluateScan(T({ status: "revoked" }), ev, at("2026-11-02T13:00:00Z")).result).toBe("REVOKED"));
  it("boundaries are inclusive", () => {
    expect(evaluateScan(T(), ev, at("2026-11-02T12:00:00Z")).result).toBe("SUCCESS");
    expect(evaluateScan(T(), ev, at("2026-11-02T20:00:00Z")).result).toBe("SUCCESS");
  });
});

describe("normalizeToken", () => {
  it("strips scanner suffixes and case", () => expect(normalizeToken(" ABCDEF0123\r\n")).toBe("abcdef0123"));
});
