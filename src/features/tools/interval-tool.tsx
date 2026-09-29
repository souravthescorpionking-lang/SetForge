"use client";

// ─────────────────────────────────────────────────────────────────────────────
// IntervalTool — inline expansion of the Interval timer row on #/tools.
// work / rest / rounds (+ prepare) with start / pause / reset and a live
// countdown. Engine ported from the legacy interval-timer: wall-clock
// drift-corrected phases (phaseEndsAt epoch ms), Web Audio cues, haptics,
// wake-lock while running.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWakeLock } from "@/features/settings/use-wake-lock";
import { FieldRow, PanelNote, ToolPanel, parseNum } from "./tool-bits";

type Phase = "prepare" | "work" | "rest" | "done";
type Status = "idle" | "running" | "paused";

type Engine = {
  phase: Phase;
  round: number; // 1-based, 0 while preparing
  phaseEndsAt: number; // epoch ms; -1 while paused
  phaseTotal: number; // ms
};

const PHASE_META: Record<Phase, { label: string; text: string }> = {
  prepare: { label: "Get ready", text: "text-amber-500" },
  work: { label: "Work", text: "text-primary" },
  rest: { label: "Rest", text: "text-emerald-500" },
  done: { label: "Complete", text: "text-primary" },
};

// ---------- audio / haptics (ported from legacy) ----------
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

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function IntervalTool() {
  // config (drafts while idle; engine reads committed numbers)
  const [prepareRaw, setPrepareRaw] = useState("10");
  const [workRaw, setWorkRaw] = useState("20");
  const [restRaw, setRestRaw] = useState("10");
  const [roundsRaw, setRoundsRaw] = useState("8");

  const prepareSec = Math.max(0, Math.round(parseNum(prepareRaw) ?? 0));
  const workSec = Math.max(1, Math.round(parseNum(workRaw) ?? 1));
  const restSec = Math.max(0, Math.round(parseNum(restRaw) ?? 0));
  const rounds = Math.max(1, Math.min(50, Math.round(parseNum(roundsRaw) ?? 1)));

  const [status, setStatus] = useState<Status>("idle");
  const [phase, setPhase] = useState<Phase>("prepare");
  const [round, setRound] = useState(0);
  const [remaining, setRemaining] = useState(prepareSec);
  const [elapsed, setElapsed] = useState(0);

  const engineRef = useRef<Engine | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const beepedRef = useRef<Set<number>>(new Set());
  const cfgRef = useRef({ prepareSec, workSec, restSec, rounds });
  // keep the engine's config snapshot in sync (fields are disabled while
  // running, so this only changes while idle)
  useEffect(() => {
    cfgRef.current = { prepareSec, workSec, restSec, rounds };
  }, [prepareSec, workSec, restSec, rounds]);

  const { beep, warmupAudio } = useBeep(true);
  const vibrate = useVibrate(true);
  useWakeLock(status === "running");

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const enterPhase = useCallback(
    (next: Phase, nextRound: number, now: number) => {
      const cfg = cfgRef.current;
      const durMs =
        next === "prepare" ? cfg.prepareSec * 1000 : next === "work" ? cfg.workSec * 1000 : next === "rest" ? cfg.restSec * 1000 : 0;
      engineRef.current = { phase: next, round: nextRound, phaseEndsAt: now + durMs, phaseTotal: durMs };
      beepedRef.current = new Set();
      setPhase(next);
      setRound(nextRound);
      setRemaining(Math.ceil(durMs / 1000));
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
    [beep, vibrate],
  );

  const finish = useCallback(() => {
    engineRef.current = null;
    setPhase("done");
    setRemaining(0);
    setStatus("idle");
    stopTick();
    beep(880, 0.25, 0, 0.15);
    beep(1100, 0.35, 0.3, 0.15);
    beep(1320, 0.5, 0.7, 0.16);
    vibrate([300, 100, 300]);
  }, [beep, vibrate, stopTick]);

  const tick = useCallback(() => {
    const eng = engineRef.current;
    const cfg = cfgRef.current;
    if (!eng || eng.phaseEndsAt < 0) return;
    const now = Date.now();
    const remainMs = Math.max(0, eng.phaseEndsAt - now);
    const remainSec = Math.ceil(remainMs / 1000);
    setRemaining(remainSec);
    setElapsed((e) => e + 0.1);

    // countdown cues at 3/2/1
    if (remainSec <= 3 && remainSec > 0 && !beepedRef.current.has(remainSec)) {
      beepedRef.current.add(remainSec);
      beep(520, 0.08, 0, 0.1);
    }

    if (remainMs === 0) {
      if (eng.phase === "prepare") {
        enterPhase("work", 1, now);
      } else if (eng.phase === "work") {
        if (eng.round >= cfg.rounds) {
          finish();
          return;
        }
        enterPhase(cfg.restSec > 0 ? "rest" : "work", eng.round + (cfg.restSec > 0 ? 0 : 1), now);
      } else if (eng.phase === "rest") {
        enterPhase("work", eng.round + 1, now);
      }
    }
  }, [enterPhase, finish, beep]);

  const start = () => {
    warmupAudio(); // user gesture → unlock audio
    const now = Date.now();
    setElapsed(0);
    enterPhase(cfgRef.current.prepareSec > 0 ? "prepare" : "work", cfgRef.current.prepareSec > 0 ? 0 : 1, now);
    setStatus("running");
    stopTick();
    tickRef.current = setInterval(tick, 100);
  };

  const pause = () => {
    const eng = engineRef.current;
    if (!eng) return;
    stopTick();
    const remainMs = Math.max(0, eng.phaseEndsAt - Date.now());
    (eng as Engine & { pausedRemainMs?: number }).pausedRemainMs = remainMs;
    eng.phaseEndsAt = -1; // paused marker
    setStatus("paused");
  };

  const resume = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const remainMs = (eng as Engine & { pausedRemainMs?: number }).pausedRemainMs ?? 0;
    eng.phaseEndsAt = Date.now() + remainMs;
    setStatus("running");
    stopTick();
    tickRef.current = setInterval(tick, 100);
  };

  const skipPhase = () => {
    const eng = engineRef.current;
    const cfg = cfgRef.current;
    if (!eng) return;
    const now = Date.now();
    if (eng.phase === "prepare") {
      enterPhase("work", 1, now);
    } else if (eng.phase === "work") {
      if (eng.round >= cfg.rounds) {
        finish();
        return;
      }
      if (cfg.restSec > 0) enterPhase("rest", eng.round, now);
      else enterPhase("work", eng.round + 1, now);
    } else {
      enterPhase("work", eng.round + 1, now);
    }
  };

  const reset = () => {
    stopTick();
    engineRef.current = null;
    setStatus("idle");
    setPhase("prepare");
    setRound(0);
    setRemaining(cfgRef.current.prepareSec);
    setElapsed(0);
  };

  useEffect(() => stopTick, [stopTick]);

  const totalSec = prepareSec + rounds * workSec + Math.max(0, rounds - 1) * restSec;
  const meta = PHASE_META[phase];
  const currentRound = phase === "done" ? rounds : phase === "rest" ? round + 1 : Math.max(1, round || 1);
  const running = status === "running";

  return (
    <ToolPanel label="Interval timer">
      <FieldRow label="Prepare (s)" value={prepareRaw} onChange={setPrepareRaw} min={0} max={300} step={1} disabled={running} ariaLabel="Prepare seconds" />
      <FieldRow label="Work (s)" value={workRaw} onChange={setWorkRaw} min={1} max={600} step={1} disabled={running} ariaLabel="Work seconds" />
      <FieldRow label="Rest (s)" value={restRaw} onChange={setRestRaw} min={0} max={600} step={1} disabled={running} ariaLabel="Rest seconds" />
      <FieldRow label="Rounds" value={roundsRaw} onChange={setRoundsRaw} min={1} max={50} step={1} disabled={running} ariaLabel="Rounds" />

      {/* live status — 72px hero row */}
      <div
        data-row
        className="flex h-18 items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg border border-border/60 bg-card px-3"
        aria-live="polite"
        aria-label="Timer status"
      >
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-xs font-bold uppercase tracking-wider", meta.text)}>{meta.label}</p>
          <p className="truncate text-xs text-muted-foreground">
            Round {Math.min(currentRound, rounds)}/{rounds} · {mmss(Math.round(elapsed))} elapsed
          </p>
        </div>
        <span className={cn("flex-none text-4xl font-black tabular-nums", meta.text)}>
          {phase === "done" ? "✓" : mmss(remaining)}
        </span>
      </div>

      {/* controls — 56px row */}
      <div data-row className="flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap">
        <Button
          type="button"
          className="h-12 flex-1 rounded-lg font-bold"
          tour={{ id: "tools.timerStart", label: "Start timer", help: "Run the interval timer with beeps and wake-lock.", order: 50 }}
          onClick={() => (status === "idle" || phase === "done" ? start() : running ? pause() : resume())}
          aria-label={running ? "Pause timer" : status === "paused" ? "Resume timer" : "Start timer"}
        >
          {running ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {running ? "Pause" : status === "paused" ? "Resume" : "Start"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 flex-1 rounded-lg"
          tour={{ id: "tools.timerSkip", label: "Skip phase", help: "Jump straight to the next work or rest phase.", order: 60 }}
          onClick={skipPhase}
          disabled={status === "idle"}
          aria-label="Skip to next phase"
        >
          <SkipForward className="h-4 w-4" aria-hidden /> Skip
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-12 flex-1 rounded-lg"
          tour={{ id: "tools.timerReset", label: "Reset timer", help: "Stop and reset the timer to its configuration.", order: 70 }}
          onClick={reset}
          aria-label="Reset timer"
        >
          <RotateCcw className="h-4 w-4" aria-hidden /> Reset
        </Button>
      </div>

      <PanelNote>
        {workSec}/{restSec} × {rounds}
        {prepareSec > 0 ? ` (+${prepareSec}s prepare)` : ""} · total {mmss(totalSec)} · beeps and
        wake-lock while running.
      </PanelNote>
    </ToolPanel>
  );
}
