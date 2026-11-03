import QRCode from "qrcode";

/**
 * The QR encodes ONLY the random token, upper-cased. Upper-case hex stays inside QR
 * "alphanumeric" mode, giving a smaller, lower-density symbol that scans faster when printed small.
 * The server lower-cases and trims before lookup, so case never matters.
 */
export const qrPayload = (token: string) => token.toUpperCase();

export function qrDataUrl(token: string, px = 900): Promise<string> {
  return QRCode.toDataURL(qrPayload(token), {
    errorCorrectionLevel: "M",
    margin: 4, // 4-module quiet zone (the QR spec minimum)
    width: px,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

const cache = new Map<string, Promise<string>>();
export function cachedQr(token: string, px = 900) {
  const k = token + px;
  let p = cache.get(k);
  if (!p) { p = qrDataUrl(token, px); cache.set(k, p); }
  return p;
}
