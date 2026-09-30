"use client";

// ─────────────────────────────────────────────────────────────────────────────
// countdown-audio — Part 10 §3.1: the rest countdown's 3-2-1 + long-0 tone
// sequence via Web Audio. Rules (spec):
//   • sounds play ONLY while document.visibilityState === "visible"
//   • the AudioContext is LAZY-CREATED on the first user gesture
//     (primeCountdownAudio() is called from the Log-set tap) — autoplay
//     policies would otherwise keep it suspended.
// Short beeps: 880 Hz, 120 ms. Long tone at 0: 660 Hz, 700 ms.
// ─────────────────────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;

type AudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

/** Lazily create (or resume) the shared AudioContext — call from a user gesture. */
export function primeCountdownAudio(): void {
  if (typeof window === "undefined") return;
  try {
    if (!ctx) {
      const w = window as AudioWindow;
      const Ctx = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctx) return;
      ctx = new Ctx();
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null; // audio unavailable — silent fallback
  }
}

function tone(freq: number, durationMs: number, startDelayMs = 0): void {
  if (!ctx || typeof document === "undefined" || document.visibilityState !== "visible") return;
  try {
    const t0 = ctx.currentTime + startDelayMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000 + 0.05);
  } catch {
    /* audio unavailable — silent fallback */
  }
}

/** Short beep at 3 / 2 / 1 seconds remaining. */
export function countdownTickBeep(): void {
  tone(880, 120);
}

/** The long tone when the countdown reaches 0. */
export function countdownZeroTone(): void {
  tone(660, 700);
}
