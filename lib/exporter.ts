import Papa from "papaparse";
import { entryStatus, type GuestRow } from "./types";
import { fmtDateTime } from "./time";

function rows(guests: GuestRow[], tz: string) {
  return guests.map((g) => ({
    Name: g.full_name,
    Phone: g.phone ?? "",
    Email: g.email ?? "",
    Category: g.category ?? "",
    "Ticket ID": g.qr_token.slice(0, 8).toUpperCase(),
    Status: entryStatus(g).replace("_", " "),
    "Entry Time": g.checked_in_at ? fmtDateTime(g.checked_in_at, tz) : "",
  }));
}

// Spreadsheet apps execute cells that start with = + - @ ; neutralise them on export.
const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? "'" + v : v);
const sanitize = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safe(String(v))]));

export function guestsToCsvBlob(guests: GuestRow[], tz: string): Blob {
  const csv = Papa.unparse(rows(guests, tz).map(sanitize));
  return new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
}

export async function guestsToXlsxBlob(guests: GuestRow[], tz: string): Promise<Blob> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows(guests, tz).map(sanitize));
  ws["!cols"] = [{ wch: 26 }, { wch: 16 }, { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Guests");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
