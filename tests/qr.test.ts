import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { qrDataUrl, qrPayload } from "@/lib/qr";
import { randomHex } from "@/lib/utils";

function decode(dataUrl: string, scaleDown = 1) {
  const png = PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
  let { width, height, data } = png;
  if (scaleDown > 1) { // crude nearest-neighbour downscale to simulate a small print / low-res camera frame
    const w = Math.floor(width / scaleDown), h = Math.floor(height / scaleDown), out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) out[(y * w + x) * 4 + c] = data[((y * scaleDown) * width + x * scaleDown) * 4 + c];
    return jsQR(out, w, h)?.data;
  }
  return jsQR(new Uint8ClampedArray(data), width, height)?.data;
}

describe("QR generation", () => {
  it("round-trips the token (upper-cased payload) at print resolution", { timeout: 60000 }, async () => {
    for (let i = 0; i < 25; i++) {
      const token = randomHex(16);
      expect(decode(await qrDataUrl(token, 900))).toBe(qrPayload(token));
    }
  });
  it("remains decodable when shrunk ~6x (small wristband / low-res frame)", async () => {
    const token = randomHex(16);
    expect(decode(await qrDataUrl(token, 700), 6)).toBe(qrPayload(token));
  });
  it("payload is only the token — no names, ids or URLs", () => {
    expect(qrPayload("a3f9c2d1b7e84f60a3f9c2d1b7e84f60")).toMatch(/^[0-9A-F]{32}$/);
  });
});
