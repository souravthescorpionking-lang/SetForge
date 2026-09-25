"use client";

// InsightsView — training dashboard: period KPIs, highlights, activity grid,
// volume-by-exercise chart, records leaderboard and goals overview.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import {
  BarChart3,
  CalendarDays,
  Clock,
  Dumbbell,
  Flame,
  Gauge,
  Layers,
  MapPin,
  Repeat,
  Trophy,
} from "lucide-react";
import { useApp } from "@/lib/client/store";
import { recordsApi, statsApi, workoutsApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import { dayKeyOf, formatDayLabel, formatSec, round1, round2 } from "@/lib/client/format";
import { KpiCard } from "./kpi-card";
import { ActivityGrid } from "./activity-grid";
import { VolumeByExercise } from "./volume-chart";
import { RecordsLeaderboard } from "./records-leaderboard";
import { GoalsOverview } from "./goals-overview";

const PERIODS: Array<{ value: "week" | "month" | "year" | "all"; label: string }> = [
  { value: "week", label: "7d" },
  { value: "month", label: "30d" },
  { value: "year", label: "1y" },
  { value: "all", label: "All" },
];

/** Compact display for big numbers: 427669 → 427.7k, 1322136 → 1.32M */
function compact(n: number): string {
  if (n >= 1_000_000) return `${round2(n / 1_000_000)}M`;
  if (n >= 10_000) return `${round1(n / 1000)}k`;
  return round1(n);
}

export function InsightsView() {
  const navigate = useApp((s) => s.navigate);
  const route = useApp((s) => s.route);
  const period = (route.query.get("period") as "week" | "month" | "year" | "all") ?? "month";

  const setPeriod = (p: string) => navigate(`/insights?period=${p}`);

  const statsQuery = useQuery({
    queryKey: qk.stats(period),
    queryFn: () => statsApi.get(period),
  });
  const recordsQuery = useQuery({
    queryKey: qk.records,
    queryFn: () => recordsApi.all(),
  });
  // workout summaries feed the activity-grid intensity buckets (volume per day)
  const workoutsQuery = useQuery({
    queryKey: qk.workoutList(),
    queryFn: () => workoutsApi.list(),
  });
  const volumeByDate = useMemo(
    () => new Map((workoutsQuery.data?.workouts ?? []).map((w) => [dayKeyOf(w.date), w.volume] as const)),
    [workoutsQuery.data],
  );

  const stats = statsQuery.data;
  const records = recordsQuery.data?.records ?? [];

  const openExercise = (id: string) => navigate(`/exercise-overview/${id}`);

  // average per active day
  const perDay = useMemo(() => {
    if (!stats || stats.workouts === 0) return null;
    return {
      volume: stats.volume / stats.workouts,
      sets: stats.setCount / stats.workouts,
    };
  }, [stats]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Insights"
        subtitle="Your training at a glance"
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <ToggleGroup
            type="single"
            value={period}
            onValueChange={(v) => v && setPeriod(v)}
            className="h-10"
          >
            {PERIODS.map((p) => (
              <ToggleGroupItem
                key={p.value}
                value={p.value}
                className="h-10 rounded-xl px-3 text-sm font-semibold"
              >
                {p.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />

      {/* KPI grid */}
      {statsQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-2xl" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            icon={CalendarDays}
            label="Workouts"
            value={String(stats.workouts)}
            delay={0}
            accent
          />
          <KpiCard icon={Layers} label="Sets" value={String(stats.setCount)} delay={0.05} />
          <KpiCard icon={Dumbbell} label="Volume" value={compact(stats.volume)} suffix="kg" delay={0.1} />
          <KpiCard icon={Repeat} label="Reps" value={String(stats.reps)} delay={0.15} />
          <KpiCard icon={Clock} label="Time" value={stats.durationSec > 0 ? formatSec(stats.durationSec) : "–"} delay={0.2} />
          <KpiCard icon={MapPin} label="Distance" value={stats.distance > 0 ? round2(stats.distance) : "–"} suffix={stats.distance > 0 ? "km" : undefined} delay={0.25} />
        </div>
      ) : null}

      {statsQuery.isError && (
        <EmptyState
          icon={<Gauge className="h-7 w-7" />}
          title="Could not load stats"
          description="Check your connection and try again."
        />
      )}

      {/* highlights */}
      {stats && stats.workouts > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Card className="h-full rounded-2xl border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Heaviest set
                </h3>
              </div>
              {stats.maxWeight ? (
                <>
                  <p className="mt-2 text-2xl font-black tracking-tight numeric">
                    {round1(stats.maxWeight.value)}
                    <span className="ml-1 text-sm font-bold text-muted-foreground">kg</span>
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold">
                    {stats.maxWeight.exerciseName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDayLabel(stats.maxWeight.date.slice(0, 10))}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No weighted sets yet</p>
              )}
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            <Card className="h-full rounded-2xl border-border/70 bg-card p-4">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Biggest volume day
                </h3>
              </div>
              {stats.maxVolumeDay ? (
                <>
                  <p className="mt-2 text-2xl font-black tracking-tight numeric">
                    {round1(stats.maxVolumeDay.value)}
                    <span className="ml-1 text-sm font-bold text-muted-foreground">kg</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDayLabel(stats.maxVolumeDay.date.slice(0, 10))}
                    {perDay && (
                      <>
                        {" · "}
                        <span className="numeric">{round1(perDay.volume)}</span> avg per workout
                      </>
                    )}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No volume logged yet</p>
              )}
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <Card className="h-full rounded-2xl border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-500" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Training streak
                </h3>
              </div>
              <div className="mt-2 flex items-end gap-3">
                <div>
                  <p className="text-2xl font-black tracking-tight numeric">
                    {stats.streak.current}
                    <span className="ml-1 text-sm font-bold text-muted-foreground">
                      day{stats.streak.current === 1 ? "" : "s"}
                    </span>
                  </p>
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">current</p>
                </div>
                <div className="border-l border-border/70 pl-3">
                  <p className="text-2xl font-black tracking-tight numeric">
                    {stats.streak.longest}
                    <span className="ml-1 text-sm font-bold text-muted-foreground">
                      day{stats.streak.longest === 1 ? "" : "s"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">personal best</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {stats.streak.current > 0
                  ? "Keep it alive — log a set today."
                  : "Log a workout today to start a new streak."}
              </p>
            </Card>
          </motion.div>
        </div>
      )}

      {/* activity grid */}
      {stats && <ActivityGrid dates={stats.workoutDates} volumeByDate={volumeByDate} />}

      {/* charts + records */}
      <div className="grid gap-4 lg:grid-cols-2">
        {stats && <VolumeByExercise perExercise={stats.perExercise} />}
        <RecordsLeaderboard records={records} onOpenExercise={openExercise} />
      </div>

      {/* goals */}
      <GoalsOverview onOpenExercise={openExercise} />
    </div>
  );
}
