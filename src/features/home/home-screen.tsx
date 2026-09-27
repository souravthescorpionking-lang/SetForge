"use client";

// ─────────────────────────────────────────────────────────────────────────────
// HomeScreen — #/home (Part 5). The dashboard: today's program card, the
// upcoming strip, quick sessions, weekly stats and today's logged workout.
//
//   TopBar (56)  : "Home" (no back button — this is the root).
//   ScrollBody   : TodayCard (168/120px fixed states) → UpcomingStrip (48) →
//                  QuickStartRow (48, hidden with no sessions) → StatsRow (56
//                  + optional 24px target line) → TodayWorkoutSection (32
//                  header + summary cards / 40px empty row).
//
// Data: ONE useDashboard() TanStack hook (15s staleTime) kept fresh across
// day rollovers by useDashboardRefresh (local-midnight timer + visibility +
// online events). All "today" logic trusts the server response.
// ─────────────────────────────────────────────────────────────────────────────

import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { useApp } from "@/lib/client/store";
import { useDashboard, useDashboardRefresh } from "./use-dashboard";
import { TodayCard, TodayCardSkeleton } from "./today-card";
import { UpcomingStrip } from "./upcoming-strip";
import { QuickStartRow } from "./quick-start-row";
import { StatsRow } from "./stats-row";
import { TodayWorkoutSection } from "./today-workout-section";

export default function HomeScreen() {
  const settings = useApp((s) => s.settings);
  useDashboardRefresh();

  const { data, error } = useDashboard();

  const visibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  return (
    <Screen topBar={<TopBar title="Home" />}>
      <ScrollBody>
        {error ? (
          <div
            role="status"
            className="flex h-[120px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center"
          >
            <p className="text-sm font-semibold">Could not load your dashboard</p>
            <p className="text-xs text-muted-foreground">{error.message}</p>
          </div>
        ) : !data ? (
          // skeleton — identical section heights (no CLS on first load)
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading dashboard">
            <TodayCardSkeleton />
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-12 animate-pulse rounded-lg bg-muted/30" />
          </div>
        ) : (
          <>
            <TodayCard dashboard={data} />
            <UpcomingStrip days={data.upcoming} />
            <QuickStartRow sessions={data.quickSessions} />
            <StatsRow stats={data.stats} />
            <TodayWorkoutSection
              dateKey={data.today.date}
              hasWorkout={!!data.todayWorkout}
              visibleColumns={visibleColumns}
            />
            {/* bottom breathing spacer — bars are flex siblings */}
            <div className="h-2 flex-none" aria-hidden />
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}
