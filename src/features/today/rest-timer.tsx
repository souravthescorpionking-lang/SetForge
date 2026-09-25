"use client";

// Integrated rest timer (Part 2): a slim full-width bottom bar —
// "Rest 1:12 [+15s] [-15s] [Skip]" — above the bottom nav (never covering
// content: the training screen pads its body while the bar is visible).
// - Ticking ✓ on a row starts the countdown from that row's planned rest.
// - The REST cell of the resting row renders the live countdown (restRowId).
// - On end: beep + vibrate, then fire registered onRestEnd callbacks
//   (e.g. focus the next incomplete row's first cell per restEndBehaviour).
// - Presets popover (60/90/120/180 + exercise default) on the timer chip;
//   last duration persisted to localStorage.
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
import { Minus, Pause, Play, Plus, RotateCcw, SkipForward, Timer, Volume2, VolumeX } from "lucide-react";
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
  const endAtRef = useRef<number>(0);
  const finishedRef = useRef(false);
  const restEndCbRef = useRef<(() => void) | null>(null);

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
    if (!finishedRef.current) {
      finishedRef.current = true;
      if (!muted) beep();
      vibrate();
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
      <AnimatePresence>
        {visible && (
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

              <div className="flex min-w-0 flex-1 items-center gap-2 pl-0.5">
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
              </div>

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
    </RestTimerContext.Provider>
  );
}
