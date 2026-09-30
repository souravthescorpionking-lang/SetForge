"use client";

// ─────────────────────────────────────────────────────────────────────────────
// useRestState — the rest countdown engine, EXTRACTED from the legacy
// rest-timer.tsx (p3-3): same state machine (endAt-based ticking,
// localStorage last-duration, beep + vibrate + hidden-tab notification, screen
// wake lock while running) WITHOUT any rendering. The legacy fixed slim bar /
// full-screen overlay are replaced by the BottomBar swap in session-screen
// (LAW: bars are flex siblings; the RestBar lives inside the BottomBar slot).
//
// Copied from features/today/rest-state.tsx for the Part 8 session screen
// (§3.10) — the today feature is dead code in Part 8.
//
// Part 6 (§4.11) additive extension: `totalSec` (the active countdown's start
// total — drives the RING display's tick fraction) + an `onComplete` callback
// fired when the countdown reaches zero NATURALLY (skip/stop suppress it),
// which the guided mode uses for auto-move-next-set. No behavioural change
// for existing callers (training-screen) — both are optional.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Timer } from "lucide-react";

const LAST_KEY = "setforge:rest:last";
const DEFAULT_REST_SEC = 90;

function readLastRest(): number {
  if (typeof window === "undefined") return DEFAULT_REST_SEC;
  const raw = Number(window.localStorage.getItem(LAST_KEY));
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : DEFAULT_REST_SEC;
}

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio unavailable — silent fallback */
  }
}

function vibrate() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([180, 90, 180]);
    }
  } catch {
    /* ignore */
  }
}

/** OS notification when rest ends while the tab is hidden (permission pre-granted only). */
function notifyIfHidden() {
  try {
    if (typeof document === "undefined" || !document.hidden) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    new Notification("Rest complete", { body: "Get back under the bar 🔥", tag: "setforge-rest" });
  } catch {
    /* notifications unavailable */
  }
}

/* ---------- minimal Wake Lock typings (TS lib may lack them) ---------- */
type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };
type WakeLockNav = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

async function acquireWakeLock(): Promise<WakeLockSentinelLike | null> {
  try {
    const nav = navigator as WakeLockNav;
    if (!nav.wakeLock) return null;
    return await nav.wakeLock.request("screen");
  } catch {
    return null; // denied (e.g. low battery) or unsupported
  }
}

export type RestState = {
  /** Countdown is ticking. */
  running: boolean;
  /** The athlete used the timer at least once (session) — gates auto-rest. */
  everStarted: boolean;
  /** The set row whose ✓ started the current countdown (null while idle). */
  restRowId: string | null;
  /** Live remaining seconds of the active/paused countdown (null while idle). */
  remainingSec: number | null;
  /** Total seconds of the ACTIVE countdown (the duration it was started with)
   * — null while idle. §4.11 RING display: remaining/total drives the tick ring. */
  totalSec: number | null;
  /** Start (or restart) a countdown; sec falls back to the last used duration. */
  start: (sec?: number, setId?: string | null) => void;
  /** End immediately (no completion side-effects). */
  skip: () => void;
  /** Nudge the remaining time by ±sec (clamped ≥ 0); keeps running state. */
  adjust: (deltaSec: number) => void;
};

export interface RestStateOptions {
  /** Fired when the countdown reaches zero NATURALLY (skip suppresses it).
   * §4.11 autoMoveNextSet: advance the guided pointer + scroll into view. */
  onComplete?: () => void;
  /** Part 10 §3.1: gate the engine's own end-of-rest beep (default true). The
   *  live session passes settings.countdownSounds and drives the full
   *  3-2-1 + long-0 sequence itself (visibility-gated) via countdown-audio. */
  sounds?: boolean;
}

export function useRestState(options?: RestStateOptions): RestState {
  const [durationSec, setDurationSec] = useState<number>(() => readLastRest());
  const [remaining, setRemaining] = useState<number>(0);
  const [running, setRunning] = useState(false);
  const [everStarted, setEverStarted] = useState(false);
  const [restRowId, setRestRowId] = useState<string | null>(null);
  const endAtRef = useRef<number>(0);
  const finishedRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const [activeTotalSec, setActiveTotalSec] = useState<number | null>(null);

  // "Latest" callback ref — the consumer's closure stays fresh across renders
  // without re-subscribing the ticking engine.
  const onCompleteRef = useRef<(() => void) | undefined>(undefined);
  const soundsRef = useRef<boolean>(options?.sounds ?? true);
  useEffect(() => {
    onCompleteRef.current = options?.onComplete;
    soundsRef.current = options?.sounds ?? true;
  });

  const finish = useCallback(() => {
    setRunning(false);
    setRemaining(0);
    setRestRowId(null);
    setActiveTotalSec(null);
    if (!finishedRef.current) {
      finishedRef.current = true;
      if (soundsRef.current) beep();
      vibrate();
      notifyIfHidden();
      toast.success("Rest complete", {
        icon: <Timer className="h-4 w-4 text-primary" />,
        description: "Get back under the bar 🔥",
      });
      onCompleteRef.current?.();
    }
  }, []);

  // ticking (endAt-based → immune to interval drift)
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const left = endAtRef.current - Date.now();
      if (left <= 0) {
        finish();
        return;
      }
      setRemaining(left);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [running, finish]);

  // Wake Lock: keep the screen on while rest runs
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    void acquireWakeLock().then((lock) => {
      if (cancelled) {
        void lock?.release();
        return;
      }
      wakeLockRef.current = lock;
    });
    return () => {
      cancelled = true;
      const lock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (lock) void lock.release();
    };
  }, [running]);

  const start = useCallback(
    (sec?: number, setId?: string | null) => {
      const total = sec && sec > 0 ? Math.round(sec) : durationSec;
      if (sec && sec > 0 && sec !== durationSec) {
        setDurationSec(total);
        try {
          window.localStorage.setItem(LAST_KEY, String(total));
        } catch {
          /* storage blocked */
        }
      }
      finishedRef.current = false;
      setEverStarted(true);
      setRestRowId(setId ?? null);
      setActiveTotalSec(total);
      endAtRef.current = Date.now() + total * 1000;
      setRemaining(total * 1000);
      setRunning(true);
    },
    [durationSec],
  );

  const skip = useCallback(() => {
    finishedRef.current = true; // suppress completion side-effects
    setRunning(false);
    setRemaining(0);
    setRestRowId(null);
    setActiveTotalSec(null);
  }, []);

  const adjust = useCallback(
    (deltaSec: number) => {
      setRemaining((prev) => {
        const cur = running ? Math.max(0, endAtRef.current - Date.now()) : prev;
        const next = Math.max(0, cur + deltaSec * 1000);
        if (running) {
          if (next === 0) {
            finish();
            return 0;
          }
          endAtRef.current = Date.now() + next;
        } else if (next > 0) {
          finishedRef.current = false; // a paused adjustment can finish cleanly later
        }
        return next;
      });
    },
    [running, finish],
  );

  return {
    running,
    everStarted,
    restRowId,
    remainingSec: running || remaining > 0 ? Math.ceil(remaining / 1000) : null,
    totalSec: activeTotalSec,
    start,
    skip,
    adjust,
  };
}
