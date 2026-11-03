import { describe, expect, it } from "vitest";
import { autoMap, buildRows, cleanPhone, looksLikeHeader, summarize } from "@/lib/importer";

const sample = [
  ["Name", "Phone", "Email", "Category"],
  ["Rahul Kumar", "9876543210", "rahul@example.com", "VIP"],
  ["Aman Khan", "9876543211", "aman@example.com", "General"],
  ["Sameer Ali", "9876543212", "sameer@example.com", "VIP"],
];

describe("importer", () => {
  it("auto-maps the spec's example columns", () => {
    expect(autoMap(sample[0])).toEqual({ full_name: 0, phone: 1, email: 2, category: 3 });
  });
  it("auto-maps common header variants", () => {
    expect(autoMap(["Guest Name", "Mobile Number", "E-mail", "Ticket Type"])).toEqual({ full_name: 0, phone: 1, email: 2, category: 3 });
  });
  it("detects header vs headerless data", () => {
    expect(looksLikeHeader(sample[0])).toBe(true);
    expect(looksLikeHeader(sample[1])).toBe(false);
  });
  it("imports all 3 valid sample rows", () => {
    const rows = buildRows(sample, autoMap(sample[0]), true, []);
    expect(summarize(rows)).toEqual({ total: 3, valid: 3, duplicates: 0, invalid: 0 });
  });
  it("flags missing name, bad email, in-file duplicates and existing duplicates", () => {
    const data = [...sample,
      ["", "1111111111", "", "VIP"],
      ["Bad Mail", "", "not-an-email", ""],
      ["Rahul K", "98765 43210", "", ""],            // same phone as Rahul
      ["Aman Again", "", "AMAN@example.com", ""],    // same email, different case
      ["Existing Person", "5550001111", "", ""],
      ["", "", "", ""],                                // blank line ignored
    ];
    const rows = buildRows(data, autoMap(data[0]), true, [{ full_name: "Existing Person", phone: "5550001111" }]);
    expect(rows.map((r) => r.issue)).toEqual([null, null, null, "missing_name", "bad_email", "duplicate_in_file", "duplicate_in_file", "duplicate_existing"]);
    expect(summarize(rows)).toEqual({ total: 8, valid: 3, duplicates: 3, invalid: 2 });
  });
  it("repairs spreadsheet-mangled phone numbers", () => {
    expect(cleanPhone("9.876543210e9")).toBe("9876543210");
    expect(cleanPhone("9876543210.0")).toBe("9876543210");
  });
});
