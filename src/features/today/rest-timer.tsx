"use client";

// Integrated rest timer — Part 2 slim bar + Part 3 FULL-SCREEN overlay.
//
// Slim bar (default): "Rest 1:12 [−15s][+15s][pause][Skip]" pinned above the
// bottom nav; ticking ✓ on a set row starts the countdown from that row's
// planned rest; the REST cell of the resting row renders the live countdown.
//
// Full-screen overlay (Part 3 rework): tap the countdown on the slim bar and
// the timer takes over the whole viewport — huge tabular digits inside an SVG
// progress ring, large ±15s / pause / skip buttons sized for chalked-up
// thumbs, plus a screen Wake Lock so the display stays on while resting.
// Minimise returns to the slim bar; finishing rest auto-collapses.
// When the tab is hidden at finish time and Notification permission was
// already granted, an OS notification fires (no permission prompts — the
// user must have granted it from their own gesture elsewhere).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Timer,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { formatDuration } from "@/lib/formulas";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

const LAST_KEY = "setforge:rest:last";
const DEFAULT_REST_SEC = 90;
const PRESETS = [60, 90, 120, 180];

type RestTimerApi = {
  /** Start (or restart) a countdown. `sec` falls back to the last used duration. */
  start: (sec?: number, setId?: string | null) => void;
  /** End immediately (fires no completion side-effects). */
  skip: () => void;
  running: boolean;
  /** Whether the athlete used the timer at least once (session). */
  everStarted: boolean;
  /** Registers the current exercise's default rest as an extra preset. */
  setExtraPreset: (sec: number | null) => void;
  /** The set row whose ✓ started the current countdown (REST cell shows live). */
  restRowId: string | null;
  /** Live remaining seconds of the active countdown (null while idle). */
  remainingSec: number | null;
  /** Register a callback fired once when rest ends (e.g. focus next row). */
  onRestEnd: (cb: () => void) => () => void;
};

const RestTimerContext = createContext<RestTimerApi>({
  start: () => {},
  skip: () => {},
  running: false,
  everStarted: false,
  setExtraPreset: () => {},
  restRowId: null,
  remainingSec: null,
  onRestEnd: () => () => {},
});

export function useRestTimer() {
  return useContext(RestTimerContext);
}

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

export function RestTimerProvider({ children, active = true }: { children: ReactNode; active?: boolean }) {
  // total configured duration (sec) and remaining (ms)
  const [durationSec, setDurationSec] = useState<number>(() => readLastRest());
  const [remaining, setRemaining] = useState<number>(0);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [everStarted, setEverStarted] = useState(false);
  const [extraPreset, setExtraPreset] = useState<number | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [restRowId, setRestRowId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const endAtRef = useRef<number>(0);
  const finishedRef = useRef(false);
  const restEndCbRef = useRef<(() => void) | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  const fireRestEnd = useCallback(() => {
    const cb = restEndCbRef.current;
    restEndCbRef.current = null;
    if (cb) {
      try { cb(); } catch { /* focus may fail when unmounted */ }
    }
  }, []);

  const finish = useCallback(() => {
    setRunning(false);
    setRemaining(0);
    setRestRowId(null);
    setExpanded(false); // Part 3: fullscreen overlay auto-collapses on finish
    if (!finishedRef.current) {
      finishedRef.current = true;
      if (!muted) beep();
      vibrate();
      notifyIfHidden();
      toast.success("Rest complete", {
        icon: <Timer className="h-4 w-4 text-primary" />,
        description: "Get back under the bar 🔥",
      });
      fireRestEnd();
    }
  }, [muted, fireRestEnd]);

  // ticking
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
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [running, finish]);

  // Wake Lock: keep the screen on while the fullscreen rest overlay runs
  useEffect(() => {
    if (!expanded || !running) return;
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
  }, [expanded, running]);

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
    setExpanded(false);
    restEndCbRef.current = null;
  }, []);

  const pause = useCallback(() => {
    setRunning(false);
    // freeze remaining where it is (already updated by tick)
  }, []);

  const resume = useCallback(() => {
    finishedRef.current = false;
    endAtRef.current = Date.now() + remaining;
    setRunning(true);
  }, [remaining]);

  const reset = useCallback(() => {
    setRunning(false);
    finishedRef.current = true; // suppress completion side-effects
    setRemaining(durationSec * 1000);
    setRestRowId(null);
    restEndCbRef.current = null;
  }, [durationSec]);

  const setExtra = useCallback((sec: number | null) => {
    setExtraPreset(sec && sec > 0 ? Math.round(sec) : null);
  }, []);

  /** Nudge the remaining time by ±sec (clamped ≥ 0); keeps running state. */
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
          finishedRef.current = false; // a paused adjustment can resume cleanly
        }
        return next;
      });
    },
    [running, finish],
  );

  const onRestEnd = useCallback((cb: () => void) => {
    restEndCbRef.current = cb;
    return () => {
      if (restEndCbRef.current === cb) restEndCbRef.current = null;
    };
  }, []);

  // Escape collapses the fullscreen overlay (does not skip the rest)
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [expanded]);

  const api = useMemo<RestTimerApi>(
    () => ({
      start,
      skip,
      running,
      everStarted,
      setExtraPreset: setExtra,
      restRowId,
      remainingSec: running || remaining > 0 ? Math.ceil(remaining / 1000) : null,
      onRestEnd,
    }),
    [start, skip, running, everStarted, setExtra, restRowId, remaining, onRestEnd],
  );

  const visible = active && (running || remaining > 0);
  const totalMs = Math.max(durationSec * 1000, 1);
  const pct = Math.max(0, Math.min(1, remaining / totalMs));
  const display = formatDuration(Math.ceil(remaining / 1000));
  const presetList = extraPreset && !PRESETS.includes(extraPreset) ? [...PRESETS, extraPreset] : PRESETS;

  return (
    <RestTimerContext.Provider value={api}>
      {children}

      {/* ---------- slim bar (minimised state) ---------- */}
      <AnimatePresence>
        {visible && !expanded && (
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 28 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="fixed inset-x-0 z-[70] flex justify-center px-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-0 lg:px-6 lg:pb-6"
            role="timer"
            aria-label={`Rest timer: ${display} remaining`}
          >
            <div className="flex h-11 w-full max-w-lg items-center gap-1 overflow-hidden rounded-2xl border border-primary/40 bg-popover/95 pl-1 pr-1 shadow-xl shadow-primary/10 backdrop-blur-md">
              {/* presets + mute popover */}
              <Popover open={presetsOpen} onOpenChange={setPresetsOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Rest timer options and presets"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-accent"
                  >
                    <Timer className={cn("h-5 w-5 shrink-0", running ? "text-primary animate-pulse" : "text-muted-foreground")} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-64 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Quick rest</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {presetList.map((sec) => (
                      <Button
                        key={sec}
                        variant={durationSec === sec ? "default" : "outline"}
                        size="sm"
                        className="h-10 rounded-xl text-sm font-bold"
                        onClick={() => {
                          start(sec);
                          setPresetsOpen(false);
                        }}
                      >
                        <span className="numeric">{sec}s</span>
                      </Button>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-xl border px-3 py-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {muted ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-primary" />}
                      Alert sound
                    </span>
                    <Switch checked={!muted} onCheckedChange={(v) => setMuted(!v)} aria-label="Toggle rest alert sound" />
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Last duration: <span className="numeric font-semibold">{durationSec}s</span>
                  </p>
                </PopoverContent>
              </Popover>

              {/* countdown — tap to expand full-screen (Part 3) */}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-label={`Expand rest timer, ${display} remaining`}
                className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 pl-0.5 text-left transition-colors hover:bg-accent"
              >
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Rest</span>
                <span
                  className={cn(
                    "shrink-0 text-lg font-bold leading-none tabular-nums",
                    running ? "text-primary" : "text-foreground",
                  )}
                >
                  {display}
                </span>
                <span className="mt-1 hidden h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted sm:block">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-primary to-amber-500 transition-[width] duration-200"
                    style={{ width: `${pct * 100}%` }}
                  />
                </span>
                <Maximize2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </button>

              {/* -15s / +15s */}
              <button
                type="button"
                aria-label="Subtract 15 seconds"
                onClick={() => adjust(-15)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Minus className="h-4.5 w-4.5" />
              </button>
              <button
                type="button"
                aria-label="Add 15 seconds"
                onClick={() => adjust(15)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-4.5 w-4.5" />
              </button>

              {/* pause/resume */}
              <button
                type="button"
                aria-label={running ? "Pause rest timer" : "Resume rest timer"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary transition-colors hover:bg-primary/10 active:bg-primary/20"
                onClick={() => (running ? pause() : resume())}
              >
                {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>

              {/* skip */}
              <button
                type="button"
                aria-label="Skip rest"
                onClick={skip}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary transition-colors hover:bg-primary/25"
              >
                <SkipForward className="h-4.5 w-4.5" />
              </button>

              {/* reset (desktop affordance) */}
              <button
                type="button"
                aria-label="Reset rest timer"
                onClick={reset}
                className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- full-screen rest overlay (Part 3) ---------- */}
      <AnimatePresence>
        {visible && expanded && (
          <motion.div
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed inset-0 z-[80] flex flex-col bg-background/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
            role="dialog"
            aria-modal="true"
            aria-label={`Full-screen rest timer, ${display} remaining`}
          >
            {/* top row: label + minimise */}
            <div className="flex shrink-0 items-center justify-between px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2">
                <Timer className={cn("h-5 w-5", running ? "text-primary animate-pulse" : "text-muted-foreground")} />
                <span className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">Rest</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-10 gap-1.5 rounded-xl px-3 text-sm font-semibold"
                onClick={() => setExpanded(false)}
                aria-label="Minimise rest timer"
              >
                <ChevronDown className="h-4 w-4" /> Minimise
              </Button>
            </div>

            {/* the big clock */}
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 sm:gap-10">
              <div className="relative flex items-center justify-center" aria-hidden>
                <svg width="min(72vw, 22rem)" height="min(72vw, 22rem)" viewBox="0 0 320 320" className="-rotate-90">
                  <circle cx="160" cy="160" r="144" fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/40" />
                  <circle
                    cx="160"
                    cy="160"
                    r="144"
                    fill="none"
                    stroke="url(#restGrad)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 144}
                    strokeDashoffset={2 * Math.PI * 144 * (1 - pct)}
                    style={{ transition: "stroke-dashoffset 0.25s linear" }}
                  />
                  <defs>
                    <linearGradient id="restGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f97316" />
                      <stop offset="100%" stopColor="#f59e0b" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span
                    className={cn(
                      "text-[clamp(3.5rem,16vw,7.5rem)] font-black leading-none tabular-nums tracking-tight",
                      running ? "text-primary" : "text-foreground",
                    )}
                    aria-live="polite"
                  >
                    {display}
                  </span>
                  <span className="mt-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {running ? "resting" : "paused"}
                    {" · planned "}
                    <span className="tabular-nums">{formatDuration(durationSec)}</span>
                  </span>
                </div>
              </div>

              {/* large thumb-friendly controls */}
              <div className="flex w-full max-w-md items-center justify-center gap-3 sm:gap-4">
                <button
                  type="button"
                  aria-label="Subtract 15 seconds"
                  onClick={() => adjust(-15)}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border text-lg font-bold tabular-nums text-muted-foreground transition-all active:scale-95 hover:bg-accent hover:text-foreground sm:h-16 sm:w-16"
                >
                  <Minus className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  aria-label={running ? "Pause rest timer" : "Resume rest timer"}
                  onClick={() => (running ? pause() : resume())}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary transition-all active:scale-95 hover:bg-primary/25 sm:h-16 sm:w-16"
                >
                  {running ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                </button>
                <button
                  type="button"
                  aria-label="Add 15 seconds"
                  onClick={() => adjust(15)}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border text-lg font-bold tabular-nums text-muted-foreground transition-all active:scale-95 hover:bg-accent hover:text-foreground sm:h-16 sm:w-16"
                >
                  <Plus className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  aria-label="Skip rest"
                  onClick={skip}
                  className="flex h-14 items-center gap-2 rounded-2xl bg-primary px-6 text-base font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all active:scale-95 hover:bg-primary/90 sm:h-16 sm:px-8"
                >
                  <SkipForward className="h-5 w-5" /> Skip
                </button>
              </div>
            </div>

            {/* subtle bottom brand strip */}
            <div className="shrink-0 pb-2 text-center text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/50">
              SetForge
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </RestTimerContext.Provider>
  );
}
