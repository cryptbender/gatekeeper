import { describe, expect, it } from "vitest";
import { eventPhase, utcToZonedParts, zonedToUtcIso } from "@/lib/time";

describe("timezone conversion", () => {
  it("converts Asia/Kolkata wall time to UTC (+05:30, no DST)", () => {
    expect(zonedToUtcIso("2026-11-02", "17:00", "Asia/Kolkata")).toBe("2026-11-02T11:30:00.000Z");
  });
  it("supports a window that passes midnight", () => {
    const from = zonedToUtcIso("2026-11-02", "17:00", "Asia/Kolkata");
    const until = zonedToUtcIso("2026-11-03", "02:00", "Asia/Kolkata");
    expect(new Date(until).getTime() - new Date(from).getTime()).toBe(9 * 3600_000);
  });
  it("handles US DST (EST in November, EDT in July)", () => {
    expect(zonedToUtcIso("2026-11-02", "17:00", "America/New_York")).toBe("2026-11-02T22:00:00.000Z");
    expect(zonedToUtcIso("2026-07-02", "17:00", "America/New_York")).toBe("2026-07-02T21:00:00.000Z");
  });
  it("round-trips UTC -> zoned parts", () => {
    expect(utcToZonedParts("2026-11-02T11:30:00.000Z", "Asia/Kolkata")).toEqual({ date: "2026-11-02", time: "17:00" });
    expect(utcToZonedParts("2026-11-03T02:00:00.000Z", "Asia/Tokyo")).toEqual({ date: "2026-11-03", time: "11:00" });
  });
  it("reports phase before / open / closed", () => {
    const f = "2026-11-02T12:00:00Z", u = "2026-11-02T20:00:00Z";
    expect(eventPhase(f, u, Date.parse("2026-11-02T11:59:59Z"))).toBe("before");
    expect(eventPhase(f, u, Date.parse("2026-11-02T15:00:00Z"))).toBe("open");
    expect(eventPhase(f, u, Date.parse("2026-11-02T20:00:01Z"))).toBe("closed");
  });
});
