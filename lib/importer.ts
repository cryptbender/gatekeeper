import type { GuestInput } from "./types";

export type Field = "full_name" | "phone" | "email" | "category";
export type Mapping = Record<Field, number | -1>;

export const FIELD_LABELS: Record<Field, string> = {
  full_name: "Full name",
  phone: "Phone",
  email: "Email",
  category: "Category",
};

const ALIASES: Record<Field, string[]> = {
  full_name: ["name", "fullname", "guest", "guestname", "fullnameofguest", "attendee", "person"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "contact", "contactnumber", "tel", "telephone", "whatsapp"],
  email: ["email", "emailaddress", "mail", "emailid"],
  category: ["category", "type", "tier", "group", "class", "guesttype", "ticket", "tickettype"],
};

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function autoMap(headers: string[]): Mapping {
  const map: Mapping = { full_name: -1, phone: -1, email: -1, category: -1 };
  const used = new Set<number>();
  (Object.keys(ALIASES) as Field[]).forEach((f) => {
    const idx = headers.findIndex((h, i) => !used.has(i) && ALIASES[f].includes(norm(h)));
    if (idx >= 0) { map[f] = idx; used.add(idx); }
  });
  // Fallback: contains-match (e.g. "Guest Full Name")
  (Object.keys(ALIASES) as Field[]).forEach((f) => {
    if (map[f] !== -1) return;
    const idx = headers.findIndex((h, i) => !used.has(i) && ALIASES[f].some((a) => norm(h).includes(a) && a.length > 3));
    if (idx >= 0) { map[f] = idx; used.add(idx); }
  });
  return map;
}

/** Heuristic: first row looks like headers if no cell looks like an email/phone number. */
export function looksLikeHeader(row: unknown[]): boolean {
  return row.every((c) => {
    const s = String(c ?? "").trim();
    return !/@/.test(s) && !/^\+?[\d\s()-]{7,}$/.test(s);
  });
}

export type RowIssue = "missing_name" | "bad_email" | "duplicate_in_file" | "duplicate_existing";

export interface ParsedRow {
  line: number; // 1-based line in the source (header = line 1)
  guest: GuestInput;
  issue: RowIssue | null;
}

export const ISSUE_LABEL: Record<RowIssue, string> = {
  missing_name: "Missing name",
  bad_email: "Invalid email",
  duplicate_in_file: "Duplicate in file",
  duplicate_existing: "Already on guest list",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (s: string) => EMAIL_RE.test(s);

export function cleanPhone(s: string): string {
  const t = s.trim();
  // Spreadsheet number cells may arrive as 9.8765432e9 — expand if so.
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(t)) return String(Math.round(Number(t)));
  return t.replace(/\.0+$/, "");
}

export const dupKey = (g: GuestInput): string[] => {
  const keys: string[] = [];
  const email = (g.email ?? "").trim().toLowerCase();
  const phone = (g.phone ?? "").replace(/\D/g, "");
  if (email) keys.push("e:" + email);
  if (phone.length >= 6) keys.push("p:" + phone);
  if (!email && phone.length < 6) keys.push("n:" + (g.full_name ?? "").trim().toLowerCase().replace(/\s+/g, " "));
  return keys;
};

export function buildRows(
  data: unknown[][],
  mapping: Mapping,
  hasHeader: boolean,
  existing: GuestInput[]
): ParsedRow[] {
  const seen = new Set<string>();
  const existingKeys = new Set<string>();
  existing.forEach((g) => dupKey(g).forEach((k) => existingKeys.add(k)));

  const out: ParsedRow[] = [];
  const start = hasHeader ? 1 : 0;
  for (let i = start; i < data.length; i++) {
    const r = data[i];
    if (!r || r.every((c) => String(c ?? "").trim() === "")) continue; // skip blank lines
    const get = (f: Field) => (mapping[f] >= 0 ? String(r[mapping[f]] ?? "").trim() : "");
    const guest: GuestInput = {
      full_name: get("full_name").replace(/\s+/g, " "),
      phone: get("phone") ? cleanPhone(get("phone")) : null,
      email: get("email") || null,
      category: get("category") || null,
    };
    let issue: RowIssue | null = null;
    if (!guest.full_name) issue = "missing_name";
    else if (guest.email && !isEmail(guest.email)) issue = "bad_email";
    else {
      const keys = dupKey(guest);
      if (keys.some((k) => existingKeys.has(k))) issue = "duplicate_existing";
      else if (keys.some((k) => seen.has(k))) issue = "duplicate_in_file";
      else keys.forEach((k) => seen.add(k));
    }
    out.push({ line: i + 1, guest, issue });
  }
  return out;
}

export function summarize(rows: ParsedRow[]) {
  const s = { total: rows.length, valid: 0, duplicates: 0, invalid: 0 };
  for (const r of rows) {
    if (!r.issue) s.valid++;
    else if (r.issue === "duplicate_in_file" || r.issue === "duplicate_existing") s.duplicates++;
    else s.invalid++;
  }
  return s;
}
