"use client";

// Floating rest timer: countdown chip with start/pause/reset + quick presets.
// - Quick presets (60/90/120/180s + the current exercise's restSec) in a
//   popover; the alert sound (beep) can be muted there too.
// - Remembers the last duration in localStorage (`setforge:rest:last`).
// - Auto-started by the training screen after a set save (exercise.restSec).
// - On finish: vibration (where supported) + short WebAudio beep + toast.
// Renders nothing while idle or while the training screen is closed (the
// countdown keeps running silently). Rendered above modals (z-[70]).
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
import { Pause, Play, RotateCcw, Timer, Volume2, VolumeX, Zap } from "lucide-react";
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
  start: (sec?: number) => void;
  running: boolean;
  /** Whether the athlete used the timer at least once (session). */
  everStarted: boolean;
  /** Registers the current exercise's default rest as an extra preset. */
  setExtraPreset: (sec: number | null) => void;
};

const RestTimerContext = createContext<RestTimerApi>({
  start: () => {},
  running: false,
  everStarted: false,
  setExtraPreset: () => {},
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
  const endAtRef = useRef<number>(0);
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    setRunning(false);
    setRemaining(0);
    if (!finishedRef.current) {
      finishedRef.current = true;
      if (!muted) beep();
      vibrate();
      toast.success("Rest complete", {
        icon: <Timer className="h-4 w-4 text-primary" />,
        description: "Get back under the bar 🔥",
      });
    }
  }, [muted]);

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
    (sec?: number) => {
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
      endAtRef.current = Date.now() + total * 1000;
      setRemaining(total * 1000);
      setRunning(true);
    },
    [durationSec],
  );

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
  }, [durationSec]);

  const setExtra = useCallback((sec: number | null) => {
    setExtraPreset(sec && sec > 0 ? Math.round(sec) : null);
  }, []);

  const api = useMemo<RestTimerApi>(
    () => ({ start, running, everStarted, setExtraPreset: setExtra }),
    [start, running, everStarted, setExtra],
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
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed z-[70] right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:right-6"
            role="timer"
            aria-label={`Rest timer: ${display} remaining`}
          >
            <div className="flex items-center gap-1 rounded-2xl border border-primary/40 bg-popover/95 pl-1.5 pr-1.5 py-1.5 shadow-xl shadow-primary/10 backdrop-blur-md">
              {/* presets popover */}
              <Popover open={presetsOpen} onOpenChange={setPresetsOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Rest timer options and presets"
                    className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-accent"
                  >
                    <Timer className={cn("h-5 w-5 shrink-0", running ? "text-primary animate-pulse" : "text-muted-foreground")} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="end" className="w-64 p-3">
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
                        {extraPreset === sec && <Zap className="h-3.5 w-3.5" aria-label="exercise default" />}
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

              <div className="min-w-[4.4rem]">
                <span
                  className={cn(
                    "block text-center text-base font-bold numeric leading-none tabular-nums",
                    running ? "text-primary" : "text-foreground",
                  )}
                >
                  {display}
                </span>
                <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-primary to-amber-500 transition-[width] duration-200"
                    style={{ width: `${pct * 100}%` }}
                  />
                </span>
              </div>

              <div className="ml-1 flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label={running ? "Pause rest timer" : "Resume rest timer"}
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-primary transition-colors hover:bg-primary/10 active:bg-primary/20"
                  onClick={() => (running ? pause() : resume())}
                >
                  {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  aria-label="Reset rest timer"
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent"
                  onClick={reset}
                >
                  <RotateCcw className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </RestTimerContext.Provider>
  );
}
