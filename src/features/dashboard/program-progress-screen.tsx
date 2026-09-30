"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProgramProgressScreen — #/dashboard/program (Part 10 §7.1).
//
//   TopBar (56)   [◀] program name
//   ScrollBody    48px rows: Day {n} of {N} · Phase {p} of {P} · Started
//                 {date} · Sets logged {total} · Volume lifted {v} {unit} ·
//                 Workouts completed {c} · Missed {m}
//                 (all from GET /api/program/progress — the followed program)
//   BottomBar (56) "Continue — Day {n}" — the SAME start flow as the §7 card
//                 (useProgramCardActions; in-progress → Continue session;
//                 no program → Pick a program).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, BottomBar } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import type { TourDecl } from "@/lib/tour/types";
import { ChevronRight, Play } from "lucide-react";
import { useApp } from "@/lib/client/store";
import { qk, useDashboard, useInvalidate, usePrograms } from "@/lib/client/query";
import { programProgressApi, routinesApi, workoutsApi } from "@/lib/client/api";
import { formatDayShort } from "@/lib/client/format";
import { rowTall } from "@/lib/ui/tokens";
import {
  resolveCardModel,
  useProgramCardActions,
} from "@/features/workout/program-card-model";
import type { ProgramProgressDTO } from "@/lib/types";

const KG_PER_LB = 0.45359237;

/** One 48px label ..... value row. */
function ProgressRow({
  label,
  value,
  tour,
}: {
  label: string;
  value: string;
  tour: TourDecl;
}) {
  return (
    <div
      data-row
      className={`${rowTall} gap-2 rounded-lg border bg-card px-4`}
      aria-label={`${label}: ${value}`}
      {...tourAttrs(tour)}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      <span className="max-w-[55%] flex-none truncate text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

export default function ProgramProgressScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const invalidate = useInvalidate();
  const imperial = settings?.unitSystem === "imperial";

  // §7.1 payload — the followed program's totals (null when none is followed).
  const progressQuery = useQuery({
    queryKey: qk.programProgress,
    queryFn: () => programProgressApi.get(),
    staleTime: 15_000,
  });
  const progress = progressQuery.data ?? null;

  // The card model powers the Continue CTA (same states as the §7 card).
  const dashboardQuery = useDashboard();
  const dash = dashboardQuery.data;
  const activeSessionQuery = useQuery({
    queryKey: ["workout", "active"],
    queryFn: () => workoutsApi.active(),
    staleTime: 15_000,
  });
  const activeWorkout = activeSessionQuery.data?.workout ?? null;
  const inProgress =
    !!activeWorkout && activeWorkout.finishedAt == null && activeWorkout.removedAt == null;

  const routineId = inProgress
    ? (activeWorkout?.sourceRoutineId ?? dash?.today.routine?.id ?? null)
    : (dash?.today.routine?.id ?? dash?.active?.routineId ?? null);
  const routineQuery = useQuery({
    queryKey: qk.routine(routineId ?? ""),
    queryFn: () => routinesApi.get(routineId!),
    enabled: !!routineId,
    staleTime: 30_000,
  });
  const programsQuery = usePrograms();

  const model = useMemo(
    () => (dash ? resolveCardModel(dash, activeWorkout, routineQuery.data, programsQuery.data) : null),
    [dash, activeWorkout, routineQuery.data, programsQuery.data],
  );
  const actions = useProgramCardActions(
    model ?? { state: "none" },
  );

  const loading = progressQuery.isLoading || dashboardQuery.isLoading || activeSessionQuery.isLoading;

  const volumeText = useMemo(() => {
    if (!progress) return "–";
    const v = imperial ? progress.volumeKg / KG_PER_LB : progress.volumeKg;
    return `${Math.round(v).toLocaleString()} ${imperial ? "lb" : "kg"}`;
  }, [progress, imperial]);

  const continueTarget = () => {
    if (!model) return;
    if (model.state === "inprogress") {
      navigate("/session");
      return;
    }
    if (model.state === "following") {
      void actions.startDay().then(() => invalidate.programProgress());
      return;
    }
    if (model.state === "rest") {
      void actions.markRestDone().then(() => invalidate.programProgress());
      return;
    }
    navigate("/programs");
  };

  const continueLabel =
    model?.state === "inprogress"
      ? "Continue session"
      : model?.state === "following"
        ? model.dayNumber != null
          ? `Continue — Day ${model.dayNumber}`
          : "Continue"
        : model?.state === "rest"
          ? "Rest day — Mark off"
          : "Pick a program";

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/dashboard" label="Back" />}
          title={progress?.name ?? "Program progress"}
        />
      }
      bottomBar={
        !loading ? (
          <BottomBar>
            <Button
              type="button"
              className="h-11 w-full gap-2 whitespace-nowrap text-base font-bold"
              disabled={actions.busy}
              tour={{
                id: "dashboardProgram.continue",
                label: "Continue",
                help: "Start the program's current day (or continue the session in progress).",
                order: 70,
              }}
              onClick={continueTarget}
            >
              <Play className="h-5 w-5" aria-hidden />
              {continueLabel}
            </Button>
          </BottomBar>
        ) : undefined
      }
    >
      <ScrollBody>
        {loading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading program progress">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : !progress ? (
          <div
            data-row
            className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-sm text-muted-foreground"
          >
            No program followed yet — pick one to see its progress.
            <ChevronRight className="h-4 w-4 flex-none" aria-hidden />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <ProgressRow
              label={`Day ${progress.dayNumber} of ${progress.dayCount}`}
              value={`${progress.daysDone} done`}
              tour={{
                id: "dashboardProgram.day",
                label: "Day",
                help: "The cursor's position and how many days are already done.",
                order: 10,
              }}
            />
            <ProgressRow
              label={`Phase ${progress.phaseNumber} of ${progress.phaseCount}`}
              value={progress.phaseCount > 1 ? "multi-phase" : "single phase"}
              tour={{
                id: "dashboardProgram.phase",
                label: "Phase",
                help: "Which phase of the program the cursor is in.",
                order: 20,
              }}
            />
            <ProgressRow
              label="Started"
              value={formatDayShort(progress.startedAt.slice(0, 10))}
              tour={{
                id: "dashboardProgram.started",
                label: "Started",
                help: "When you followed this program.",
                order: 30,
              }}
            />
            <ProgressRow
              label="Sets logged"
              value={`${progress.setsLogged.toLocaleString()}`}
              tour={{
                id: "dashboardProgram.sets",
                label: "Sets logged",
                help: "Total performed sets across this program's finished workouts.",
                order: 40,
              }}
            />
            <ProgressRow
              label="Volume lifted"
              value={volumeText}
              tour={{
                id: "dashboardProgram.volume",
                label: "Volume lifted",
                help: "Total weight moved (reps × weight) across finished workouts.",
                order: 50,
              }}
            />
            <ProgressRow
              label="Workouts completed"
              value={`${progress.workoutsCompleted}`}
              tour={{
                id: "dashboardProgram.workouts",
                label: "Workouts completed",
                help: "Finished workouts logged under this program.",
                order: 60,
              }}
            />
            <ProgressRow
              label="Missed"
              value={`${progress.missed}`}
              tour={{
                id: "dashboardProgram.missed",
                label: "Missed",
                help: "Scheduled sessions that were missed under this program.",
                order: 70,
              }}
            />
          </div>
        )}
      </ScrollBody>
    </Screen>
  );
}
