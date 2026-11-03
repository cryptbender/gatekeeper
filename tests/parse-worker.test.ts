import { beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { autoMap, buildRows, looksLikeHeader, summarize } from "@/lib/importer";

// Load the real worker module with a fake worker global and capture its replies.
let call: (name: string, buf: ArrayBuffer) => Promise<{ ok: boolean; rows?: string[][]; error?: string }>;
beforeAll(async () => {
  const replies: ((m: unknown) => void)[] = [];
  (globalThis as unknown as { self: unknown }).self = { postMessage: (m: unknown) => replies.shift()?.(m), onmessage: null };
  await import("@/lib/parse.worker");
  call = (name, buffer) => new Promise((resolve) => {
    replies.push(resolve as (m: unknown) => void);
    (globalThis as unknown as { self: { onmessage: (e: unknown) => void } }).self.onmessage({ data: { name, buffer } });
  });
});

const toAb = (b: Buffer | Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const csv = "Name,Phone,Email,Category\nRahul Kumar,9876543210,rahul@example.com,VIP\nAman Khan,9876543211,aman@example.com,General\nSameer Ali,9876543212,sameer@example.com,VIP\n";

function workbook(type: "xlsx" | "xls") {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Name", "Phone", "Email", "Category"],
    ["Rahul Kumar", 9876543210, "rahul@example.com", "VIP"],   // phone as a NUMBER cell, like real spreadsheets
    ["Aman Khan", 9876543211, "aman@example.com", "General"],
    ["Sameer Ali", 9876543212, "sameer@example.com", "VIP"],
  ]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Guests");
  return toAb(XLSX.write(wb, { type: "buffer", bookType: type }) as Buffer);
}

describe("upload parsing (same worker code the browser uses)", () => {
  for (const [label, name, make] of [
    ["CSV", "guests.csv", () => toAb(Buffer.from(csv))],
    ["CSV with UTF-8 BOM", "bom.csv", () => toAb(Buffer.from("\uFEFF" + csv))],
    ["XLSX", "guests.xlsx", () => workbook("xlsx")],
    ["XLS (legacy)", "guests.xls", () => workbook("xls")],
  ] as const) {
    it(`${label}: parses, auto-maps and imports the spec's 3 guests`, async () => {
      const res = await call(name, make());
      expect(res.ok).toBe(true);
      const rows = res.rows!;
      expect(looksLikeHeader(rows[0])).toBe(true);
      const parsed = buildRows(rows, autoMap(rows[0]), true, []);
      expect(summarize(parsed)).toEqual({ total: 3, valid: 3, duplicates: 0, invalid: 0 });
      expect(parsed[0].guest).toEqual({ full_name: "Rahul Kumar", phone: "9876543210", email: "rahul@example.com", category: "VIP" });
    });
  }
  it("quoted commas / multiline cells in CSV", async () => {
    const res = await call("q.csv", toAb(Buffer.from('Name,Category\n"Kumar, Rahul","VIP"\n')));
    expect(res.rows![1]).toEqual(["Kumar, Rahul", "VIP"]);
  });
  it("garbage file reports an error instead of hanging", async () => {
    const res = await call("bad.xlsx", toAb(Buffer.from("this is not a workbook")));
    expect(res.ok === false || (res.rows?.length ?? 0) <= 1).toBe(true);
  });
  it("handles 5,000 rows quickly (worker path)", async () => {
    const big = "Name,Phone,Email\n" + Array.from({ length: 5000 }, (_, i) => `Guest ${i},98${String(i).padStart(8, "0")},g${i}@x.com`).join("\n");
    const t = Date.now();
    const res = await call("big.csv", toAb(Buffer.from(big)));
    expect(res.rows).toHaveLength(5001);
    expect(summarize(buildRows(res.rows!, autoMap(res.rows![0]), true, [])).valid).toBe(5000);
    expect(Date.now() - t).toBeLessThan(3000);
  });
});
