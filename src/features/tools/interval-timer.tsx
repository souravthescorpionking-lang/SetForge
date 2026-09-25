"use client";

// Interval / HIIT timer — Tabata, EMOM & custom intervals.
// Fully client-side engine (drift-corrected from wall-clock), Web Audio cues,
// haptics and a screen wake-lock while running.
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Stepper } from "@/components/shared/stepper";
import { cn } from "@/lib/utils";
import {
  Bell,
  BellOff,
  FastForward,
  Pause,
  Play,
  RotateCcw,
  Timer as TimerIcon,
  Trophy,
  Vibrate,
  VibrateOff,
  Zap,
} from "lucide-react";

// ---------- types ----------
type Phase = "prepare" | "work" | "rest" | "done";
type Status = "idle" | "running" | "paused";

type Config = {
  prepareSec: number;
  workSec: number;
  restSec: number;
  rounds: number;
};

type Preset = { id: string; name: string; hint: string; config: Config };

const PRESETS: Preset[] = [
  { id: "tabata", name: "Tabata", hint: "20/10 × 8", config: { prepareSec: 10, workSec: 20, restSec: 10, rounds: 8 } },
  { id: "emom", name: "EMOM 10", hint: "60/0 × 10", config: { prepareSec: 10, workSec: 60, restSec: 0, rounds: 10 } },
  { id: "hiit", name: "HIIT", hint: "40/20 × 8", config: { prepareSec: 15, workSec: 40, restSec: 20, rounds: 8 } },
  { id: "sprints", name: "Sprints", hint: "30/60 × 6", config: { prepareSec: 10, workSec: 30, restSec: 60, rounds: 6 } },
  { id: "custom", name: "Custom", hint: "your mix", config: { prepareSec: 10, workSec: 45, restSec: 15, rounds: 5 } },
];

const PHASE_STYLE: Record<Phase, { label: string; ring: string; text: string; chip: string }> = {
  prepare: { label: "Get ready", ring: "stroke-amber-500", text: "text-amber-500", chip: "bg-amber-500/15 text-amber-500" },
  work: { label: "Work", ring: "stroke-primary", text: "text-primary", chip: "bg-primary/15 text-primary" },
  rest: { label: "Rest", ring: "stroke-emerald-500", text: "text-emerald-500", chip: "bg-emerald-500/15 text-emerald-500" },
  done: { label: "Complete", ring: "stroke-primary", text: "text-primary", chip: "bg-primary/15 text-primary" },
};

// ---------- audio ----------
function useBeep(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  const ctx = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const beep = useCallback(
    (freq: number, dur: number, when = 0, gain = 0.12) => {
      if (!enabled) return;
      const ac = ctx();
      if (!ac) return;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ac.currentTime + when;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(ac.destination);
      osc.start(t);
      osc.stop(t + dur);
    },
    [ctx, enabled],
  );

  return { beep, warmupAudio: ctx };
}

function useVibrate(enabled: boolean) {
  return useCallback(
    (pattern: number | number[]) => {
      if (!enabled || typeof navigator === "undefined" || !navigator.vibrate) return;
      navigator.vibrate(pattern);
    },
    [enabled],
  );
}

/** Keeps the screen awake while active (re-acquires on tab visibility). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        if (cancelled) return;
        lock = await navigator.wakeLock.request("screen");
      } catch {
        /* wake lock is best-effort */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}

// ---------- engine ----------
type Engine = {
  phase: Phase;
  round: number; // 1-based, 0 while preparing
  phaseEndsAt: number; // epoch ms
  phaseTotal: number; // ms
};

export function IntervalTimer() {
  const [presetId, setPresetId] = useState("tabata");
  const [config, setConfig] = useState<Config>(PRESETS[0].config);
  const [status, setStatus] = useState<Status>("idle");
  const [phase, setPhase] = useState<Phase>("prepare");
  const [round, setRound] = useState(0);
  const [remaining, setRemaining] = useState(PRESETS[0].config.prepareSec);
  const [phaseTotalSec, setPhaseTotalSec] = useState(PRESETS[0].config.prepareSec);
  const [elapsedTotal, setElapsedTotal] = useState(0);
  const [sound, setSound] = useState(true);
  const [haptics, setHaptics] = useState(true);

  const engineRef = useRef<Engine | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const beepedRef = useRef<Set<number>>(new Set());
  const elapsedAtRef = useRef(0); // total elapsed ms when engine last ran
  const engineStartRef = useRef(0); // wall clock when engine (re)started — for elapsed

  const { beep, warmupAudio } = useBeep(sound);
  const vibrate = useVibrate(haptics);
  useWakeLock(status === "running");

  const totalSec = config.prepareSec + config.rounds * config.workSec + Math.max(0, config.rounds - 1) * config.restSec;
  const totalMs = totalSec * 1000;

  const stopTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const enterPhase = useCallback(
    (next: Phase, nextRound: number, now: number) => {
      const durMs =
        next === "prepare" ? config.prepareSec * 1000 : next === "work" ? config.workSec * 1000 : next === "rest" ? config.restSec * 1000 : 0;
      engineRef.current = { phase: next, round: nextRound, phaseEndsAt: now + durMs, phaseTotal: durMs };
      beepedRef.current = new Set();
      setPhase(next);
      setRound(nextRound);
      setRemaining(Math.ceil(durMs / 1000));
      setPhaseTotalSec(Math.max(1, Math.round(durMs / 1000)));

      if (next === "work") {
        beep(880, 0.35, 0, 0.16);
        vibrate(200);
      } else if (next === "rest") {
        beep(440, 0.3, 0, 0.14);
        vibrate([120, 60, 120]);
      } else if (next === "prepare") {
        beep(660, 0.2, 0, 0.12);
      }
    },
    [config, beep, vibrate],
  );

  const tick = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const now = Date.now();
    const remainMs = Math.max(0, eng.phaseEndsAt - now);
    const remainSec = Math.ceil(remainMs / 1000);
    setRemaining(remainSec);
    setElapsedTotal(elapsedAtRef.current + (now - engineStartRef.current));

    // countdown cues at 3/2/1
    if (remainSec <= 3 && remainSec > 0 && !beepedRef.current.has(remainSec)) {
      beepedRef.current.add(remainSec);
      beep(520, 0.08, 0, 0.1);
    }

    if (remainMs === 0) {
      // advance
      if (eng.phase === "prepare") {
        enterPhase("work", 1, now);
      } else if (eng.phase === "work") {
        if (eng.round >= config.rounds) {
          // finished
          engineRef.current = null;
          setPhase("done");
          setRemaining(0);
          setStatus("idle");
          stopTick();
          elapsedAtRef.current = 0;
          beep(880, 0.25, 0, 0.15);
          beep(1100, 0.35, 0.3, 0.15);
          beep(1320, 0.5, 0.7, 0.16);
          vibrate([300, 100, 300]);
          return;
        }
        enterPhase(config.restSec > 0 ? "rest" : "work", eng.round + (config.restSec > 0 ? 0 : 1), now);
      } else if (eng.phase === "rest") {
        enterPhase("work", eng.round + 1, now);
      }
    }
  }, [config, enterPhase, beep, vibrate]);

  const start = () => {
    warmupAudio(); // user gesture → unlock audio
    const now = Date.now();
    engineStartRef.current = now;
    elapsedAtRef.current = 0;
    enterPhase(config.prepareSec > 0 ? "prepare" : "work", config.prepareSec > 0 ? 0 : 1, now);
    setStatus("running");
    stopTick();
    tickRef.current = setInterval(tick, 100);
  };

  const pause = () => {
    const eng = engineRef.current;
    if (!eng) return;
    stopTick();
    const remainMs = Math.max(0, eng.phaseEndsAt - Date.now());
    elapsedAtRef.current += Date.now() - engineStartRef.current;
    eng.phaseEndsAt = -1; // paused marker
    (eng as Engine & { pausedRemainMs?: number }).pausedRemainMs = remainMs;
    setStatus("paused");
  };

  const resume = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const remainMs = (eng as Engine & { pausedRemainMs?: number }).pausedRemainMs ?? 0;
    const now = Date.now();
    engineStartRef.current = now;
    eng.phaseEndsAt = now + remainMs;
    setStatus("running");
    stopTick();
    tickRef.current = setInterval(tick, 100);
  };

  const skipPhase = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const now = Date.now();
    if (eng.phase === "prepare") {
      enterPhase("work", 1, now);
    } else if (eng.phase === "work") {
      if (eng.round >= config.rounds) {
        engineRef.current = null;
        setPhase("done");
        setStatus("idle");
        stopTick();
        return;
      }
      if (config.restSec > 0) enterPhase("rest", eng.round, now);
      else enterPhase("work", eng.round + 1, now);
    } else {
      enterPhase("work", eng.round + 1, now);
    }
  };

  const reset = () => {
    stopTick();
    engineRef.current = null;
    elapsedAtRef.current = 0;
    setStatus("idle");
    setPhase("prepare");
    setRound(0);
    setRemaining(config.prepareSec);
    setPhaseTotalSec(Math.max(1, config.prepareSec));
    setElapsedTotal(0);
  };

  useEffect(() => stopTick, []);

  // preset selection (resets the timer)
  const applyPreset = (p: Preset) => {
    reset();
    setPresetId(p.id);
    setConfig(p.config);
    setRemaining(p.config.prepareSec);
    setPhaseTotalSec(Math.max(1, p.config.prepareSec));
  };

  // ring geometry
  const R = 120;
  const C = 2 * Math.PI * R;
  const phaseTotalMs = phaseTotalSec * 1000;
  const phaseFrac =
    status === "idle" && phase === "prepare" ? 1 : phase === "done" ? 1 : Math.min(1, Math.max(0, (remaining * 1000) / phaseTotalMs));
  const dash = C * (1 - phaseFrac);

  const mmss = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const style = PHASE_STYLE[phase];
  const running = status === "running";
  const currentRound = phase === "done" ? config.rounds : phase === "rest" ? round + 1 : Math.max(1, round || 1);

  return (
    <div className="space-y-4">
      {/* config card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TimerIcon className="h-4.5 w-4.5 text-primary" /> Interval timer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-5 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  "flex min-h-[54px] flex-col items-center justify-center rounded-xl border px-1 py-2 transition-colors",
                  presetId === p.id
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border hover:bg-accent text-foreground/80",
                )}
                aria-pressed={presetId === p.id}
              >
                <span className="text-xs font-bold leading-tight">{p.name}</span>
                <span className="numeric mt-0.5 text-[10px] text-muted-foreground">{p.hint}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Prepare (s)</Label>
              <div className="mt-1.5">
                <Stepper
                  value={config.prepareSec}
                  onChange={(v) => setConfig((c) => ({ ...c, prepareSec: Math.max(0, v ?? 0) }))}
                  step={5}
                  min={0}
                  max={300}
                  decimals={0}
                  ariaLabel="prepare seconds"
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Work (s)</Label>
              <div className="mt-1.5">
                <Stepper
                  value={config.workSec}
                  onChange={(v) => setConfig((c) => ({ ...c, workSec: Math.max(5, v ?? 5) }))}
                  step={5}
                  min={5}
                  max={3600}
                  decimals={0}
                  ariaLabel="work seconds"
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Rest (s)</Label>
              <div className="mt-1.5">
                <Stepper
                  value={config.restSec}
                  onChange={(v) => setConfig((c) => ({ ...c, restSec: Math.max(0, v ?? 0) }))}
                  step={5}
                  min={0}
                  max={1800}
                  decimals={0}
                  ariaLabel="rest seconds"
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Rounds</Label>
              <div className="mt-1.5">
                <Stepper
                  value={config.rounds}
                  onChange={(v) => setConfig((c) => ({ ...c, rounds: Math.max(1, v ?? 1) }))}
                  step={1}
                  min={1}
                  max={50}
                  decimals={0}
                  ariaLabel="rounds"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked={sound} onCheckedChange={setSound} aria-label="sound cues" />
              {sound ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
              Sound cues
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked={haptics} onCheckedChange={setHaptics} aria-label="vibration" />
              {haptics ? <Vibrate className="h-4 w-4 text-primary" /> : <VibrateOff className="h-4 w-4 text-muted-foreground" />}
              Vibration
            </label>
            <span className="numeric ml-auto text-xs text-muted-foreground">
              total {mmss(totalSec)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* timer card */}
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center gap-5 p-5 sm:p-8">
          {/* round dots */}
          <div className="flex w-full max-w-md items-center gap-1" aria-hidden>
            {Array.from({ length: config.rounds }, (_, i) => {
              const n = i + 1;
              const done = phase === "done" || n < currentRound || (n === currentRound && phase === "rest");
              const current = n === currentRound && (running || status === "paused") && phase !== "done";
              return (
                <span
                  key={n}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    done ? "bg-primary" : current ? "bg-primary/50" : "bg-muted",
                  )}
                />
              );
            })}
          </div>

          {/* ring */}
          <div className="relative aspect-square w-full max-w-[280px]">
            <svg viewBox="0 0 300 300" className="h-full w-full -rotate-90">
              <circle cx="150" cy="150" r={R} className="fill-none stroke-muted/40" strokeWidth="14" />
              <circle
                cx="150"
                cy="150"
                r={R}
                className={cn("fill-none transition-[stroke-dashoffset] duration-100 ease-linear", style.ring)}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={dash}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.span
                  key={phase}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className={cn("rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest", style.chip)}
                >
                  {style.label}
                </motion.span>
              </AnimatePresence>
              <span className={cn("numeric mt-1 text-6xl font-black tabular-nums tracking-tight sm:text-7xl", phase === "done" ? "text-primary" : "text-foreground")}>
                {phase === "done" ? <Trophy className="mx-auto h-16 w-16" /> : remaining}
              </span>
              {phase !== "done" && (
                <span className="numeric mt-1 text-xs font-semibold text-muted-foreground">
                  round {Math.max(currentRound, 1)} / {config.rounds}
                </span>
              )}
            </div>
          </div>

          {/* elapsed */}
          <div className="numeric flex w-full max-w-md items-center justify-between text-xs font-medium text-muted-foreground">
            <span>elapsed {mmss(Math.floor(elapsedTotal / 1000))}</span>
            <span>{mmss(totalSec)} planned</span>
          </div>

          {/* controls */}
          <div className="flex w-full max-w-md items-center gap-2">
            {status === "idle" ? (
              <Button
                size="lg"
                className="h-13 flex-1 rounded-xl text-base font-bold shadow-lg shadow-primary/25"
                onClick={start}
              >
                <Play className="h-5 w-5" /> {phase === "done" ? "Go again" : "Start"}
              </Button>
            ) : running ? (
              <Button
                size="lg"
                variant="outline"
                className="h-13 flex-1 rounded-xl border text-base font-bold"
                onClick={pause}
              >
                <Pause className="h-5 w-5" /> Pause
              </Button>
            ) : (
              <Button
                size="lg"
                className="h-13 flex-1 rounded-xl text-base font-bold shadow-lg shadow-primary/25"
                onClick={resume}
              >
                <Play className="h-5 w-5" /> Resume
              </Button>
            )}
            {(running || status === "paused") && (
              <Button
                size="lg"
                variant="outline"
                className="h-13 rounded-xl px-4"
                onClick={skipPhase}
                aria-label="Skip phase"
                title="Skip to next phase"
              >
                <FastForward className="h-5 w-5" />
              </Button>
            )}
            <Button
              size="lg"
              variant="outline"
              className="h-13 rounded-xl px-4"
              onClick={reset}
              aria-label="Reset timer"
              title="Reset"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
          </div>

          <p className="flex items-center gap-1.5 text-center text-[11px] text-muted-foreground">
            <Zap className="h-3 w-3 text-amber-500" />
            Screen stays awake while the timer runs · beeps at 3-2-1 and phase changes
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
