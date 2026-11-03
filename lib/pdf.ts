import { jsPDF } from "jspdf";
import type { EventRow, GuestRow } from "./types";
import { cachedQr } from "./qr";
import { fmtDateTime } from "./time";
import { shortTicketId } from "./utils";

export type Layout = "strip" | "card";

export const LAYOUTS: Record<Layout, { label: string; hint: string; perPage: number }> = {
  strip: { label: "Wristband strips", hint: "190 × 30 mm · 8 per A4 sheet", perPage: 8 },
  card: { label: "Ticket cards", hint: "90 × 62 mm · 8 per A4 sheet", perPage: 8 },
};

const isLatin1 = (s: string) => /^[\u0020-\u00FF]*$/.test(s);

/** jsPDF's built-in fonts are Latin-1 only; render other scripts through canvas so names never turn into boxes. */
function textImage(text: string, px: number, bold: boolean) {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = `${bold ? "700" : "500"} ${px}px system-ui, "Noto Sans", "Segoe UI", sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 4;
  const h = Math.ceil(px * 1.35);
  c.width = w; c.height = h;
  const g2 = c.getContext("2d")!;
  g2.font = font; g2.fillStyle = "#000"; g2.textBaseline = "middle";
  g2.fillText(text, 2, h / 2);
  return { url: c.toDataURL("image/png"), ratio: w / h };
}

function putText(doc: jsPDF, text: string, x: number, y: number, o: { size: number; bold?: boolean; maxW: number; color?: number }) {
  const gray = o.color ?? 0;
  doc.setTextColor(gray, gray, gray);
  if (isLatin1(text)) {
    doc.setFont("helvetica", o.bold ? "bold" : "normal");
    doc.setFontSize(o.size);
    let t = text;
    while (doc.getTextWidth(t) > o.maxW && t.length > 1) t = t.slice(0, -1);
    if (t !== text) t = t.slice(0, -1) + "…";
    doc.text(t, x, y, { baseline: "alphabetic" });
  } else {
    const hMm = o.size * 0.3528 * 1.25;
    const img = textImage(text, 64, !!o.bold);
    let w = hMm * img.ratio, h = hMm;
    if (w > o.maxW) { h = (o.maxW / w) * h; w = o.maxW; }
    doc.addImage(img.url, "PNG", x, y - h * 0.78, w, h);
  }
}

export async function buildWristbandPdf(opts: {
  layout: Layout; event: EventRow; guests: GuestRow[]; onProgress?: (done: number, total: number) => void;
}): Promise<Blob> {
  const { layout, event, guests } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.setProperties({ title: `${event.name} — QR ${layout === "strip" ? "wristbands" : "tickets"}` });
  const per = LAYOUTS[layout].perPage;

  for (let i = 0; i < guests.length; i++) {
    const g = guests[i];
    const slot = i % per;
    if (i > 0 && slot === 0) doc.addPage();
    const qr = await cachedQr(g.qr_token, 700);

    if (layout === "strip") {
      const x = 10, y = 12 + slot * 34, w = 190, h = 30, q = 26;
      doc.setDrawColor(170); doc.setLineWidth(0.2); doc.setLineDashPattern([1.2, 1.2], 0);
      doc.roundedRect(x, y, w, h, 2, 2);
      doc.setLineDashPattern([], 0);
      doc.setFillColor(255, 255, 255);
      doc.rect(x + 2, y + 2, q, q, "F"); // white quiet zone is baked into the QR image
      doc.addImage(qr, "PNG", x + 2, y + 2, q, q);
      const tx = x + q + 8;
      const tw = w - q - 14;
      putText(doc, event.name.toUpperCase(), tx, y + 8, { size: 7.5, bold: true, maxW: tw, color: 110 });
      putText(doc, g.full_name, tx, y + 17.5, { size: 17, bold: true, maxW: tw });
      putText(doc, `${g.category ?? "General"}   ·   ID ${shortTicketId(g.qr_token)}`, tx, y + 25, { size: 9, maxW: tw, color: 70 });
      // sticky tab at the right end
      doc.setDrawColor(200); doc.setLineWidth(0.15);
      doc.line(x + w - 10, y + 1, x + w - 10, y + h - 1);
    } else {
      const col = slot % 2, row = Math.floor(slot / 2);
      const w = 90, h = 62, x = 10 + col * (w + 10), y = 14 + row * (h + 4);
      doc.setDrawColor(170); doc.setLineWidth(0.2); doc.setLineDashPattern([1.2, 1.2], 0);
      doc.roundedRect(x, y, w, h, 2.5, 2.5);
      doc.setLineDashPattern([], 0);
      const q = 36;
      doc.addImage(qr, "PNG", x + 3, y + 3, q, q);
      putText(doc, event.name.toUpperCase(), x + q + 7, y + 9, { size: 7, bold: true, maxW: w - q - 11, color: 110 });
      putText(doc, g.category ?? "General", x + q + 7, y + 16, { size: 10, bold: true, maxW: w - q - 11, color: 40 });
      putText(doc, `ID ${shortTicketId(g.qr_token)}`, x + q + 7, y + 22, { size: 8, maxW: w - q - 11, color: 90 });
      putText(doc, g.full_name, x + 5, y + 47, { size: 15, bold: true, maxW: w - 10 });
      putText(doc, [event.venue, fmtDateTime(event.valid_from, event.timezone)].filter(Boolean).join("  ·  "), x + 5, y + 55, { size: 7.5, maxW: w - 10, color: 110 });
    }
    if (i % 10 === 0) { opts.onProgress?.(i + 1, guests.length); await new Promise((r) => setTimeout(r, 0)); }
  }
  opts.onProgress?.(guests.length, guests.length);
  return doc.output("blob");
}
