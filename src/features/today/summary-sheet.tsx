"use client";

// Workout summary sheet — the celebration + review moment after a session.
// Opens from the header's Finish button: stops the timer (handled by caller),
// then shows totals, per-exercise PR comparisons vs prior bests, a
// shareable text block and a confetti burst when records were set.
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CategoryDot } from "@/components/shared/category-dot";
import {
  ClipboardCopy,
  Dumbbell,
  Flame,
  Layers,
  Route,
  Share2,
  Timer,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { exercisesApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import { formatDayLabel, formatSec, round2, setSummary } from "@/lib/client/format";
import { estOneRm } from "@/lib/formulas";
import type { WorkoutDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

type PrRow = {
  exerciseId: string;
  name: string;
  colour?: string | null;
  priorWeight: number;
  priorReps: number;
  todayWeight: number;
  todayReps: number;
  delta: number;
  e1rmDelta: number;
};

const CONFETTI_COLORS = ["#f97316", "#fbbf24", "#f59e0b", "#fb923c", "#e4e4e7", "#fde68a"];

/** Lightweight confetti burst — brand-palette shards falling from the sheet's top. */
function ConfettiBurst({ count = 34 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100, // % across width
        drift: (Math.random() - 0.5) * 120,
        delay: Math.random() * 0.35,
        dur: 1.8 + Math.random() * 1.2,
        size: 5 + Math.random() * 6,
        rotate: (Math.random() - 0.5) * 720,
        round: Math.random() > 0.7,
        colour: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [count],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0 overflow-visible">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 block"
          style={{ left: `${p.x}%`, width: p.size, height: p.round ? p.size : p.size * 0.45, background: p.colour }}
          initial={{ y: -12, x: 0, opacity: 0, rotate: 0 }}
          animate={{ y: 340, x: p.drift, opacity: [0, 1, 1, 0], rotate: p.rotate }}
          transition={{ duration: p.dur, delay: p.delay, ease: "easeIn", opacity: { delay: p.delay, times: [0, 0.08, 0.75, 1] } }}
        />
      ))}
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border p-3",
        accent ? "border-primary/30 bg-primary/10" : "bg-muted/40",
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </span>
      <span className={cn("numeric text-lg font-black leading-none", accent && "text-primary")}>{value}</span>
    </div>
  );
}

export function SummarySheet({
  open,
  onOpenChange,
  workout,
  dateKey,
  streak,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workout: WorkoutDTO;
  dateKey: string;
  streak?: number | null;
}) {
  const doneSets = useMemo(
    () => workout.exercises.flatMap((we) => we.sets.filter((s) => s.isComplete && !s.isWarmup)),
    [workout],
  );
  const workingSets = useMemo(
    () =>
      workout.exercises.map((we) => ({
        we,
        sets: we.sets.filter((s) => s.isComplete && !s.isWarmup),
      })),
    [workout],
  );

  // records for every exercise that has weight×reps sets → PR comparison
  const prCandidates = workingSets.filter(({ sets }) => sets.some((s) => s.weight != null && s.reps != null));
  const recordsQueries = useQueries({
    queries: prCandidates.map(({ we }) => ({
      queryKey: qk.exerciseRecords(we.exerciseId),
      queryFn: () => exercisesApi.records(we.exerciseId),
      staleTime: 60_000,
    })),
  });

  const recordsKey = recordsQueries.map((q) => (q.data ? "1" : "0")).join("");
  const prRows = useMemo<PrRow[]>(() => {
    const rows: PrRow[] = [];
    prCandidates.forEach(({ we, sets }, i) => {
      const recs = recordsQueries[i].data;
      if (!recs) return;
      // best set today (max weight, tie → max reps)
      let today = sets[0];
      for (const s of sets) {
        if (s.weight == null || s.reps == null) continue;
        if (!today || (s.weight ?? 0) > (today.weight ?? 0) || (s.weight === today.weight && (s.reps ?? 0) > (today.reps ?? 0))) {
          today = s;
        }
      }
      if (!today || today.weight == null || today.reps == null) return;
      // prior best (records strictly before this workout's date)
      const prior = recs.actual.filter((r) => r.date < workout.date);
      let priorBest: { weight: number; reps: number } | null = null;
      for (const r of prior) {
        if (
          !priorBest ||
          r.weight > priorBest.weight ||
          (r.weight === priorBest.weight && r.reps > priorBest.reps)
        ) {
          priorBest = { weight: r.weight, reps: r.reps };
        }
      }
      const isPr =
        !priorBest ||
        today.weight > priorBest.weight ||
        (today.weight === priorBest.weight && today.reps > priorBest.reps);
      if (!isPr || !priorBest) return;
      rows.push({
        exerciseId: we.exerciseId,
        name: we.exercise.name,
        colour: we.exercise.category?.colour,
        priorWeight: priorBest.weight,
        priorReps: priorBest.reps,
        todayWeight: today.weight,
        todayReps: today.reps ?? 0,
        delta: Math.round((today.weight - priorBest.weight) * 10) / 10,
        e1rmDelta: Math.round((estOneRm(today.weight, today.reps) - estOneRm(priorBest.weight, priorBest.reps)) * 10) / 10,
      });
    });
    return rows;
  }, [workout, recordsKey]);

  // headline totals (performed work only)
  const volume = doneSets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
  const reps = doneSets.reduce((sum, s) => sum + (s.reps ?? 0), 0);
  const distance = doneSets.reduce((sum, s) => sum + (s.distance ?? 0), 0);
  const timeSec = doneSets.reduce((sum, s) => sum + (s.timeSec ?? 0), 0);
  const durationSec =
    workout.startAt ?
      Math.max(
        0,
        ((workout.endAt ? new Date(workout.endAt).getTime() : Date.now()) - new Date(workout.startAt).getTime()) / 1000,
      )
    : 0;
  const exCount = workingSets.filter(({ sets }) => sets.length > 0).length;

  const hasPrs = prRows.length > 0;

  const copySummary = async () => {
    const lines: string[] = [];
    lines.push(`SetForge — ${workout.comment || formatDayLabel(dateKey)} (${formatDayLabel(dateKey)})`);
    const bits = [`${exCount} exercises`, `${doneSets.length} sets`];
    if (volume > 0) bits.push(`${Math.round(volume).toLocaleString()} kg`);
    if (durationSec > 0) bits.push(formatSec(Math.floor(durationSec)));
    if (distance > 0) bits.push(`${round2(distance)} km`);
    lines.push(bits.join(" · "));
    if (hasPrs) {
      lines.push("PRs:");
      for (const p of prRows) lines.push(`  🏆 ${p.name}: ${p.todayWeight}kg × ${p.todayReps} (was ${p.priorWeight}kg × ${p.priorReps})`);
    }
    if (streak && streak > 0) lines.push(`🔥 ${streak}-day streak`);
    const text = lines.join("\n");
    // Web Share API when available (native share sheet), clipboard fallback.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "SetForge workout", text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // user dismissed
        // other failures fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Summary copied to clipboard");
    } catch {
      toast.error("Could not access the clipboard");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[92vh] w-full flex-col gap-0 overflow-y-auto rounded-t-3xl p-0 sm:max-w-2xl sm:rounded-b-3xl scroll-slim"
      >
        {hasPrs && open && <ConfettiBurst />}
        <SheetHeader className="space-y-0 border-b bg-gradient-to-b from-primary/10 to-transparent p-5 pb-4 text-left sm:rounded-t-3xl">
          <div className="flex items-center gap-3">
            <motion.span
              initial={{ scale: 0.4, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 16 }}
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                hasPrs ? "bg-amber-500/20 text-amber-500" : "bg-primary/15 text-primary",
              )}
            >
              {hasPrs ? <Trophy className="h-6 w-6" /> : <Flame className="h-6 w-6" />}
            </motion.span>
            <div className="min-w-0">
              <SheetTitle className="text-lg font-black tracking-tight">
                {hasPrs ? "Session forged — records fell!" : "Session forged!"}
              </SheetTitle>
              <SheetDescription className="mt-0.5 text-sm">
                {formatDayLabel(dateKey)}
                {durationSec > 0 && (
                  <>
                    {" · "}
                    <span className="numeric font-semibold text-foreground/80">{formatSec(Math.floor(durationSec))}</span>
                  </>
                )}
                {streak != null && streak > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      <span className="numeric">{streak}</span>-day streak 🔥
                    </span>
                  </>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5 p-5">
          {/* totals */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 [&>*:nth-child(odd):last-child]:col-span-2">
            {volume > 0 && (
              <StatTile icon={<Dumbbell className="h-3.5 w-3.5" />} label="Volume" value={`${Math.round(volume).toLocaleString()} kg`} accent />
            )}
            <StatTile icon={<Layers className="h-3.5 w-3.5" />} label="Sets" value={String(doneSets.length)} />
            {reps > 0 && <StatTile icon={<Zap className="h-3.5 w-3.5" />} label="Reps" value={String(reps)} />}
            {timeSec > 0 ? (
              <StatTile icon={<Timer className="h-3.5 w-3.5" />} label="Work time" value={formatSec(timeSec)} />
            ) : durationSec > 0 ? (
              <StatTile icon={<Timer className="h-3.5 w-3.5" />} label="Duration" value={formatSec(Math.floor(durationSec))} />
            ) : null}
            {distance > 0 && <StatTile icon={<Route className="h-3.5 w-3.5" />} label="Distance" value={`${round2(distance)} km`} />}
          </div>

          {/* PRs */}
          {hasPrs ? (
            <section aria-label="Personal records this session">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Trophy className="h-4 w-4 text-amber-500" /> New personal records
              </h3>
              <ul className="space-y-2">
                {prRows.map((p, i) => (
                  <motion.li
                    key={p.exerciseId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.08, type: "spring", stiffness: 400, damping: 28 }}
                    className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                      <Trophy className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-bold">
                        <CategoryDot colour={p.colour ?? null} />
                        {p.name}
                      </p>
                      <p className="numeric mt-0.5 text-xs text-muted-foreground">
                        <span className="line-through decoration-muted-foreground/50">
                          {p.priorWeight}kg × {p.priorReps}
                        </span>{" "}
                        → <span className="font-bold text-foreground">{p.todayWeight}kg × {p.todayReps}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      {p.delta > 0 && (
                        <span className="numeric rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                          +{p.delta} kg
                        </span>
                      )}
                      {p.e1rmDelta > 0 && (
                        <span className="numeric text-[10px] font-semibold text-muted-foreground">
                          e1RM +{p.e1rmDelta}
                        </span>
                      )}
                    </div>
                  </motion.li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="rounded-xl border border-dashed p-3.5 text-center text-sm text-muted-foreground">
              No records this session — show up, log honestly, and they&apos;ll come. 💪
            </p>
          )}

          {/* per-exercise breakdown */}
          {exCount > 0 && (
            <section aria-label="Exercises in this session">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-primary" /> Exercises
              </h3>
              <ul className="divide-y divide-border/60 rounded-xl border">
                {workingSets
                  .filter(({ sets }) => sets.length > 0)
                  .map(({ we, sets }) => {
                    const vol = sets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
                    const top = [...sets].sort(
                      (a, b) => (b.weight ?? 0) - (a.weight ?? 0) || (b.reps ?? 0) - (a.reps ?? 0),
                    )[0];
                    return (
                      <li key={we.id} className="flex items-center gap-3 px-3 py-2.5">
                        <CategoryDot colour={we.exercise.category?.colour ?? null} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{we.exercise.name}</p>
                          <p className="numeric text-xs text-muted-foreground">
                            {sets.length} sets{vol > 0 ? ` · ${Math.round(vol).toLocaleString()} kg` : ""}
                            {top && top.weight != null ? ` · top ${setSummary(top)}` : ""}
                          </p>
                        </div>
                        {prRows.some((p) => p.exerciseId === we.exerciseId) && (
                          <Trophy className="h-4 w-4 shrink-0 text-amber-500" aria-label="PR" />
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}
        </div>

        <div className="sticky bottom-0 mt-auto flex gap-2 border-t bg-background/95 p-4 backdrop-blur-md">
          <Button variant="secondary" className="h-12 flex-1 rounded-xl border font-semibold" onClick={() => void copySummary()}>
            {typeof navigator.share === "function" ? (
              <>
                <Share2 className="h-4.5 w-4.5" /> Share summary
              </>
            ) : (
              <>
                <ClipboardCopy className="h-4.5 w-4.5" /> Copy summary
              </>
            )}
          </Button>
          <Button className="h-12 flex-1 rounded-xl text-base font-bold shadow-lg shadow-primary/25" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
