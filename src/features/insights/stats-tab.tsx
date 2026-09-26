"use client";

// ─────────────────────────────────────────────────────────────────────────────
// StatsTab — STATS tab of #/insights (Part 3 p3-7). No KPI cards: the legacy
// kpi-card / weekly-rhythm / volume-chart DATA is ported into 40px table rows
// (metric name | value | trend) grouped by 32px section headers:
//
//   PERIOD        — workouts, sets, volume, reps, time, distance, streak,
//                   heaviest set, top volume day (GET /api/stats?period=)
//   THIS WEEK     — rolling 7-day this-week-vs-last deltas + session pace
//   WEEKLY RHYTHM — avg volume per weekday over the last 8 weeks
//   VOLUME BY EX  — top exercises by volume in the period
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { statsApi, workoutsApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import { addDaysKey, dayKeyOf, formatDayShort, parseDayKey, round1, round2, todayKey } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import type { WorkoutSummaryDTO } from "@/lib/types";

export type StatsPeriod = "week" | "month" | "year" | "all";

export const STATS_PERIODS: Array<{ value: StatsPeriod; label: string }> = [
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
  { value: "year", label: "1 year" },
  { value: "all", label: "All time" },
];

const PERIOD_LABEL: Record<StatsPeriod, string> = {
  week: "7 days",
  month: "30 days",
  year: "1 year",
  all: "all time",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Weekdays considered for the rhythm averages (≈ 2 months). */
const RHYTHM_WEEKS = 8;

type Trend = { text: string; dir: "up" | "down" | "same" };
type StatRow = { name: string; value: string; trend?: Trend };

/** Compact display for big numbers: 427669 → 427.7k, 1322136 → 1.32M */
function compact(n: number): string {
  if (n >= 1_000_000) return `${round2(n / 1_000_000)}M`;
  if (n >= 10_000) return `${round1(n / 1000)}k`;
  return round1(n);
}

/** Compact duration: 61440s → "17h 04m", 810s → "13:30". */
function compactDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function weekTrend(thisW: number, lastW: number): Trend {
  const delta = Math.round((thisW - lastW) * 10) / 10;
  if (lastW === 0) {
    return delta > 0 ? { text: "new this week", dir: "up" } : { text: "no data", dir: "same" };
  }
  const pct = lastW > 0 ? Math.round((delta / lastW) * 100) : null;
  const text = `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${compact(Math.abs(delta))}${
    pct != null && pct !== 0 ? ` · ${pct > 0 ? "+" : ""}${pct}%` : ""
  }`;
  return { text, dir: delta > 0 ? "up" : delta < 0 ? "down" : "same" };
}

/** small helper so the row literals below stay plainly typed */
const info = (text: string): Trend => ({ text, dir: "same" });

export function StatsTab({ period }: { period: StatsPeriod }) {
  const statsQuery = useQuery({ queryKey: qk.stats(period), queryFn: () => statsApi.get(period) });
  const workoutsQuery = useQuery({ queryKey: qk.workoutList(), queryFn: () => workoutsApi.list() });
  const workouts = workoutsQuery.data?.workouts ?? [];
  const stats = statsQuery.data;

  // ---- rolling 7-day windows (port of legacy weekly-rhythm) ----
  const week = useMemo(() => {
    const today = todayKey();
    const inWindow = (w: WorkoutSummaryDTO, fromKey: string, toKey: string) => {
      const k = dayKeyOf(w.date);
      return k >= fromKey && k <= toKey;
    };
    const thisFrom = addDaysKey(today, -6);
    const lastFrom = addDaysKey(today, -13);
    const lastTo = addDaysKey(today, -7);
    const thisWeek = workouts.filter((w) => inWindow(w, thisFrom, today));
    const lastWeek = workouts.filter((w) => inWindow(w, lastFrom, lastTo));
    const sum = (list: WorkoutSummaryDTO[], f: (w: WorkoutSummaryDTO) => number) =>
      Math.round(list.reduce((a, w) => a + f(w), 0) * 10) / 10;
    const paceFrom = addDaysKey(today, -27);
    const paceBase = workouts.filter((w) => inWindow(w, paceFrom, today)).length;
    return {
      workouts: thisWeek.length,
      lastWorkouts: lastWeek.length,
      volume: sum(thisWeek, (w) => w.volume),
      lastVolume: sum(lastWeek, (w) => w.volume),
      sets: sum(thisWeek, (w) => w.setCount),
      lastSets: sum(lastWeek, (w) => w.setCount),
      pace: Math.round((paceBase / 4) * 10) / 10,
    };
  }, [workouts]);

  // ---- avg volume by weekday over the last RHYTHM_WEEKS weeks ----
  const rhythm = useMemo(() => {
    const today = todayKey();
    const cutoff = addDaysKey(today, -RHYTHM_WEEKS * 7 + 1);
    const sums = Array.from({ length: 7 }, () => 0);
    const counts = Array.from({ length: 7 }, () => 0);
    for (const w of workouts) {
      const k = dayKeyOf(w.date);
      if (k < cutoff || k > today) continue;
      const d = parseDayKey(k);
      const idx = (d.getUTCDay() + 6) % 7; // Mon = 0
      sums[idx] += w.volume;
      counts[idx] += 1;
    }
    return WEEKDAYS.map((label, i) => ({
      day: label,
      avg: counts[i] > 0 ? Math.round((sums[i] / counts[i]) * 10) / 10 : null,
      sessions: counts[i],
    }));
  }, [workouts]);

  if (statsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div
        data-row
        className="flex h-12 items-center overflow-hidden whitespace-nowrap text-sm text-muted-foreground"
      >
        Could not load stats — check your connection and try again.
      </div>
    );
  }

  const perWorkout = stats.workouts > 0 ? stats.workouts : null;

  const periodRows: StatRow[] = [
    { name: "Workouts", value: String(stats.workouts), trend: info(`${stats.streak.current}d streak`) },
    { name: "Sets", value: String(stats.setCount), trend: perWorkout ? info(`${round1(stats.setCount / perWorkout)} / workout`) : undefined },
    { name: "Volume", value: `${compact(stats.volume)} kg`, trend: perWorkout ? info(`${compact(stats.volume / perWorkout)} / workout`) : undefined },
    { name: "Reps", value: String(stats.reps) },
    { name: "Time", value: stats.durationSec > 0 ? compactDuration(stats.durationSec) : "–" },
    { name: "Distance", value: stats.distance > 0 ? `${round2(stats.distance)} km` : "–" },
    { name: "Streak", value: `${stats.streak.current}d`, trend: info(`best ${stats.streak.longest}d`) },
  ];
  if (stats.maxWeight) {
    periodRows.push({ name: "Heaviest set", value: `${round1(stats.maxWeight.value)} kg`, trend: info(stats.maxWeight.exerciseName) });
  }
  if (stats.maxVolumeDay) {
    periodRows.push({
      name: "Top volume day",
      value: `${compact(stats.maxVolumeDay.value)} kg`,
      trend: info(formatDayShort(stats.maxVolumeDay.date.slice(0, 10))),
    });
  }

  const weekRows: StatRow[] = [
    { name: "Workouts (7d)", value: String(week.workouts), trend: weekTrend(week.workouts, week.lastWorkouts) },
    { name: "Volume (7d)", value: `${compact(week.volume)} kg`, trend: weekTrend(week.volume, week.lastVolume) },
    { name: "Sets (7d)", value: String(week.sets), trend: weekTrend(week.sets, week.lastSets) },
    { name: "Sessions / week", value: `${round1(week.pace)}`, trend: info("rolling 4 weeks") },
  ];

  const rhythmRows: StatRow[] = rhythm.map((r) => ({
    name: `${r.day} rhythm`,
    value: r.avg != null ? `${compact(r.avg)} kg` : "–",
    trend: r.sessions > 0 ? info(`${r.sessions} session${r.sessions === 1 ? "" : "s"}`) : undefined,
  }));

  const volumeRows: StatRow[] = stats.perExercise.slice(0, 6).map((e) => ({
    name: e.name,
    value: `${compact(e.volume)} kg`,
    trend: info(`${e.setCount} sets · ${e.reps} reps`),
  }));

  const empty = stats.workouts === 0 && workouts.length === 0;

  return (
    <div className="flex flex-col gap-2">
      {empty ? (
        <div
          data-row
          className="flex h-12 items-center overflow-hidden whitespace-nowrap text-sm text-muted-foreground"
        >
          No training data yet — log a workout to see your stats.
        </div>
      ) : (
        <>
          <Section title={`Period · ${PERIOD_LABEL[period]}`} rows={periodRows} />
          <Section title="This week vs last" rows={weekRows} />
          <Section title="Weekly rhythm · avg kg per training day" rows={rhythmRows} />
          {volumeRows.length > 0 ? <Section title="Volume by exercise" rows={volumeRows} /> : null}
        </>
      )}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: StatRow[] }) {
  return (
    <div className="flex flex-col">
      <p className="flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <span className="truncate">{title}</span>
      </p>
      {rows.map((r) => (
        <div
          key={r.name}
          data-row
          className="flex h-10 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/50"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
          <span className="w-[84px] flex-none truncate text-right text-sm font-bold tabular-nums">{r.value}</span>
          {r.trend ? (
            <span
              className={cn(
                "flex min-w-0 flex-1 items-center justify-end gap-1 text-right text-[11px] font-semibold",
                r.trend.dir === "up" && "text-emerald-500",
                r.trend.dir === "down" && "text-red-500",
                r.trend.dir === "same" && "text-muted-foreground",
              )}
            >
              {r.trend.dir === "up" ? (
                <TrendingUp className="h-3 w-3 flex-none" aria-hidden />
              ) : r.trend.dir === "down" ? (
                <TrendingDown className="h-3 w-3 flex-none" aria-hidden />
              ) : (
                <Minus className="h-3 w-3 flex-none" aria-hidden />
              )}
              <span className="min-w-0 truncate">{r.trend.text}</span>
            </span>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
        </div>
      ))}
    </div>
  );
}
