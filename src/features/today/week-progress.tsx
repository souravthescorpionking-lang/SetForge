"use client";

// WeekProgressCard — "This week" training-goal card for the Today view.
// Shows a progress ring (workouts done vs the weekly target from settings),
// a 7-day dot strip (trained days filled, today highlighted) and compact
// volume/sets totals for the week. Renders nothing when the target is 0
// (goal off). Clicking navigates to Insights.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Flame, Layers } from "lucide-react";
import { workoutsApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import { addDaysKey, dayKeyOf, parseDayKey, round1, todayKey } from "@/lib/client/format";
import { cn } from "@/lib/utils";

const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

function compact(n: number): string {
  if (n >= 10_000) return `${round1(n / 1000)}k`;
  return round1(n);
}

export function WeekProgressCard({
  target,
  weekStart,
  onOpenInsights,
}: {
  target: number;
  weekStart: number;
  onOpenInsights: () => void;
}) {
  const today = todayKey();

  // ---- current week bounds (UTC day keys, honouring weekStart) ----
  const { fromKey, days } = useMemo(() => {
    const dow = parseDayKey(today).getUTCDay(); // 0=Sun … 6=Sat
    const offset = weekStart === 0 ? dow : (dow + 6) % 7; // days since week start
    const from = addDaysKey(today, -offset);
    const list = Array.from({ length: 7 }, (_, i) => addDaysKey(from, i));
    return { fromKey: from, days: list };
  }, [today, weekStart]);

  const weekQuery = useQuery({
    queryKey: qk.workoutList({ from: fromKey, to: days[6] }),
    queryFn: () => workoutsApi.list({ from: fromKey, to: days[6] }),
    staleTime: 30_000,
  });

  const workouts = weekQuery.data?.workouts ?? [];
  const done = workouts.length;
  const pct = Math.min(1, done / Math.max(1, target));
  const achieved = done >= target;

  const trainedDays = useMemo(() => new Set(workouts.map((w) => dayKeyOf(w.date))), [workouts]);
  const volume = Math.round(workouts.reduce((a, w) => a + w.volume, 0));
  const sets = workouts.reduce((a, w) => a + w.setCount, 0);

  const dayLabels = weekStart === 0 ? ["S", "M", "T", "W", "T", "F", "S"] : ["M", "T", "W", "T", "F", "S", "S"];

  const subtitle = achieved
    ? done === target
      ? "Target hit — anything more is a bonus"
      : `${done - target} bonus workout${done - target === 1 ? "" : "s"} this week`
    : done === 0
      ? "Nothing logged yet this week"
      : `${target - done} to go — you're on track`;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onOpenInsights}
      aria-label={`Weekly goal: ${done} of ${target} workouts. ${subtitle}. Open insights.`}
      className="flex w-full items-center gap-4 rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-colors hover:border-primary/40 sm:p-4"
    >
      {/* progress ring */}
      <div className="relative h-16 w-16 shrink-0" aria-hidden>
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
          <circle cx="32" cy="32" r={RING_R} fill="none" strokeWidth="6" className="stroke-muted" />
          <circle
            cx="32"
            cy="32"
            r={RING_R}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - pct)}
            className={cn("transition-[stroke-dashoffset] duration-500", achieved ? "stroke-emerald-500" : "stroke-primary")}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center">
          {achieved ? (
            <Check className={cn("h-6 w-6", done === target ? "text-emerald-500" : "text-emerald-500")} />
          ) : (
            <span className="numeric text-sm font-black tabular-nums">
              {done}
              <span className="text-muted-foreground">/{target}</span>
            </span>
          )}
        </span>
      </div>

      {/* labels + day strip */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Flame className={cn("h-3.5 w-3.5", achieved ? "text-emerald-500" : "text-primary")} />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">This week</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug">{subtitle}</p>

        <div className="mt-2 flex items-center gap-1.5" aria-hidden>
          {days.map((key, i) => {
            const trained = trainedDays.has(key);
            const isToday = key === today;
            const future = key > today;
            return (
              <span key={key} className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-lg border text-[10px] font-bold transition-colors",
                    trained
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : future
                        ? "border-border/50 text-muted-foreground/40"
                        : "border-border/60 text-muted-foreground",
                    isToday && "ring-2 ring-primary/60 ring-offset-1 ring-offset-card",
                  )}
                >
                  {trained ? <Check className="h-3.5 w-3.5" /> : dayLabels[i]}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* week totals */}
      <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex" aria-hidden>
        {volume > 0 && (
          <span className="numeric rounded-full bg-muted px-2.5 py-1 text-xs font-bold tabular-nums">
            {compact(volume)} kg
          </span>
        )}
        {sets > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
            <Layers className="h-3 w-3" />
            <span className="numeric">{sets}</span>
          </span>
        )}
      </div>
    </motion.button>
  );
}
