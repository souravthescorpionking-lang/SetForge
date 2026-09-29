"use client";

// ─────────────────────────────────────────────────────────────────────────────
// StatsRow — section D of the Home dashboard (Part 5).
//
// One 56px row, 3 equal cells (tabular-nums): sets this week · weekly volume
// (unit-aware: kg/lb from settings.unitSystem) · day streak (singular "1 day").
// When weeklyWorkoutTarget > 0 a subtle "n/target workouts" progress line
// renders under the row.
// ─────────────────────────────────────────────────────────────────────────────

import { Flame, Dumbbell, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { tourAttrs } from "@/lib/tour/attrs";
import type { DashboardDTO } from "@/lib/types";
import { round1 } from "@/lib/client/format";

function Cell({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
}) {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5">
      <span className="flex items-center gap-1 leading-none">
        <Icon className="h-3.5 w-3.5 flex-none text-primary" aria-hidden />
        <span className="truncate text-base font-bold leading-none tabular-nums">{value}</span>
      </span>
      <span className="truncate text-[10px] font-medium uppercase tracking-wide leading-none text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function StatsRow({ stats }: { stats: DashboardDTO["stats"] }) {
  const settings = useApp((s) => s.settings);
  const imperial = settings?.unitSystem === "imperial";
  const volumeValue = imperial ? stats.weekVolume * 2.20462 : stats.weekVolume;
  const volume = `${Math.round(volumeValue).toLocaleString()} ${imperial ? "lb" : "kg"}`;

  return (
    <div className="flex flex-none flex-col gap-1.5">
      <div
        data-row
        aria-label="This week"
        {...tourAttrs({ id: "home.stats", label: "Weekly stats", help: "Sets, volume and streak for the current week.", order: 40 })}
        className="flex h-14 items-stretch gap-1 overflow-hidden whitespace-nowrap rounded-lg border bg-card"
      >
        <Cell icon={Dumbbell} value={`${stats.weekSets}`} label={stats.weekSets === 1 ? "set this week" : "sets this week"} />
        <div className="w-px flex-none bg-border" aria-hidden />
        <Cell icon={Trophy} value={volume} label="volume" />
        <div className="w-px flex-none bg-border" aria-hidden />
        <Cell
          icon={Flame}
          value={`${stats.streakDays} ${stats.streakDays === 1 ? "day" : "days"}`}
          label="streak"
        />
      </div>
      {stats.weeklyWorkoutTarget > 0 ? (
        <div
          data-row
          aria-label={`Weekly workout target progress: ${stats.weekWorkouts} of ${stats.weeklyWorkoutTarget}`}
          className="flex h-6 items-center gap-2 overflow-hidden whitespace-nowrap px-1"
        >
          <div
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.min(stats.weekWorkouts, stats.weeklyWorkoutTarget)}
            aria-valuemin={0}
            aria-valuemax={stats.weeklyWorkoutTarget}
          >
            <div
              className={cn(
                "h-full rounded-full",
                stats.weekWorkouts >= stats.weeklyWorkoutTarget ? "bg-emerald-500" : "bg-primary",
              )}
              style={{
                width: `${Math.min(100, (stats.weekWorkouts / stats.weeklyWorkoutTarget) * 100)}%`,
              }}
            />
          </div>
          <span className="flex-none text-[10px] font-semibold leading-none tabular-nums text-muted-foreground">
            {stats.weekWorkouts}/{stats.weeklyWorkoutTarget} workouts ·{" "}
            {round1(Math.max(0, stats.weeklyWorkoutTarget - stats.weekWorkouts))} to go
          </span>
        </div>
      ) : null}
    </div>
  );
}
