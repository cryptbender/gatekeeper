"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { store } from "@/lib/data";
import { getSupabase, hasSupabase } from "@/lib/supabase";
import type { EventInput, EventRow, GuestRow } from "@/lib/types";

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

  // Keep several gates / devices in sync: poll while the tab is visible.
  useEffect(() => {
    if (!eventId) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void refreshGuests(); }, 6000);
    return () => clearInterval(t);
  }, [eventId, refreshGuests]);

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
    mode: store.mode, ready, userEmail, events, event, guests, guestsLoading, settings, setSettings,
    selectEvent, createEvent, updateEvent, deleteEvent, refreshGuests, signOut, toasts, toast, dismissToast,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
