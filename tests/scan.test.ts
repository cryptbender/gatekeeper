import { describe, expect, it } from "vitest";
import { evaluateScan, normalizeToken, type ScanTicket } from "@/lib/scan";

const ev = { valid_from: "2026-11-02T12:00:00Z", valid_until: "2026-11-02T20:00:00Z" };
const T = (o: Partial<ScanTicket> = {}): ScanTicket => ({ id: "t1", status: "active", guest_name: "Rahul Kumar", category: "VIP", done: {}, ...o });
const at = (iso: string) => Date.parse(iso);
const IN = "2026-11-02T13:00:00.000Z";

describe("evaluateScan — entry", () => {
  it("A: first valid scan -> SUCCESS with entry time", () => {
    const r = evaluateScan(T(), ev, at("2026-11-02T13:00:00Z"));
    expect(r).toMatchObject({ result: "SUCCESS", service: "entry", guest_name: "Rahul Kumar", entered_at: IN });
  });
  it("B: already entered -> ALREADY_IN with previous time", () => {
    expect(evaluateScan(T({ done: { entry: IN } }), ev, at("2026-11-02T14:00:00Z"))).toMatchObject({ result: "ALREADY_IN", entered_at: IN });
  });
  it("C: unknown token -> INVALID", () => expect(evaluateScan(undefined, ev, at("2026-11-02T13:00:00Z")).result).toBe("INVALID"));
  it("D: after validity -> EXPIRED", () => expect(evaluateScan(T(), ev, at("2026-11-02T20:00:01Z")).result).toBe("EXPIRED"));
  it("E: before validity -> NOT_YET_OPEN", () => expect(evaluateScan(T(), ev, at("2026-11-02T11:59:59Z")).result).toBe("NOT_YET_OPEN"));
  it("ENTERED is permanent: after expiry a past entrant still gets ALREADY_IN", () => {
    expect(evaluateScan(T({ done: { entry: IN } }), ev, at("2026-11-03T09:00:00Z")).result).toBe("ALREADY_IN");
  });
  it("revoked ticket is rejected before entry", () => expect(evaluateScan(T({ status: "revoked" }), ev, at("2026-11-02T13:00:00Z")).result).toBe("REVOKED"));
  it("boundaries are inclusive", () => {
    expect(evaluateScan(T(), ev, at("2026-11-02T12:00:00Z")).result).toBe("SUCCESS");
    expect(evaluateScan(T(), ev, at("2026-11-02T20:00:00Z")).result).toBe("SUCCESS");
  });
});

describe("evaluateScan — lunch & dinner", () => {
  const inside = T({ done: { entry: IN } });
  it("lunch before entering -> NOT_ENTERED (and names the guest)", () => {
    expect(evaluateScan(T(), ev, at("2026-11-02T14:00:00Z"), "lunch")).toMatchObject({ result: "NOT_ENTERED", guest_name: "Rahul Kumar", service: "lunch" });
  });
  it("lunch after entering -> SUCCESS", () => expect(evaluateScan(inside, ev, at("2026-11-02T14:00:00Z"), "lunch")).toMatchObject({ result: "SUCCESS", service: "lunch" }));
  it("second lunch -> ALREADY_IN with the lunch time, not the entry time", () => {
    const LUNCH = "2026-11-02T14:00:00.000Z";
    expect(evaluateScan(T({ done: { entry: IN, lunch: LUNCH } }), ev, at("2026-11-02T15:00:00Z"), "lunch")).toMatchObject({ result: "ALREADY_IN", entered_at: LUNCH });
  });
  it("lunch and dinner are independent", () => {
    const t = T({ done: { entry: IN, lunch: "2026-11-02T14:00:00.000Z" } });
    expect(evaluateScan(t, ev, at("2026-11-02T18:00:00Z"), "dinner").result).toBe("SUCCESS");
  });
  it("meals are NOT blocked by the entry window closing", () => {
    expect(evaluateScan(inside, ev, at("2026-11-03T01:00:00Z"), "dinner").result).toBe("SUCCESS");
  });
  it("revoked guest cannot take a meal; an unknown token is INVALID", () => {
    expect(evaluateScan(T({ status: "revoked", done: { entry: IN } }), ev, at("2026-11-02T14:00:00Z"), "lunch").result).toBe("REVOKED");
    expect(evaluateScan(undefined, ev, at("2026-11-02T14:00:00Z"), "lunch")).toMatchObject({ result: "INVALID", service: "lunch" });
  });
});

describe("normalizeToken", () => {
  it("strips scanner suffixes, inner whitespace and case", () => expect(normalizeToken(" ABCD EF0123\r\n\t")).toBe("abcdef0123"));
});
