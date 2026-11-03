import { describe, expect, it } from "vitest";
import { WedgeDetector } from "@/lib/wedge";

const CODE = "a3f9c2d1b7e84f60a3f9c2d1b7e84f60";
function type(d: WedgeDetector, text: string, start: number, gap: number) {
  let t = start, out: { prevent: boolean; emit?: string } = { prevent: false };
  for (const ch of text) { out = d.key(ch, t); t += gap; }
  return { t, out };
}

describe("WedgeDetector (hardware keyboard-wedge scanners)", () => {
  it("emits a fast burst terminated by Enter", () => {
    const d = new WedgeDetector();
    const { t } = type(d, CODE, 1000, 8);
    expect(d.key("Enter", t)).toEqual({ prevent: true, emit: CODE });
  });
  it("handles a Tab suffix", () => {
    const d = new WedgeDetector();
    const { t } = type(d, CODE, 1000, 15);
    expect(d.key("Tab", t)).toEqual({ prevent: true, emit: CODE });
  });
  it("handles slower Bluetooth scanners (~40ms/char)", () => {
    const d = new WedgeDetector();
    const { t } = type(d, CODE, 1000, 40);
    expect(d.key("Enter", t).emit).toBe(CODE);
  });
  it("never intercepts human typing", () => {
    const d = new WedgeDetector();
    const { t, out } = type(d, CODE, 1000, 220);
    expect(out.prevent).toBe(false);
    expect(d.key("Enter", t)).toEqual({ prevent: false });
  });
  it("does not hijack a normal Enter/Tab press with nothing buffered", () => {
    const d = new WedgeDetector();
    expect(d.key("Enter", 5000)).toEqual({ prevent: false });
    expect(d.key("Tab", 5100)).toEqual({ prevent: false });
  });
  it("ignores short fast bursts (below min length)", () => {
    const d = new WedgeDetector();
    const { t } = type(d, "abc", 1000, 5);
    expect(d.key("Enter", t)).toEqual({ prevent: false });
  });
  it("supports scanners with no suffix via idle timeout", () => {
    const d = new WedgeDetector();
    const { t } = type(d, CODE, 1000, 8);
    expect(d.idle(t + 50)).toBeNull();
    expect(d.idle(t + 200)).toBe(CODE);
  });
  it("ignores modifier keys such as Shift inside a burst", () => {
    const d = new WedgeDetector();
    let t = 1000;
    for (const ch of CODE) { d.key("Shift", t); d.key(ch, t + 1); t += 8; }
    expect(d.key("Enter", t).emit).toBe(CODE);
  });
  it("two back-to-back scans emit twice (state resets)", () => {
    const d = new WedgeDetector();
    let r = type(d, CODE, 1000, 8); expect(d.key("Enter", r.t).emit).toBe(CODE);
    r = type(d, CODE.split("").reverse().join(""), r.t + 300, 8); expect(d.key("Enter", r.t).emit).toBe(CODE.split("").reverse().join(""));
  });
});
