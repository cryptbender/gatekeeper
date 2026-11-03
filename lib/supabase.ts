import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Pasting the wrong thing into NEXT_PUBLIC_SUPABASE_URL is the most common deployment mistake
 * (e.g. ".../rest/v1/" or a dashboard link) and shows up as "Invalid path specified in request URL".
 * Only the origin matters, so keep just that and strip stray quotes/whitespace from both values.
 */
export function cleanUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().replace(/^["']|["']$/g, "");
  try { return new URL(t).origin; } catch { return undefined; }
}
const clean = (v: string | undefined) => v?.trim().replace(/^["']|["']$/g, "") || undefined;

const url = cleanUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const key = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const hasSupabase = Boolean(url && key);

let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase is not configured");
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return client;
}
