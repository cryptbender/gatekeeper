import { describe, expect, it } from "vitest";
import { cleanUrl } from "@/lib/supabase";

describe("cleanUrl — the cause of 'Invalid path specified in request URL'", () => {
  it("keeps only the origin when extra path was pasted", () => {
    expect(cleanUrl("https://abcd1234.supabase.co/rest/v1/")).toBe("https://abcd1234.supabase.co");
    expect(cleanUrl("https://abcd1234.supabase.co/auth/v1")).toBe("https://abcd1234.supabase.co");
    expect(cleanUrl("https://abcd1234.supabase.co/")).toBe("https://abcd1234.supabase.co");
  });
  it("strips whitespace and quotes copied along with the value", () => {
    expect(cleanUrl('  "https://abcd1234.supabase.co"  ')).toBe("https://abcd1234.supabase.co");
    expect(cleanUrl("'https://abcd1234.supabase.co/'")).toBe("https://abcd1234.supabase.co");
  });
  it("returns undefined for empty or malformed values (app falls back to local mode)", () => {
    expect(cleanUrl(undefined)).toBeUndefined();
    expect(cleanUrl("")).toBeUndefined();
    expect(cleanUrl("abcd1234.supabase.co")).toBeUndefined(); // missing https://
  });
});
