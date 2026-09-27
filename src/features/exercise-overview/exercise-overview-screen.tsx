"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ExerciseOverviewScreen — #/exercise-overview/{exerciseId} (p3-9 Task A: the
// last legacy passthrough, rebuilt on the layout primitives).
//
//   TopBar (56)  : back (→ browser history when the SPA navigated here, else
//                  #/exercises) · exercise name + category dot (ellipsis) · ⋮
//                  (Favourite toggle · Training history → #/today/{id}?tab=history)
//   SubBar (48)  : About | Records | Goals | History — 4 equal tabs, active
//                  tab deep-linkable via ?tab= (replaceHash, no history
//                  pollution). About (Part 6 §4.2b) is the default tab.
//   ScrollBody   : ABOUT   — ExerciseDetailBody (MediaBlock 180/240 · Setup /
//                            Target tiles with inline expansion · muscle and
//                            equipment chip rows · trainer tip row), sourced
//                            from the owned exercise's optional catalog
//                            metadata; every section collapses to 0px when
//                            absent. No ActionRow — the exercise is already
//                            owned (TopBar ⋮ keeps the favourite toggle).
//                  RECORDS — 40px data-rows: lift (ellipsis) | value 72px right
//                            tabular | date 88px. Sections: Bests (best weight,
//                            best volume set, estimated 1RM, best distance/
//                            time for cardio), Rep records (per-reps actual PRs
//                            from the records API, superseded dimmed), Estimated
//                            maxes (nRM table rows). Computations ported from
//                            the legacy exercise-overview/records-tab.
//                  GOALS    — 40px data-rows: goal target (ellipsis) | progress
//                            % 56px | status hit/open; tap → 96px INLINE
//                            expansion (progress bar + target editor + two-tap
//                            delete) ported from the p3-7 insights goals tab;
//                            "+ Add goal" row opens a 96px inline creator (type
//                            select + target input) — no dialogs.
//                  HISTORY  — DateGroup×N (32px headers, PR badge when a record
//                            falls on that day) + ONE ExerciseCard read mode
//                            per workout date (tap to collapse/expand; ⋮ Notes /
//                            Open → training screen) — the pattern from the
//                            training screen's History tab.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody } from "@/components/layout";
import {
  ExerciseCard,
  toCardSet,
  type CardAction,
  type CardExercise,
  type CardSet,
  type CardVisibleColumns,
} from "@/components/exercise-card/exercise-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, History, MoreVertical, Plus, Star, Target, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { qk, useInvalidate } from "@/lib/client/query";
import { exercisesApi, goalsApi, type GoalInput } from "@/lib/client/api";
import { dayKeyOf, formatDayLabel, formatDayShort, round1, round2 } from "@/lib/client/format";
import { formatDuration, estOneRmByMethod } from "@/lib/formulas";
import { fieldsForType } from "@/lib/constants";
import { useHashRoute, replaceHash } from "@/features/shell/router";
import {
  type WeightUnit,
  exerciseUnit,
  goalTargetField,
  goalTypeLabel,
  goalValueLabel,
  weightLabel,
} from "@/features/exercises/labels";
import { useOfflineRun } from "@/features/exercises/offline-run";
import { useToggleFavourite } from "@/features/exercises/use-favourite";
import { ExerciseNotesPopover } from "@/features/today/card-popovers";
import { ExerciseDetailBody } from "@/features/library/exercise-detail-body";
import type { ExerciseDTO, GoalDTO, RecordsDTO, SetDTO } from "@/lib/types";

const TABS = ["about", "records", "goals", "history"] as const;
type TabKey = (typeof TABS)[number];
const TAB_LABELS: Record<TabKey, string> = { about: "About", records: "Records", goals: "Goals", history: "History" };

// Any in-app navigation (navigate() pushes a history entry) fires hashchange.
// Until one fires, this screen was reached by a deep link / fresh load → the
// back button falls back to #/exercises instead of leaving the app.
let appNavigated = false;
if (typeof window !== "undefined") {
  window.addEventListener(
    "hashchange",
    () => {
      appNavigated = true;
    },
    { once: true },
  );
}

type HistoryEntry = { workoutId: string; date: string; workoutExerciseId: string; sets: SetDTO[] };

export default function ExerciseOverviewScreen({ exerciseId }: { exerciseId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const route = useHashRoute();
  const toggleFavourite = useToggleFavourite();

  const exerciseQuery = useQuery({
    queryKey: qk.exercise(exerciseId),
    queryFn: () => exercisesApi.get(exerciseId),
    retry: false,
    staleTime: 60_000,
  });
  const exercise = exerciseQuery.data ?? null;

  // ---------- ?tab= deep link ----------
  const tabParam = route.name === "exercise-overview" ? route.query.get("tab") : null;
  const tab: TabKey = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as TabKey) : "about";
  const switchTab = (t: TabKey) => {
    if (t === tab) return;
    replaceHash(`#/exercise-overview/${exerciseId}?tab=${t}`);
  };

  const goBack = () => {
    if (appNavigated && window.history.length > 1) window.history.back();
    else navigate("/exercises");
  };

  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  return (
    <Screen
      topBar={
        <TopBar
          leading={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 flex-none"
              onClick={goBack}
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title={
            exercise ? (
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 flex-none rounded-full"
                  style={{ backgroundColor: exercise.category?.colour ?? "#71717a" }}
                  aria-hidden
                />
                <span className="truncate">{exercise.name}</span>
              </span>
            ) : (
              "Exercise"
            )
          }
          actions={
            exercise ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 flex-none"
                    aria-label="More actions"
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => void toggleFavourite(exercise)}>
                    <Star className="h-4 w-4" aria-hidden />
                    {exercise.isFavorite ? "Unfavourite" : "Favourite"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate(`/today/${exercise.id}?tab=history`)}
                  >
                    <History className="h-4 w-4" aria-hidden /> Training history
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : undefined
          }
        />
      }
      subBar={
        <div className="grid h-12 w-full grid-cols-4" role="tablist" aria-label="Exercise overview tabs">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => switchTab(t)}
              className={cn(
                "flex h-12 min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap transition-colors",
                tab === t ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="text-sm font-semibold leading-none">{TAB_LABELS[t]}</span>
              <span
                className={cn("h-0.5 w-8 rounded-full", tab === t ? "bg-primary" : "bg-transparent")}
                aria-hidden
              />
            </button>
          ))}
        </div>
      }
    >
      <ScrollBody>
        {exerciseQuery.isLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading exercise">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : !exercise ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
            <p className="text-sm font-semibold">Exercise not found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              It may have been deleted on this account.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="mt-4 gap-1.5"
              onClick={() => navigate("/exercises")}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> Back to exercises
            </Button>
          </div>
        ) : tab === "about" ? (
          <AboutTab key={`about-${exercise.id}`} exercise={exercise} />
        ) : tab === "records" ? (
          <RecordsTab key={`rec-${exercise.id}`} exercise={exercise} />
        ) : tab === "goals" ? (
          <GoalsTab key={`goals-${exercise.id}`} exercise={exercise} />
        ) : (
          <HistoryTab
            key={`hist-${exercise.id}`}
            exercise={exercise}
            visibleColumns={visibleColumns}
          />
        )}
      </ScrollBody>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABOUT (Part 6 §4.2b) — the ExerciseDetailBody shared with #/library/{key},
// sourced from the owned exercise's optional catalog metadata. No ActionRow.
// ─────────────────────────────────────────────────────────────────────────────

function AboutTab({ exercise }: { exercise: ExerciseDTO }) {
  return <ExerciseDetailBody data={exercise} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// RECORDS — 40px data-rows: lift | value 72px | date 88px
// ─────────────────────────────────────────────────────────────────────────────

/** 32px section header — deliberately NOT a data-row (height law). */
function SectionHeader({ label }: { label: string }) {
  return (
    <h2 className="flex h-8 flex-none items-center gap-2 overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span className="truncate">{label}</span>
      <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
    </h2>
  );
}

type RecordRow = { lift: string; value: string; date: string | null; dim?: boolean };

function RecordRowLine({ row }: { row: RecordRow }) {
  return (
    <div
      data-row
      aria-label={`${row.lift}: ${row.value}${row.date ? `, ${row.date}` : ""}`}
      className={cn(
        "flex h-10 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/50 px-1 text-sm",
        row.dim && "opacity-50",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.lift}</span>
      <span className="w-[72px] flex-none text-right text-sm font-bold tabular-nums">
        {row.value}
      </span>
      <span className="w-[88px] flex-none text-right text-xs tabular-nums text-muted-foreground">
        {row.date ?? "–"}
      </span>
    </div>
  );
}

function RecordsTab({ exercise }: { exercise: ExerciseDTO }) {
  const settings = useApp((s) => s.settings);
  const unit = exerciseUnit(exercise, settings);
  const fields = useMemo(() => new Set(fieldsForType(exercise.type)), [exercise.type]);
  const tracksWeightReps = fields.has("weight") && fields.has("reps");

  const recordsQuery = useQuery({
    queryKey: qk.exerciseRecords(exercise.id),
    queryFn: () => exercisesApi.records(exercise.id),
    staleTime: 60_000,
  });
  const historyQuery = useQuery({
    queryKey: qk.exerciseHistory(exercise.id),
    queryFn: () => exercisesApi.history(exercise.id),
    staleTime: 60_000,
  });

  const rows = useMemo<{ out: RecordRow[]; actual: RecordRow[]; estimated: RecordRow[] }>(() => {
    const out: RecordRow[] = [];
    const entries = historyQuery.data ?? [];
    const records: RecordsDTO | undefined = recordsQuery.data;

    // ---- bests from the logged sets (legacy records-tab computations) ----
    let bestWeight: { w: number; day: string } | null = null;
    let bestVolume: { v: number; day: string } | null = null;
    let bestE1rm: { v: number; day: string } | null = null;
    let bestDistance: { v: number; day: string } | null = null;
    let bestTime: { v: number; day: string } | null = null;
    const repLimit = settings?.estOneRmRepLimit ?? 10;
    const method = settings?.e1rmMethod ?? "BRZYCKI";

    for (const en of entries) {
      const day = dayKeyOf(en.date);
      for (const s of en.sets) {
        if (s.weight != null && (bestWeight == null || s.weight > bestWeight.w)) {
          bestWeight = { w: s.weight, day };
        }
        if (
          s.weight != null &&
          s.reps != null &&
          s.weight > 0 &&
          s.reps > 0 &&
          (bestVolume == null || s.weight * s.reps > bestVolume.v)
        ) {
          bestVolume = { v: s.weight * s.reps, day };
        }
        // same guard as the server: failure sets are not e1RM inputs
        if (
          s.weight != null &&
          s.reps != null &&
          s.reps >= 1 &&
          s.reps <= repLimit &&
          s.setType !== "FAILURE"
        ) {
          const e = estOneRmByMethod(s.weight, s.reps, method, s.rpe);
          if (e > 0 && (bestE1rm == null || e > bestE1rm.v)) bestE1rm = { v: e, day };
        }
        if (s.distance != null && s.distance > 0 && (bestDistance == null || s.distance > bestDistance.v)) {
          bestDistance = { v: s.distance, day };
        }
        if (s.timeSec != null && s.timeSec > 0 && (bestTime == null || s.timeSec > bestTime.v)) {
          bestTime = { v: s.timeSec, day };
        }
      }
    }

    if (tracksWeightReps) {
      if (bestWeight) {
        out.push({ lift: "Best weight", value: weightLabel(bestWeight.w, unit), date: formatDayShort(bestWeight.day) });
      }
      if (bestVolume) {
        out.push({ lift: "Best volume set", value: `${round1(bestVolume.v)} ${unit}`, date: formatDayShort(bestVolume.day) });
      }
      if (bestE1rm) {
        // value prefers the server computation when loaded (authoritative)
        const v = records && records.estimatedOneRm > 0 ? records.estimatedOneRm : bestE1rm.v;
        out.push({ lift: "Estimated 1RM", value: `${round1(v)} ${unit}`, date: formatDayShort(bestE1rm.day) });
      }
    }
    if (bestDistance) out.push({ lift: "Best distance", value: `${round2(bestDistance.v)} km`, date: formatDayShort(bestDistance.day) });
    if (bestTime) out.push({ lift: "Best time", value: formatDuration(bestTime.v), date: formatDayShort(bestTime.day) });

    // ---- per-reps actual PRs (records API, superseded dimmed) ----
    const actual: RecordRow[] = (records?.actual ?? []).map((r) => ({
      lift: `Best set at ${r.reps} ${r.reps === 1 ? "rep" : "reps"}`,
      value: weightLabel(r.weight, unit),
      date: formatDayShort(dayKeyOf(r.date)),
      dim: r.superseded,
    }));

    // ---- estimated rep maxes (nRM, legacy grid → rows; 1RM row above) ----
    const estimated: RecordRow[] = (records?.estimated ?? [])
      .filter((r) => r.reps > 1)
      .map((r) => ({ lift: `Estimated ${r.reps}RM`, value: `${round1(r.weight)} ${unit}`, date: null }));

    return { out, actual, estimated };
  }, [historyQuery.data, recordsQuery.data, settings, unit, tracksWeightReps]);

  if (historyQuery.isLoading || recordsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading records">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-10 rounded-lg" />
        ))}
      </div>
    );
  }

  const nothing = rows.out.length === 0 && rows.actual.length === 0 && rows.estimated.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {nothing ? (
        <div
          data-row
          className="flex h-12 items-center overflow-hidden whitespace-nowrap px-1 text-sm text-muted-foreground"
        >
          No records yet — log a set to start tracking.
        </div>
      ) : null}

      {rows.out.length > 0 ? (
        <section className="flex flex-col gap-1" aria-label="Bests">
          <SectionHeader label="Bests" />
          {rows.out.map((r) => (
            <RecordRowLine key={r.lift} row={r} />
          ))}
        </section>
      ) : null}

      {!tracksWeightReps && (rows.out.length > 0 || nothing) ? (
        <p className="px-1 text-xs text-muted-foreground">
          Weight × reps records need a weighted exercise — showing bests only.
        </p>
      ) : null}

      {rows.actual.length > 0 ? (
        <section className="flex flex-col gap-1" aria-label="Rep records">
          <SectionHeader label="Rep records" />
          {rows.actual.map((r) => (
            <RecordRowLine key={r.lift} row={r} />
          ))}
        </section>
      ) : null}

      {rows.estimated.length > 0 ? (
        <section className="flex flex-col gap-1" aria-label="Estimated maxes">
          <SectionHeader label="Estimated maxes" />
          {rows.estimated.map((r) => (
            <RecordRowLine key={r.lift} row={r} />
          ))}
        </section>
      ) : null}

      {rows.actual.length > 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          A PR is superseded when a heavier set at the same-or-higher rep count was logged later.
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GOALS — 40px data-rows + 96px inline expansions (p3-7 goals pattern)
// ─────────────────────────────────────────────────────────────────────────────

function GoalsTab({ exercise }: { exercise: ExerciseDTO }) {
  const settings = useApp((s) => s.settings);
  const unit = exerciseUnit(exercise, settings);

  const { data, isLoading } = useQuery({
    queryKey: ["goals", exercise.id],
    queryFn: () => goalsApi.list(exercise.id),
  });
  const goals = data?.goals ?? [];

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading goals">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* add-goal row (48px data-row) → inline 96px creator */}
      <button
        type="button"
        data-row
        aria-expanded={creating}
        onClick={() => {
          setCreating((c) => !c);
          setExpandedId(null);
        }}
        className="flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed px-3 text-left text-sm font-semibold text-primary transition-colors hover:bg-accent/50"
      >
        <Plus className="h-4 w-4 flex-none" aria-hidden />
        <span className="min-w-0 flex-1 truncate">Add goal for {exercise.name}</span>
      </button>
      {creating ? (
        <GoalCreator
          exercise={exercise}
          unit={unit}
          onDone={() => setCreating(false)}
        />
      ) : null}

      {goals.length === 0 ? (
        <div
          data-row
          className="flex h-12 items-center overflow-hidden whitespace-nowrap px-1 text-sm text-muted-foreground"
        >
          No goals for this exercise yet.
        </div>
      ) : (
        goals.map((g) => (
          <div key={g.id} className="flex flex-col">
            <button
              type="button"
              data-row
              aria-expanded={expandedId === g.id}
              onClick={() => setExpandedId((cur) => (cur === g.id ? null : g.id))}
              className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/50 text-left transition-colors hover:bg-accent/50"
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <Target className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden />
                <span className="min-w-0 truncate text-sm font-medium">
                  {goalTypeLabel(g.type)}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {goalValueLabel(g.type, g.target, unit)}
                  </span>
                </span>
              </span>
              <span
                className={cn(
                  "w-[56px] flex-none text-right text-sm font-bold tabular-nums",
                  g.achieved ? "text-primary" : "",
                )}
              >
                {Math.round(g.pct)}%
              </span>
              <span className="flex w-[52px] flex-none items-center justify-end gap-1 text-xs font-semibold">
                {g.achieved ? (
                  <>
                    <Trophy className="h-3.5 w-3.5 flex-none text-emerald-500" aria-hidden />
                    <span className="text-emerald-500">hit</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">open</span>
                )}
              </span>
            </button>

            {expandedId === g.id ? (
              <GoalExpansion key={g.id} goal={g} unit={unit} onDone={() => setExpandedId(null)} />
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

/** 96px inline goal creator (NOT a data-row): type select + target input. */
function GoalCreator({
  exercise,
  unit,
  onDone,
}: {
  exercise: ExerciseDTO;
  unit: WeightUnit;
  onDone: () => void;
}) {
  const run = useOfflineRun();
  const inv = useInvalidate();
  const [type, setType] = useState<string>("ONE_RM");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);

  const field = goalTargetField(type);
  const placeholder =
    field === "targetWeight"
      ? `Target ${unit}`
      : field === "targetReps"
        ? "Target reps"
        : field === "targetDistance"
          ? "Target km"
          : "Target sec";

  const save = async () => {
    const n = Number(target);
    if (target.trim() === "" || !Number.isFinite(n) || n <= 0) {
      toast.error("Set a target value above zero");
      return;
    }
    setSaving(true);
    const payload: GoalInput = {
      type,
      targetWeight: field === "targetWeight" ? n : null,
      targetReps: field === "targetReps" ? n : null,
      targetDistance: field === "targetDistance" ? n : null,
      targetTimeSec: field === "targetTimeSec" ? n : null,
    };
    const ok = await run({
      label: "Goal",
      path: "/api/goals",
      method: "POST",
      body: { ...payload, exerciseId: exercise.id },
      run: () => goalsApi.create({ ...payload, exerciseId: exercise.id }),
      successMsg: "Goal created",
      onDone: () => inv.goals(),
    });
    setSaving(false);
    if (ok) onDone();
  };

  return (
    <div className="flex h-24 flex-none flex-col gap-1 rounded-lg border bg-card p-1.5">
      <div className="flex min-h-0 flex-1 items-center overflow-hidden">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-full w-full rounded-lg" aria-label="Goal type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["ONE_RM", "MAX_WEIGHT", "MAX_REPS", "MAX_DISTANCE", "MAX_TIME", "VOLUME"].map((t) => (
              <SelectItem key={t} value={t}>
                {goalTypeLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-h-0 flex-1 gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          className="h-full flex-1 rounded-lg tabular-nums"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <Button
          type="button"
          className="h-full flex-1 rounded-lg font-semibold"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Add goal"}
        </Button>
      </div>
    </div>
  );
}

/** 96px inline expansion (NOT a data-row): progress + target editor + delete. */
function GoalExpansion({
  goal,
  unit,
  onDone,
}: {
  goal: GoalDTO;
  unit: WeightUnit;
  onDone: () => void;
}) {
  const run = useOfflineRun();
  const inv = useInvalidate();
  const field = goalTargetField(goal.type);
  const initial =
    field === "targetWeight"
      ? goal.targetWeight
      : field === "targetReps"
        ? goal.targetReps
        : field === "targetDistance"
          ? goal.targetDistance
          : goal.targetTimeSec;

  const [target, setTarget] = useState<string>(initial != null ? String(initial) : "");
  const [saving, setSaving] = useState(false);
  const [armed, setArmed] = useState(false);

  // auto-disarm the two-tap delete after a pause
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);

  const save = async () => {
    const n = Number(target);
    if (target.trim() === "" || !Number.isFinite(n) || n <= 0) {
      toast.error("Set a target value above zero");
      return;
    }
    setSaving(true);
    const payload: GoalInput = {
      type: goal.type,
      targetWeight: field === "targetWeight" ? n : null,
      targetReps: field === "targetReps" ? n : null,
      targetDistance: field === "targetDistance" ? n : null,
      targetTimeSec: field === "targetTimeSec" ? n : null,
    };
    const ok = await run({
      label: "Goal update",
      path: `/api/goals/${goal.id}`,
      method: "PATCH",
      body: payload,
      run: () => goalsApi.update(goal.id, payload),
      successMsg: "Goal updated",
      onDone: () => inv.goals(),
    });
    setSaving(false);
    if (ok) onDone();
  };

  const remove = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    const ok = await run({
      label: "Goal delete",
      path: `/api/goals/${goal.id}`,
      method: "DELETE",
      run: () => goalsApi.remove(goal.id),
      successMsg: "Goal deleted",
      onDone: () => inv.goals(),
    });
    if (ok) onDone();
  };

  return (
    <div className="flex h-24 flex-none flex-col gap-1 rounded-lg border bg-card p-1.5">
      <div className="flex min-h-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap">
        <Progress
          value={Math.min(100, goal.pct)}
          className={cn("h-2 flex-1", goal.achieved && "*:data-[slot=progress-indicator]:bg-emerald-500")}
          aria-label={`${goal.pct}% of goal`}
        />
        <span className="flex-none truncate text-xs font-semibold tabular-nums text-muted-foreground">
          {goalValueLabel(goal.type, goal.current, unit)} / {goalValueLabel(goal.type, goal.target, unit)}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          className="h-full flex-1 rounded-lg tabular-nums"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="Goal target"
        />
        <Button
          type="button"
          className="h-full flex-1 rounded-lg font-semibold"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save target"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-full flex-none gap-1 rounded-lg",
            armed ? "border-destructive/50 text-destructive" : "text-muted-foreground",
          )}
          onClick={() => void remove()}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {armed ? "Sure?" : "Delete"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY — DateGroup×N (32px headers) + ONE ExerciseCard read mode per date
// ─────────────────────────────────────────────────────────────────────────────

function HistoryTab({
  exercise,
  visibleColumns,
}: {
  exercise: ExerciseDTO;
  visibleColumns: CardVisibleColumns;
}) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);

  const historyQuery = useQuery({
    queryKey: qk.exerciseHistory(exercise.id),
    queryFn: () => exercisesApi.history(exercise.id),
    staleTime: 60_000,
  });
  // records → date-level PR badges (legacy history-tab pattern)
  const recordsQuery = useQuery({
    queryKey: qk.exerciseRecords(exercise.id),
    queryFn: () => exercisesApi.records(exercise.id),
    staleTime: 60_000,
  });

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [notesEntryId, setNotesEntryId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const en of historyQuery.data ?? []) {
      const key = dayKeyOf(en.date);
      const list = map.get(key);
      if (list) list.push(en);
      else map.set(key, [en]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [historyQuery.data]);

  const prDates = useMemo(
    () => new Set((recordsQuery.data?.actual ?? []).map((r) => dayKeyOf(r.date))),
    [recordsQuery.data],
  );

  if (historyQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading history">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div
        data-row
        className="flex h-12 items-center overflow-hidden whitespace-nowrap px-1 text-sm text-muted-foreground"
      >
        No history yet — every set you log appears here.
      </div>
    );
  }

  const cardEx: CardExercise = {
    id: exercise.id,
    name: exercise.name,
    categoryLabel: exercise.category?.name ?? "Exercise",
    categoryColour: exercise.category?.colour ?? "#71717a",
    modality: exercise.type,
    unit: exerciseUnit(exercise, settings),
    weightIncrement: exercise.weightIncrement ?? settings?.defaultWeightIncrement ?? 2.5,
  };

  /** SetDTO → CardSet (distance km → CardSet metres, as in workout-block). */
  const toCardSets = (sets: SetDTO[]): CardSet[] =>
    [...sets]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s, i) =>
        toCardSet({ ...s, distance: s.distance != null ? s.distance * 1000 : null }, i + 1),
      );

  const toggleCollapsed = (weId: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(weId)) next.delete(weId);
      else next.add(weId);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      {groups.map(([day, entries]) => {
        const setCount = entries.reduce((a, e) => a + e.sets.length, 0);
        const isPr = prDates.has(day);
        return (
          <section key={day} className="flex flex-col gap-2" aria-label={formatDayLabel(day)}>
            <h2 className="flex h-8 items-center gap-2 overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span className="flex-none truncate">{formatDayLabel(day)}</span>
              {isPr ? (
                <Trophy className="h-3.5 w-3.5 flex-none text-primary" aria-label="Personal record day" />
              ) : null}
              <span className="truncate text-[10px] font-medium normal-case tracking-normal text-muted-foreground/70">
                {setCount} {setCount === 1 ? "set" : "sets"}
              </span>
              <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
            </h2>

            {entries.map((entry) => {
              const collapsed = collapsedIds.has(entry.workoutExerciseId);
              const notesOpen = notesEntryId === entry.workoutExerciseId;
              return (
                <div key={entry.workoutExerciseId} className="flex flex-col">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`${collapsed ? "Expand" : "Collapse"} sets from ${formatDayLabel(day)}`}
                    className="flex-none cursor-pointer"
                    onClick={(e) => {
                      // taps on the card's own controls (buttons/inputs) never toggle
                      if ((e.target as HTMLElement).closest("button, input, textarea, a")) return;
                      toggleCollapsed(entry.workoutExerciseId);
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleCollapsed(entry.workoutExerciseId);
                      }
                    }}
                  >
                    <ExerciseCard
                      mode="read"
                      collapsed={collapsed}
                      exercise={cardEx}
                      sets={toCardSets(entry.sets)}
                      visibleColumns={visibleColumns}
                      onAction={(action: CardAction) => {
                        switch (action.type) {
                          case "toggle-collapse":
                            toggleCollapsed(entry.workoutExerciseId);
                            break;
                          case "open":
                            navigate(`/today/${entry.workoutExerciseId}?date=${day}`);
                            break;
                          case "notes":
                            setNotesEntryId(entry.workoutExerciseId);
                            break;
                          default:
                            break;
                        }
                      }}
                    />
                  </div>
                  {notesOpen ? (
                    <div className="relative flex-none">
                      <ExerciseNotesPopover
                        exercise={exercise}
                        open
                        onClose={() => setNotesEntryId(null)}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        );
      })}
      {(historyQuery.data?.length ?? 0) >= 100 ? (
        <p className="px-1 text-xs text-muted-foreground">Showing the most recent 100 sessions.</p>
      ) : null}
    </div>
  );
}
