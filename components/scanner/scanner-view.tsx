"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type QrScannerType from "qr-scanner";
import { Camera, CameraOff, Check, Flashlight, FlashlightOff, Keyboard, Maximize2, Minimize2, RefreshCcw, ShieldAlert, X } from "lucide-react";
import { Badge, Button, Card, Input, PageHeader, Select, Switch } from "@/components/ui";
import { useApp } from "@/components/app-provider";
import { ResultOverlay, lookFor, type UiResult } from "./result-overlay";
import { SERVICES, SERVICE_LABEL, type Service } from "@/lib/types";
import { SERVICE_ICON } from "@/components/guests/shared";
import { store } from "@/lib/data";
import { normalizeToken } from "@/lib/scan";
import { playFeedback, primeAudio, type Feedback } from "@/lib/feedback";
import { useWedgeScanner } from "@/lib/wedge";
import { eventPhase, fmtTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Source = "camera" | "hardware" | "manual";
interface Recent { key: number; name: string; code: string; at: number; service: Service }

function cameraError(e: unknown): string {
  const n = (e as { name?: string })?.name ?? "";
  const m = e instanceof Error ? e.message : String(e);
  if (n === "NotAllowedError" || /permission/i.test(m)) return "Camera permission was denied. Allow camera access for this site in your browser settings, then try again.";
  if (n === "NotFoundError" || /no camera/i.test(m)) return "No camera was found on this device. Use a hardware scanner or type the code below.";
  if (n === "NotReadableError") return "The camera is in use by another app or tab. Close it and try again.";
  return m || "Could not start the camera.";
}

export function ScannerView() {
  const { event, settings, setSettings, refreshGuests, live } = useApp();
  const tz = event?.timezone ?? "UTC";

  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameras, setCameras] = useState<QrScannerType.Camera[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [torch, setTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hardware, setHardware] = useState(true);
  const [hwFlash, setHwFlash] = useState(false);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<UiResult | null>(null);
  const [counts, setCounts] = useState({ ok: 0, rejected: 0 });
  const [recent, setRecent] = useState<Recent[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [service, setService] = useState<Service>("entry");
  const serviceRef = useRef<Service>("entry");
  serviceRef.current = service;
  useEffect(() => { const v = localStorage.getItem("eqr.service"); if (v === "entry" || v === "lunch" || v === "dinner") setService(v); }, []);
  const pickService = (v: Service) => { setService(v); localStorage.setItem("eqr.service", v); dismiss(); };

  const resultRef = useRef<UiResult | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const inflight = useRef(new Set<string>());
  const last = useRef<{ token: string; at: number } | null>(null); // token is "<service>:<code>" so switching service rescans instantly
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    resultRef.current = null;
    setResult(null);
    if (last.current) last.current.at = Date.now(); // cooldown counts from the moment the result is cleared
  }, []);

  /** Single entry point for camera, keyboard-wedge and manual input. Server decides; the UI only displays. */
  const submit = useCallback((raw: string, source: Source) => {
    if (!event) return;
    const token = normalizeToken(raw);
    if (!token || token.length > 200) return;
    const svc = serviceRef.current;
    const key = `${svc}:${token}`;
    const t = Date.now();
    const cooldown = source === "camera" ? 3000 : source === "hardware" ? 1200 : 600;
    const l = last.current;
    if (l && l.token === key && t - l.at < cooldown) return; // same wristband still in view / double trigger
    if (inflight.current.has(key)) return;
    last.current = { token: key, at: t + 1e9 }; // held while its result is on screen
    inflight.current.add(key);

    chain.current = chain.current.then(async () => {
      let res: UiResult;
      try {
        res = { ...(await store.checkIn(event.id, token, svc)), service: svc, at: Date.now() };
      } catch {
        res = { result: "ERROR", service: svc, at: Date.now() };
        last.current = null; // a network failure must be retryable immediately
      } finally {
        inflight.current.delete(key);
      }
      const kind: Feedback = res.result === "SUCCESS" ? "success" : res.result === "ALREADY_IN" ? "already" : "error";
      playFeedback(kind, settingsRef.current);
      clearTimeout(timer.current);
      resultRef.current = res;
      setResult(res);
      timer.current = setTimeout(dismiss, lookFor(res.result, res.service).ms);
      if (res.result === "SUCCESS") setCounts((c) => ({ ...c, ok: c.ok + 1 }));
      else if (res.result !== "ERROR") setCounts((c) => ({ ...c, rejected: c.rejected + 1 }));
      const name = "guest_name" in res && res.guest_name ? res.guest_name : lookFor(res.result, res.service).title;
      setRecent((r) => [{ key: res.at, name, code: res.result, at: res.at, service: res.service }, ...r].slice(0, 6));
      if (!live) void refreshGuests(); // with realtime connected the list updates itself
    });
  }, [event, dismiss, refreshGuests, live]);

  useWedgeScanner((code) => { setHwFlash(true); setTimeout(() => setHwFlash(false), 600); submit(code, "hardware"); }, hardware);
  useEffect(() => () => clearTimeout(timer.current), []);

  /* ───── camera ───── */
  const start = useCallback(async (id?: string) => {
    setError(null); setStarting(true); primeAudio();
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access requires HTTPS (or localhost). Open this page over a secure connection.");
      }
      const QrScanner = (await import("qr-scanner")).default;
      scannerRef.current?.destroy();
      const sc = new QrScanner(videoRef.current!, (r) => submit(r.data, "camera"), {
        preferredCamera: id || "environment", // rear camera on phones
        maxScansPerSecond: 20, highlightScanRegion: false, highlightCodeOutline: false,
        returnDetailedScanResult: true, onDecodeError: () => {},
      });
      scannerRef.current = sc;
      await sc.start();
      setRunning(true);
      setCameras(await QrScanner.listCameras(true));
      setTorch(await sc.hasFlash()); setTorchOn(false);
    } catch (e) { setRunning(false); setError(cameraError(e)); }
    finally { setStarting(false); }
  }, [submit]);

  const stop = useCallback(() => {
    scannerRef.current?.stop(); setRunning(false); setTorchOn(false);
  }, []);

  useEffect(() => () => { scannerRef.current?.destroy(); scannerRef.current = null; }, []);

  // Release the camera while the tab is hidden; resume when it returns.
  useEffect(() => {
    let was = false;
    const h = () => {
      if (document.hidden) { was = running; if (running) scannerRef.current?.stop(); }
      else if (was) void scannerRef.current?.start();
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [running]);

  async function pickCamera(id: string) {
    setCameraId(id);
    if (scannerRef.current && running) {
      try { await scannerRef.current.setCamera(id); setTorch(await scannerRef.current.hasFlash()); setTorchOn(false); }
      catch (e) { setError(cameraError(e)); }
    }
  }
  async function flipCamera() {
    if (cameras.length < 2) return;
    const i = cameras.findIndex((c) => c.id === cameraId);
    await pickCamera(cameras[(i + 1) % cameras.length].id);
  }
  async function toggleTorch() {
    const sc = scannerRef.current; if (!sc) return;
    try { await sc.toggleFlash(); setTorchOn(sc.isFlashOn()); } catch { setTorch(false); }
  }

  // Full-screen: CSS takeover everywhere (works on iPhone) + the Fullscreen API where available.
  async function setFull(on: boolean) {
    setImmersive(on);
    try {
      if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* not supported — CSS mode still applies */ }
  }
  useEffect(() => {
    const h = () => { if (!document.fullscreenElement) setImmersive(false); };
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  if (!event) return null;
  const phase = eventPhase(event.valid_from, event.valid_until, now);

  const ServicePicker = (compact: boolean) => (
    <div role="tablist" aria-label="Scan mode" className={cn("grid grid-cols-3 gap-1 rounded-2xl p-1", compact ? "bg-black/55 backdrop-blur-md" : "border bg-subtle")}>
      {SERVICES.map((sv) => {
        const Ic = SERVICE_ICON[sv]; const on = service === sv;
        return (
          <button key={sv} role="tab" aria-selected={on} onClick={() => pickService(sv)}
            className={cn("relative flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition", compact ? "min-w-[92px]" : "", on ? "text-accent-ink" : compact ? "text-white/80" : "text-muted hover:text-ink")}>
            {on && <motion.span layoutId={compact ? "svc-pill-full" : "svc-pill"} className="absolute inset-0 rounded-xl bg-accent shadow-card" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            <Ic className="relative h-4 w-4" /><span className="relative">{SERVICE_LABEL[sv]}</span>
          </button>
        );
      })}
    </div>
  );

  const Controls = (
    <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-4 pb-5 safe-b">
      {running ? (
        <>
          <Button variant="danger" onClick={stop}><CameraOff className="h-4 w-4" />Stop</Button>
          {torch && <Button onClick={() => void toggleTorch()} aria-label="Toggle torch">{torchOn ? <FlashlightOff className="h-4 w-4" /> : <Flashlight className="h-4 w-4" />}Torch</Button>}
          {cameras.length > 1 && <Button onClick={() => void flipCamera()} aria-label="Switch camera"><RefreshCcw className="h-4 w-4" /></Button>}
        </>
      ) : (
        <Button variant="primary" size="lg" loading={starting} onClick={() => void start(cameraId)}><Camera className="h-5 w-5" />Start scanning</Button>
      )}
      <Button onClick={() => void setFull(!immersive)} aria-label={immersive ? "Exit full screen" : "Full screen"}>{immersive ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
    </div>
  );

  return (
    <div className={cn(!immersive && "mx-auto max-w-[1280px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12")}>
      {!immersive && <PageHeader title="QR scanner" description="Choose what you are scanning for, then scan. Every result is saved and shown live on the dashboard." />}
      {!immersive && <div className="mb-4 max-w-xl">{ServicePicker(false)}</div>}

      <div className={cn(!immersive && "grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]")}>
        <div className={cn("relative overflow-hidden bg-neutral-950", immersive ? "fixed inset-0 z-40" : "aspect-[3/4] max-h-[74dvh] w-full rounded-2xl border shadow-card sm:aspect-[4/3] lg:aspect-video lg:max-h-none")}>
          <video ref={videoRef} playsInline muted autoPlay className={cn("scan-video absolute inset-0", !running && "invisible")} />

          {!running && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <div className="max-w-xs"><div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-white"><Camera className="h-7 w-7" /></div>
                <p className="text-base font-medium text-white">Ready to scan</p>
                <p className="mt-1 text-sm text-white/60">Tap Start to open the camera. Hardware scanners work without it.</p></div>
            </div>
          )}

          {running && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative aspect-square w-[62%] max-w-[360px] rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                {["left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl"].map((c) => (
                  <span key={c} className={cn("absolute h-9 w-9 border-white", c)} />
                ))}
                <motion.span className="absolute inset-x-3 h-0.5 rounded-full bg-white/80 shadow-[0_0_12px_2px_rgba(255,255,255,0.6)]" animate={{ top: ["8%", "92%", "8%"] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
              </div>
              <p className="absolute bottom-24 px-6 text-center text-sm font-medium text-white/90">Scanning for <b>{SERVICE_LABEL[service]}</b> — hold the wristband QR inside the frame</p>
            </div>
          )}

          <div className="absolute left-3 right-3 top-3 z-10 flex items-start justify-between gap-2 safe-t">
            <div className="flex flex-wrap gap-2">
              {hardware && <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-md transition", hwFlash ? "bg-ok text-white" : "bg-black/50 text-white")}><Keyboard className="h-3.5 w-3.5" />{hwFlash ? "Scanner input received" : "Hardware scanner ready"}</span>}
              {phase !== "open" && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black"><ShieldAlert className="h-3.5 w-3.5" />{phase === "before" ? "Entry not open yet" : "Entry window closed"}</span>}
            </div>
            {immersive && <div className="absolute left-1/2 top-12 -translate-x-1/2 safe-t">{ServicePicker(true)}</div>}
            {immersive && <button onClick={() => void setFull(false)} aria-label="Exit full screen" className="grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md"><X className="h-5 w-5" /></button>}
          </div>

          {error && (
            <div role="alert" className="absolute inset-x-4 bottom-24 z-10 rounded-xl bg-red-600 px-4 py-3 text-sm text-white shadow-pop">{error}</div>
          )}
          {Controls}
        </div>

        {!immersive && (
          <aside className="space-y-4">
            <Card className="p-5">
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-ok/10 px-4 py-3"><p className="text-xs text-ok">Approved</p><p className="text-2xl font-semibold tabular-nums text-ok">{counts.ok}</p></div>
                <div className="rounded-xl bg-danger/10 px-4 py-3"><p className="text-xs text-danger">Rejected</p><p className="text-2xl font-semibold tabular-nums text-danger">{counts.rejected}</p></div>
              </div>
              <p className="text-xs text-muted">Counts for this scanner session. The guest list shows the permanent record.</p>
            </Card>

            <Card className="space-y-4 p-5">
              <h2 className="text-sm font-semibold">Input &amp; feedback</h2>
              {cameras.length > 0 && (
                <label className="block"><span className="mb-1.5 block text-[13px] font-medium">Camera</span>
                  <Select value={cameraId} onChange={(e) => void pickCamera(e.target.value)}>
                    <option value="">Default (rear camera)</option>
                    {cameras.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </Select></label>
              )}
              <Switch label="Hardware scanner" description="USB / Bluetooth in keyboard mode" checked={hardware} onChange={setHardware} />
              <Switch label="Sound" checked={settings.sound} onChange={(v) => { setSettings({ sound: v }); if (v) { primeAudio(); playFeedback("success", { sound: true, vibrate: false }); } }} />
              <Switch label="Vibration" checked={settings.vibrate} onChange={(v) => setSettings({ vibrate: v })} />
            </Card>

            <Card className="p-5">
              <h2 className="mb-1 text-sm font-semibold">Enter a code manually</h2>
              <p className="mb-3 text-xs text-muted">Paste or type the ticket code if a wristband won’t scan.</p>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(manual, "manual"); setManual(""); }}>
                <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Ticket code" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="font-mono" aria-label="Ticket code" />
                <Button type="submit" variant="primary" disabled={!manual.trim()}><Check className="h-4 w-4" />Check</Button>
              </form>
            </Card>

            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold">Recent scans</h2>
              {recent.length === 0 ? <p className="text-sm text-muted">Nothing scanned yet.</p> : (
                <ul className="space-y-2.5">
                  {recent.map((r) => (
                    <li key={r.key} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">{r.name} <span className="font-normal text-muted">· {SERVICE_LABEL[r.service]}</span></span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge tone={r.code === "SUCCESS" ? "ok" : r.code === "ERROR" ? "neutral" : "danger"}>{r.code === "SUCCESS" ? "Approved" : r.code === "ALREADY_IN" ? "Already done" : r.code === "ERROR" ? "Not sent" : "Rejected"}</Badge>
                        <span className="text-xs tabular-nums text-muted">{fmtTime(new Date(r.at).toISOString(), tz)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>
        )}
      </div>

      <ResultOverlay result={result} tz={tz} onDismiss={dismiss} />
    </div>
  );
}
