import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { buildWristbandPdf, type Layout } from "@/lib/pdf";
import { qrPayload } from "@/lib/qr";
import { randomHex } from "@/lib/utils";
import type { EventRow, GuestRow } from "@/lib/types";

const event: EventRow = { id: "e", name: "Annual Gala 2026", description: null, venue: "Grand Ballroom", event_date: "2026-11-02",
  valid_from: "2026-11-02T11:30:00Z", valid_until: "2026-11-02T20:30:00Z", timezone: "Asia/Kolkata", created_at: "" };
const guests: GuestRow[] = Array.from({ length: 10 }, (_, i) => ({ id: "g" + i, event_id: "e", full_name: i === 0 ? "Rahul Kumar-With-A-Rather-Long-Surname Chaudhary" : `Guest Number ${i}`,
  phone: null, email: null, category: i % 2 ? "General" : "VIP", created_at: "", ticket_id: "t" + i, qr_token: randomHex(16), ticket_status: "active", checked_in_at: null, lunch_at: null, dinner_at: null }));

const havePdftoppm = (() => { try { execFileSync("pdftoppm", ["-v"], { stdio: "ignore" }); return true; } catch { return false; } })();

describe("wristband PDF", () => {
  for (const layout of ["strip", "card"] as Layout[]) {
    it.skipIf(!havePdftoppm)(`${layout}: 2 A4 pages and every printed QR decodes at 150 DPI`, async () => {
      const blob = await buildWristbandPdf({ layout, event, guests });
      const dir = mkdtempSync(path.join(tmpdir(), "pdf-"));
      const file = path.join(dir, "out.pdf");
      writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
      expect(readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-");
      execFileSync("pdftoppm", ["-r", "150", "-png", file, path.join(dir, "p")]);
      const pages = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
      expect(pages).toHaveLength(2); // 10 guests, 8 per sheet
      const found = new Set<string>();
      for (const [pi, pg] of pages.entries()) {
        const png = PNG.sync.read(readFileSync(path.join(dir, pg)));
        // decode each slot region separately so several QRs per page can be read
        const slots = layout === "strip" ? Array.from({ length: 8 }, (_, s) => ({ x: 10, y: 12 + s * 34, w: 40, h: 30 }))
          : Array.from({ length: 8 }, (_, s) => ({ x: 10 + (s % 2) * 100, y: 14 + Math.floor(s / 2) * 66, w: 46, h: 44 }));
        for (const sl of slots.slice(0, pi === 0 ? 8 : 2)) {
          const px = (v: number) => Math.round((v / 25.4) * 150);
          const w = px(sl.w), h = px(sl.h), out = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++)
            out[(y * w + x) * 4 + c] = png.data[((px(sl.y) + y) * png.width + px(sl.x) + x) * 4 + c];
          const r = jsQR(out, w, h);
          if (r) found.add(r.data);
        }
      }
      for (const g of guests) expect(found.has(qrPayload(g.qr_token)), `QR for ${g.full_name} not decodable from PDF`).toBe(true);
    }, 60000);
  }
  it("builds without error and is non-trivial in size", async () => {
    const blob = await buildWristbandPdf({ layout: "strip", event, guests });
    expect(blob.size).toBeGreaterThan(20000);
  });
});
