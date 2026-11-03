// Sound + vibration feedback for the scanner. Web Audio only — no asset files.
let ctx: AudioContext | null = null;

export function primeAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
  } catch { /* audio unavailable */ }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain = 0.18) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export type Feedback = "success" | "already" | "error";

export function playFeedback(kind: Feedback, opts: { sound: boolean; vibrate: boolean }) {
  if (opts.sound) {
    primeAudio();
    if (kind === "success") { tone(660, 0, 0.12, "sine"); tone(990, 0.11, 0.2, "sine"); }
    else if (kind === "already") { tone(220, 0, 0.18, "sawtooth", 0.14); tone(220, 0.24, 0.18, "sawtooth", 0.14); tone(220, 0.48, 0.18, "sawtooth", 0.14); }
    else { tone(160, 0, 0.45, "square", 0.12); }
  }
  if (opts.vibrate && typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(kind === "success" ? 80 : kind === "already" ? [120, 80, 120, 80, 120] : [300]);
  }
}
