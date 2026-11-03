"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { store } from "@/lib/data";
import { getSupabase, hasSupabase } from "@/lib/supabase";
import type { EventInput, EventRow, GuestRow, Service } from "@/lib/types";

export interface Settings { sound: boolean; vibrate: boolean }
export interface Toast { id: number; kind: "success" | "error" | "info"; title: string; body?: string }

interface Ctx {
  mode: "supabase" | "local";
  ready: boolean;
  userEmail: string | null;
  events: EventRow[];
  event: EventRow | null;
  guests: GuestRow[];
  guestsLoading: boolean;
  /** true while realtime sync is connected (always true in local mode) */
  live: boolean;
  settings: Settings;
  setSettings: (s: Partial<Settings>) => void;
  selectEvent: (id: string) => void;
  createEvent: (i: EventInput) => Promise<EventRow>;
  updateEvent: (id: string, p: Partial<EventInput>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  refreshGuests: () => Promise<void>;
  signOut: () => Promise<void>;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

const LS_EVENT = "eqr.event";
const LS_SETTINGS = "eqr.settings";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [guestsLoading, setGuestsLoading] = useState(false);
  const [live, setLive] = useState(false);
  const [settings, setSettingsState] = useState<Settings>({ sound: true, vibrate: true });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastId.current;
    setToasts((l) => [...l.slice(-3), { ...t, id }]);
    setTimeout(() => dismissToast(id), t.kind === "error" ? 6000 : 3600);
  }, [dismissToast]);

  // settings + theme
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(LS_SETTINGS) ?? "null");
      if (s) setSettingsState((p) => ({ ...p, ...s }));
    } catch { /* ignore */ }
  }, []);
  const setSettings = useCallback((p: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...p };
      localStorage.setItem(LS_SETTINGS, JSON.stringify(next));
      return next;
    });
  }, []);

  const loadEvents = useCallback(async () => {
    const list = await store.listEvents();
    setEvents(list);
    setEventId((cur) => {
      const saved = cur ?? localStorage.getItem(LS_EVENT);
      return list.find((e) => e.id === saved)?.id ?? list[0]?.id ?? null;
    });
    return list;
  }, []);

  // auth + initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (hasSupabase) {
        const sb = getSupabase();
        const { data } = await sb.auth.getSession();
        if (!data.session) {
          if (!cancelled) router.replace("/login");
          return;
        }
        // Only admins may use the app. Anyone else (e.g. a stray sign-up) is signed out.
        let admin = false;
        try { admin = await store.isAdmin(); } catch { admin = false; }
        if (!admin) {
          await sb.auth.signOut();
          if (!cancelled) router.replace("/login?denied=1");
          return;
        }
        setUserEmail(data.session.user.email ?? null);
        sb.auth.onAuthStateChange((_e, session) => {
          if (!session) router.replace("/login");
        });
      }
      try { await loadEvents(); } catch (e) {
        toast({ kind: "error", title: "Could not load events", body: e instanceof Error ? e.message : undefined });
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshGuests = useCallback(async () => {
    if (!eventId) { setGuests([]); return; }
    try { setGuests(await store.loadGuests(eventId)); }
    catch (e) { toast({ kind: "error", title: "Could not load guests", body: e instanceof Error ? e.message : undefined }); }
  }, [eventId, toast]);

  useEffect(() => {
    let live = true;
    setGuestsLoading(true);
    refreshGuests().finally(() => live && setGuestsLoading(false));
    return () => { live = false; };
  }, [refreshGuests]);

  // ── Real-time sync ──────────────────────────────────────────────────────────────
  // Supabase Realtime pushes every change; a new check-in is patched straight into the list
  // (no refetch). Anything else triggers one debounced reload. Polling stays as a safety net.
  useEffect(() => {
    if (!eventId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => void refreshGuests(), 300); };

    if (!hasSupabase) {
      // local mode: other tabs of this browser
      setLive(true);
      const onStorage = (e: StorageEvent) => { if (e.key === "eqr.local.v1") bump(); };
      window.addEventListener("storage", onStorage);
      return () => { window.removeEventListener("storage", onStorage); clearTimeout(timer); };
    }

    const sb = getSupabase();
    const ch = sb.channel(`event-${eventId}`);
    ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "checkins", filter: `event_id=eq.${eventId}` }, (p) => {
      const row = p.new as { ticket_id: string; service: Service; checked_in_at: string };
      const field = row.service === "entry" ? "checked_in_at" : row.service === "lunch" ? "lunch_at" : "dinner_at";
      setGuests((gs) => gs.map((g) => (g.ticket_id === row.ticket_id ? { ...g, [field]: row.checked_in_at } : g)));
    });
    for (const table of ["checkins", "guests", "tickets"] as const) {
      ch.on("postgres_changes", { event: table === "checkins" ? "DELETE" : "*", schema: "public", table, ...(table === "checkins" ? {} : { filter: `event_id=eq.${eventId}` }) }, bump);
    }
    ch.subscribe((status) => {
      setLive(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") bump(); // catch anything missed while connecting
    });
    return () => { clearTimeout(timer); setLive(false); void sb.removeChannel(ch); };
  }, [eventId, refreshGuests]);

  // Safety net: slow poll when realtime is live, faster when it is not.
  useEffect(() => {
    if (!eventId) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void refreshGuests(); }, live ? 30000 : 6000);
    return () => clearInterval(t);
  }, [eventId, refreshGuests, live]);

  const selectEvent = useCallback((id: string) => { localStorage.setItem(LS_EVENT, id); setEventId(id); }, []);

  const createEvent = useCallback(async (i: EventInput) => {
    const ev = await store.createEvent(i);
    await loadEvents();
    selectEvent(ev.id);
    return ev;
  }, [loadEvents, selectEvent]);

  const updateEvent = useCallback(async (id: string, p: Partial<EventInput>) => {
    await store.updateEvent(id, p);
    await loadEvents();
  }, [loadEvents]);

  const deleteEvent = useCallback(async (id: string) => {
    await store.deleteEvent(id);
    localStorage.removeItem(LS_EVENT);
    setEventId(null);
    await loadEvents();
  }, [loadEvents]);

  const signOut = useCallback(async () => {
    if (hasSupabase) await getSupabase().auth.signOut();
    router.replace(hasSupabase ? "/login" : "/dashboard");
  }, [router]);

  const event = useMemo(() => events.find((e) => e.id === eventId) ?? null, [events, eventId]);

  const value: Ctx = {
    mode: store.mode, ready, userEmail, events, event, guests, guestsLoading, live, settings, setSettings,
    selectEvent, createEvent, updateEvent, deleteEvent, refreshGuests, signOut, toasts, toast, dismissToast,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
