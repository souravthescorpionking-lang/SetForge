"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TrainingScreen — the per-exercise focus screen (#/today/{exerciseId}), Part 3
// ORDER OF WORK step 4. Composed ONLY from the layout primitives and the ONE
// ExerciseCard.
//
//   TopBar (56)  : back (→ #/today, preserving ?date=) · exercise name (+
//                  category colour dot) · Notes popover · Records (legacy
//                  #/exercise-overview/{id}) · ⋮ (Replace / Remove / Group /
//                  Rest override / Favourite)
//   SubBar (48)  : Track | History | Graph — 3 equal-width tabs; the active tab
//                  is deep-linkable via ?tab= (hash query, replaceHash)
//   ScrollBody   : TRACK    — "Now" section header + ONE ExerciseCard (edit,
//                            hideHeader) + "Last time" header + read-collapsed
//                            previous-performance card
//                  HISTORY  — DateGroup×N (32px date header + ExerciseCard
//                            read hideHeader); tapping a row toggles that card
//                            (and only that card) to edit inline
//                  GRAPH    — 48px ControlRow (metric | range | ⋮ options) →
//                            fixed 240/360px chart box → reserved 72px DetailRow
//   BottomBar    : RestBar while a rest countdown runs, else a full-width
//                  "Save set" button while a SetRow input is focused on mobile
//                  (<lg); nothing otherwise.
//
// The route param is resolved as a workout-exercise id first (Today navigates
// here with we.id) and as a library exercise id second (the picker's History
// action deep-links with the library id — Track then offers to add it).
// Data/mutation logic is reused from the p3-3 Today rebuild (use-mutate
// offline outbox, rest-state countdown engine, card-popovers overlays).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Screen, TopBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { tourAttrs } from "@/lib/tour/attrs";
import {
  ExerciseCard,
  toCardSet,
  type CardAction,
  type CardExercise,
  type CardSet,
  type CardVisibleColumns,
} from "@/components/exercise-card/exercise-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeftRight,
  Boxes,
  Check,
  ChevronLeft,
  Medal,
  MessageSquareText,
  MoreVertical,
  Plus,
  Timer,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { rowHero } from "@/lib/ui/tokens";
import { formatDuration } from "@/lib/formulas";
import { useApp } from "@/lib/client/store";
import { exercisesApi, workoutsApi, type SetInput } from "@/lib/client/api";
import { qk, useInvalidate, useWorkoutByDate } from "@/lib/client/query";
import { formatDayLabel, formatDayShort, todayKey } from "@/lib/client/format";
import { useHashRoute, replaceHash } from "@/features/shell/router";
import { exerciseUnit, metricsForType } from "@/features/exercises/labels";
import { useToggleFavourite } from "@/features/exercises/use-favourite";
import type { ExerciseDTO, SetDTO, WorkoutExerciseDTO } from "@/lib/types";
import { useMutate } from "@/features/today/use-mutate";
import { useRestState } from "@/features/today/rest-state";
import { RestBar } from "@/features/today/rest-bar";
import {
  ConfirmRemoveExercise,
  ExerciseGroupPopover,
  ExerciseNotesPopover,
} from "@/features/today/card-popovers";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Part 7 LAW 2 — the screen's tour/help contract lives in the screen slot
// (src/features/screens/training.tsx); this module only declares the inline
// training.* steps.

const TABS = ["track", "history", "graph"] as const;
type TabKey = (typeof TABS)[number];
const TAB_LABELS: Record<TabKey, string> = { track: "Track", history: "History", graph: "Graph" };

const RANGE_OPTIONS = [
  { value: "3M", label: "3M", days: 90 },
  { value: "6M", label: "6M", days: 180 },
  { value: "ALL", label: "All", days: null },
] as const;
type RangeValue = (typeof RANGE_OPTIONS)[number]["value"];

/** Metrics that need a secondary parameter (reps / nRM) are omitted — the
 * 48px ControlRow has no room for a 4th control (documented deviation). */
const OMITTED_METRICS = new Set(["WEIGHT_FOR_REPS", "REP_MAXES"]);

/** Map a CardSet patch (SetRow/ExerciseCard contract) onto the API's SetInput. */
function cardPatchToSetInput(patch: Partial<CardSet>): SetInput {
  const out: SetInput = {};
  if ("weightKg" in patch) out.weight = patch.weightKg ?? null;
  if ("reps" in patch) out.reps = patch.reps ?? null;
  if ("distanceM" in patch) out.distance = patch.distanceM ?? null;
  if ("timeSec" in patch) out.timeSec = patch.timeSec ?? null;
  if ("rpe" in patch) out.rpe = patch.rpe ?? null;
  if ("tempo" in patch) out.tempo = patch.tempo ?? null;
  if ("restPlannedSec" in patch) out.restPlannedSec = patch.restPlannedSec ?? null;
  if ("setType" in patch) out.setType = patch.setType ?? "NORMAL";
  if ("note" in patch) out.comment = patch.note ?? null;
  if ("done" in patch) out.isComplete = !!patch.done;
  return out;
}

/** 32px section header — deliberately NOT a data-row (height law). */
function SectionHeader({ label }: { label: string }) {
  return (
    <h2 className="flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span className="truncate">{label}</span>
    </h2>
  );
}

type SetCtx = { workoutId: string; weId: string; ex: ExerciseDTO; sets: SetDTO[] };

type CardHelpers = {
  visibleColumns: CardVisibleColumns;
  toCardExercise: (ex: ExerciseDTO) => CardExercise;
  toCardSets: (sets: SetDTO[]) => CardSet[];
  handleCardAction: (ctx: SetCtx, cardKey: string) => (action: CardAction) => void;
};

export default function TrainingScreen({ exerciseId }: { exerciseId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const route = useHashRoute();
  const invalidate = useInvalidate();
  const mutate = useMutate();
  const rest = useRestState();
  const toggleFavourite = useToggleFavourite();

  // ---------- route query state (?date= · ?tab= — both deep-linkable) ----------
  const routeDate = route.name === "training" ? route.query.get("date") : null;
  const dateKey = routeDate && DATE_RE.test(routeDate) ? routeDate : todayKey();
  const tabParam = route.name === "training" ? route.query.get("tab") : null;
  const tab: TabKey = tabParam === "history" || tabParam === "graph" ? tabParam : "track";

  const todayHref = dateKey === todayKey() ? "/today" : `/today?date=${dateKey}`;

  const switchTab = (t: TabKey) => {
    if (t === tab) return;
    // replaceHash: the URL updates (deep-linkable) without polluting history.
    replaceHash(`#/today/${exerciseId}?date=${dateKey}&tab=${t}`);
  };

  // ---------- data ----------
  const { data: dayData, isLoading: workoutLoading } = useWorkoutByDate(dateKey);
  const workout = dayData?.workout ?? null;

  // Resolve the route param: workout-exercise id first (Today navigates with
  // we.id), library exercise id second (picker History deep-links).
  const we: WorkoutExerciseDTO | null = useMemo(() => {
    if (!workout) return null;
    return (
      workout.exercises.find((w) => w.id === exerciseId) ??
      workout.exercises.find((w) => w.exerciseId === exerciseId) ??
      null
    );
  }, [workout, exerciseId]);

  const libraryQuery = useQuery({
    queryKey: qk.exercise(exerciseId),
    queryFn: () => exercisesApi.get(exerciseId),
    enabled: !we,
    staleTime: 60_000,
    retry: false,
  });

  const exercise: ExerciseDTO | null = we?.exercise ?? libraryQuery.data ?? null;
  const loading = workoutLoading || (!we && libraryQuery.isLoading && !libraryQuery.isError);
  const notFound = !loading && !exercise;

  // previous performance (Track tab) — most recent session before this day
  const lastSets = useQuery({
    queryKey: qk.lastSets(exercise?.id ?? "", workout?.date ?? dateKey),
    queryFn: () => exercisesApi.lastSets(exercise!.id, workout?.date ?? dateKey),
    enabled: !!exercise,
    staleTime: 60_000,
  });

  // full history (History tab)
  const history = useQuery({
    queryKey: qk.exerciseHistory(exercise?.id ?? ""),
    queryFn: () => exercisesApi.history(exercise!.id, 150),
    enabled: !!exercise && tab === "history",
    staleTime: 60_000,
  });

  // ---------- ui state ----------
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesEdited, setNotesEdited] = useState<string | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [restOverrideOpen, setRestOverrideOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  // notes popover draft: edited override → stored notes (no effect needed)
  const notesDraft = notesEdited ?? exercise?.notes ?? "";

  // ---------- "Save set" focus detection (mobile keyboard bar) ----------
  useEffect(() => {
    const check = () => {
      const el = document.activeElement;
      setInputFocused(el instanceof HTMLInputElement && !!el.closest("[data-track-card]"));
    };
    let timer = 0;
    const onOut = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 0);
    };
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", onOut);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  // ---------- set/exercise mutations (p3-3 today-screen wiring, reused) ----------
  const patchSetIn = async (ctx: SetCtx, setId: string, patch: SetInput) => {
    await mutate({
      label: "Set updated",
      run: () => workoutsApi.updateSet(ctx.workoutId, ctx.weId, setId, patch),
      queue: {
        path: `/api/workouts/${ctx.workoutId}/exercises/${ctx.weId}/sets/${setId}`,
        method: "PATCH",
        body: patch,
      },
    });
  };

  const addSetIn = async (ctx: SetCtx) => {
    const payload: SetInput = {
      weight: null,
      reps: null,
      distance: null,
      timeSec: null,
      setType: ctx.ex.defaultSetType ?? "NORMAL",
      rpe: ctx.ex.defaultRpeTarget ?? null,
      tempo: ctx.ex.defaultTempo ?? null,
      restPlannedSec: ctx.ex.restSec ?? null,
    };
    const created = await mutate({
      label: "Set saved",
      run: () => workoutsApi.addSet(ctx.workoutId, ctx.weId, payload),
      queue: {
        path: `/api/workouts/${ctx.workoutId}/exercises/${ctx.weId}/sets`,
        method: "POST",
        body: payload,
      },
    });
    if (!created) return; // queued offline
    if (created.newPr) {
      toast.success("New personal record!", {
        description: `${created.reps} reps at ${created.weight} — best ever`,
      });
    } else {
      toast.success("Set added");
    }
  };

  const toggleDoneIn = async (ctx: SetCtx, set: SetDTO) => {
    const next = !set.isComplete;
    const updated = await mutate({
      label: "Set updated",
      run: () => workoutsApi.updateSet(ctx.workoutId, ctx.weId, set.id, { isComplete: next }),
      queue: {
        path: `/api/workouts/${ctx.workoutId}/exercises/${ctx.weId}/sets/${set.id}`,
        method: "PATCH",
        body: { isComplete: next },
      },
    });
    // ticking ✓ starts the rest clock (warm-ups excluded) — legacy rules
    if (updated && next && (set.setType ?? "NORMAL") !== "WARMUP" && !set.isWarmup) {
      if (settings?.autoRestFromRow ?? true) {
        const restSec = set.restPlannedSec ?? ctx.ex.restSec ?? null;
        if (restSec && restSec > 0) rest.start(restSec, set.id);
        else if (rest.everStarted) rest.start(undefined, set.id);
      } else if (rest.everStarted) {
        rest.start(undefined, set.id);
      }
    }
  };

  const copyLastIn = async (ctx: SetCtx, setId: string) => {
    const sorted = [...ctx.sets].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((s) => s.id === setId);
    if (idx < 0) return;
    const src = [...sorted.slice(0, idx)]
      .reverse()
      .find((s) => s.weight != null || s.reps != null || s.distance != null || s.timeSec != null);
    if (!src) {
      toast.info("No earlier set to copy from");
      return;
    }
    await patchSetIn(ctx, setId, {
      weight: src.weight,
      reps: src.reps,
      distance: src.distance,
      timeSec: src.timeSec,
      rpe: src.rpe ?? null,
      tempo: src.tempo ?? null,
      restPlannedSec: src.restPlannedSec ?? null,
    });
    toast.success("Copied from previous set");
  };

  const removeExerciseFromDay = async () => {
    if (!workout || !we) return;
    await mutate({
      label: "Exercise removed",
      run: () => workoutsApi.removeExercise(workout.id, we.id),
      queue: { path: `/api/workouts/${workout.id}/exercises/${we.id}`, method: "DELETE" },
    });
    toast.success("Exercise removed");
    navigate(todayHref);
  };

  const addExerciseToDay = async () => {
    if (!exercise) return;
    const workoutId = workout?.id ?? (await workoutsApi.createOrGet(dateKey)).id;
    await mutate({
      label: "Exercise added",
      run: () => workoutsApi.addExercise(workoutId, exercise.id),
      queue: {
        path: `/api/workouts/${workoutId}/exercises`,
        method: "POST",
        body: { exerciseId: exercise.id },
      },
    });
    invalidate.workout(dateKey);
    toast.success(`${exercise.name} added`);
  };

  const saveNotes = async () => {
    if (!exercise) return;
    const notes = notesDraft.trim() || null;
    await mutate({
      label: "Notes saved",
      run: () => exercisesApi.update(exercise.id, { notes }),
      queue: { path: `/api/exercises/${exercise.id}`, method: "PATCH", body: { notes } },
    });
    invalidate.exercises();
    invalidate.workout(dateKey);
    setNotesOpen(false);
    setNotesEdited(null);
    toast.success("Notes saved");
  };

  // ---------- card mapping ----------
  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  const toCardExercise = (ex: ExerciseDTO): CardExercise => ({
    id: ex.id,
    name: ex.name,
    categoryLabel: ex.category?.name ?? "Exercise",
    categoryColour: ex.category?.colour ?? "#71717a",
    modality: ex.type,
    unit: exerciseUnit(ex, settings),
    weightIncrement: ex.weightIncrement ?? settings?.defaultWeightIncrement ?? 2.5,
  });

  const toCardSets = (sets: SetDTO[]): CardSet[] =>
    [...sets].sort((a, b) => a.sortOrder - b.sortOrder).map((s, i) => toCardSet(s, i + 1));

  const handleCardAction = (ctx: SetCtx, cardKey: string) => (action: CardAction): void => {
    switch (action.type) {
      case "add-set":
        void addSetIn(ctx);
        break;
      case "update-set":
        void patchSetIn(ctx, action.setId, cardPatchToSetInput(action.patch));
        break;
      case "toggle-done": {
        const set = ctx.sets.find((s) => s.id === action.setId);
        if (set) void toggleDoneIn(ctx, set);
        break;
      }
      case "copy-last":
        void copyLastIn(ctx, action.setId);
        break;
      case "rest-timer":
        rest.start(ctx.ex.restSec ?? undefined, action.setId ?? null);
        break;
      case "open":
        navigate(`/exercise-overview/${ctx.ex.id}`);
        break;
      case "select":
        toast.info("Multi-select arrives with the next build");
        break;
      default:
        break; // notes/toggle-collapse are intercepted by the tab components
    }
  };

  const restActive = rest.remainingSec != null;
  const showSaveSet = tab === "track" && !restActive && inputFocused;

  // ---------- render ----------
  const titleNode = (
    <span className="flex min-w-0 items-center gap-2">
      {exercise ? (
        <span
          className="h-2.5 w-2.5 flex-none rounded-full"
          style={{ backgroundColor: exercise.category?.colour ?? "#71717a" }}
          aria-hidden
        />
      ) : null}
      <span className="truncate">{loading ? "…" : (exercise?.name ?? "Exercise not found")}</span>
    </span>
  );

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
              tour={{ id: "training.back", label: "Back", help: "Return to the day you came from.", order: 10 }}
              onClick={() => navigate(todayHref)}
              aria-label="Go back to the day"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title={titleNode}
          actions={
            <>
              {exercise ? (
                <>
                {/* Notes — per-exercise note editor (anchored popover) */}
                <Popover
                  open={notesOpen}
                  onOpenChange={(o) => {
                    setNotesOpen(o);
                    if (o) setNotesEdited(null);
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 flex-none"
                      aria-label="Exercise notes"
                      tour={{ id: "training.notes", label: "Notes", help: "Read or edit your private cues for this exercise.", order: 50 }}
                    >
                      <MessageSquareText className="h-5 w-5" aria-hidden />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Exercise notes
                    </p>
                    <Textarea
                      value={notesDraft}
                      onChange={(e) => setNotesEdited(e.target.value)}
                      aria-label="Exercise notes"
                      placeholder="Cues, setup, grip width…"
                      className="mt-2 min-h-24"
                      {...tourAttrs({ skipTour: true, reason: "Notes editor inside the anchored notes popover" })}
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        tour={{ skipTour: true, reason: "Cancel control inside the notes popover" }}
                        onClick={() => {
                          setNotesOpen(false);
                          setNotesEdited(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        tour={{ skipTour: true, reason: "Save control inside the notes popover" }}
                        onClick={() => void saveNotes()}
                      >
                        <Check className="h-4 w-4" aria-hidden /> Save
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                {/* Records → the exercise overview screen */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 flex-none"
                  aria-label="Records"
                  tour={{ id: "training.records", label: "Records", help: "Open records and details for this exercise.", order: 60 }}
                  onClick={() => navigate(`/exercise-overview/${exercise.id}`)}
                >
                  <Medal className="h-5 w-5" aria-hidden />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 flex-none"
                      aria-label="More actions"
                      tour={{ id: "training.menu", label: "Exercise menu", help: "Replace, group, rest override, remove or favourite.", order: 70 }}
                    >
                      <MoreVertical className="h-5 w-5" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      disabled={!we}
                      onClick={() => navigate(`/exercises?replace=${we?.id}&date=${dateKey}`)}
                    >
                      <ArrowLeftRight className="h-4 w-4" aria-hidden /> Replace
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!we} onClick={() => setGroupOpen(true)}>
                      <Boxes className="h-4 w-4" aria-hidden /> Add to group
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRestOverrideOpen(true)}>
                      <Timer className="h-4 w-4" aria-hidden /> Rest timer
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!we}
                      className="text-destructive focus:text-destructive"
                      onClick={() => setRemoveOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden /> Remove from workout
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void toggleFavourite(exercise)}>
                      <Plus className="h-4 w-4" aria-hidden />
                      {exercise.isFavorite ? "Unfavourite" : "Favourite"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* popover-after-menu handoff anchors: their trigger spans are
                    absolutely positioned inside this (harness-excluded) wrapper */}
                <span className="relative">
                  {groupOpen && we && workout ? (
                    <ExerciseGroupPopover
                      workout={workout}
                      we={we}
                      open
                      onClose={() => setGroupOpen(false)}
                    />
                  ) : null}
                  {restOverrideOpen ? (
                    <RestOverridePopover
                      open
                      onClose={() => setRestOverrideOpen(false)}
                      onStart={rest.start}
                    />
                  ) : null}
                </span>
                </>
              ) : null}
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        <div className="grid h-12 w-full grid-cols-3" role="tablist" aria-label="Training tabs">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              {...tourAttrs(
                t === "track"
                  ? { id: "training.tabTrack", label: "Track tab", help: "Log this exercise's sets for the day.", order: 20 }
                  : t === "history"
                    ? { id: "training.tabHistory", label: "History tab", help: "Browse every past session of this exercise.", order: 30 }
                    : { id: "training.tabGraph", label: "Graph tab", help: "Chart this exercise's progress over time.", order: 40 },
              )}
              onClick={() => switchTab(t)}
              className={cn(
                "flex h-12 min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap text-sm font-semibold transition-colors",
                tab === t ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="leading-none">{TAB_LABELS[t]}</span>
              <span
                className={cn("h-0.5 w-8 rounded-full", tab === t ? "bg-primary" : "bg-transparent")}
                aria-hidden
              />
            </button>
          ))}
        </div>
      }
      bottomBar={
        restActive || showSaveSet ? (
          <BottomBar>
            {restActive ? (
              <RestBar
                display={formatDuration(rest.remainingSec ?? 0)}
                onAdjust={rest.adjust}
                onSkip={rest.skip}
              />
            ) : (
              <Button
                type="button"
                className="h-11 w-full gap-2 text-base font-bold"
                tour={{ id: "training.saveSet", label: "Save set", help: "Commit the set value you just typed.", order: 80 }}
                // preventDefault keeps focus on the input (no unmount race)
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const el = document.activeElement;
                  if (el instanceof HTMLInputElement) el.blur(); // blur commits the draft
                }}
              >
                <Check className="h-5 w-5" aria-hidden />
                Save set
              </Button>
            )}
          </BottomBar>
        ) : undefined
      }
    >
      <ScrollBody>
        {loading ? (
          <DaySkeleton />
        ) : notFound ? (
          <p className="px-1 text-sm text-muted-foreground">This exercise could not be found.</p>
        ) : exercise ? (
          tab === "track" ? (
            <TrackTab
              key={exercise.id}
              exercise={exercise}
              we={we}
              workoutId={workout?.id ?? null}
              dateKey={dateKey}
              visibleColumns={visibleColumns}
              toCardExercise={toCardExercise}
              toCardSets={toCardSets}
              handleCardAction={handleCardAction}
              lastSets={lastSets}
              onAddToDay={() => void addExerciseToDay()}
            />
          ) : tab === "history" ? (
            <HistoryTab
              key={exercise.id}
              exercise={exercise}
              currentWorkoutId={workout?.id ?? null}
              history={history}
              visibleColumns={visibleColumns}
              toCardExercise={toCardExercise}
              toCardSets={toCardSets}
              handleCardAction={handleCardAction}
            />
          ) : (
            <GraphTab key={exercise.id} exercise={exercise} />
          )
        ) : null}

        {we && workout ? (
          <ConfirmRemoveExercise
            exerciseName={we.exercise.name}
            open={removeOpen}
            onClose={() => setRemoveOpen(false)}
            onConfirm={() => void removeExerciseFromDay()}
          />
        ) : null}
      </ScrollBody>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TRACK — "Now" (the day's sets, editable) + "Last time" (previous performance)
// ─────────────────────────────────────────────────────────────────────────────

function TrackTab({
  exercise,
  we,
  workoutId,
  dateKey,
  visibleColumns,
  toCardExercise,
  toCardSets,
  handleCardAction,
  lastSets,
  onAddToDay,
}: {
  exercise: ExerciseDTO;
  we: WorkoutExerciseDTO | null;
  workoutId: string | null;
  dateKey: string;
  lastSets: { data?: { date: string | null; sets: SetDTO[] }; isLoading: boolean };
  onAddToDay: () => void;
} & CardHelpers) {
  const cardEx = toCardExercise(exercise);
  const lastDate = lastSets.data?.date ?? null;
  const lastSetsList = lastSets.data?.sets ?? [];

  // local state for the previous-performance card (notes popover + collapse)
  const [lastExpanded, setLastExpanded] = useState(false);
  const [lastNotesOpen, setLastNotesOpen] = useState(false);

  const lastAction = (action: CardAction) => {
    if (action.type === "toggle-collapse") {
      setLastExpanded((v) => !v);
      return;
    }
    if (action.type === "notes") {
      setLastNotesOpen(true);
      return;
    }
    handleCardAction(
      { workoutId: "", weId: "", ex: exercise, sets: lastSetsList },
      "last",
    )(action);
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader label={`Now · ${formatDayShort(dateKey)}`} />
      {we && workoutId ? (
        <div data-track-card className="flex-none">
          <ExerciseCard
            mode="edit"
            hideHeader
            exercise={cardEx}
            sets={toCardSets(we.sets)}
            visibleColumns={visibleColumns}
            onAction={handleCardAction(
              { workoutId, weId: we.id, ex: exercise, sets: we.sets },
              "track",
            )}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <p className="px-1 text-sm text-muted-foreground">
            {exercise.name} is not in this workout yet.
          </p>
          <button
            type="button"
            data-row
            {...tourAttrs({ id: "training.addToDay", label: "Add to day", help: "Add this exercise to the day's workout.", order: 90 })}
            className="flex h-12 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3 text-sm font-semibold transition-colors hover:bg-accent"
            onClick={onAddToDay}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add to this workout
          </button>
        </div>
      )}

      <SectionHeader label="Last time" />
      {lastSets.isLoading ? (
        <Skeleton className="h-14 rounded-lg" />
      ) : lastDate && lastSetsList.length > 0 ? (
        <div className="relative flex-none">
          <ExerciseCard
            mode="read"
            collapsed={!lastExpanded}
            exercise={cardEx}
            sets={toCardSets(lastSetsList)}
            visibleColumns={visibleColumns}
            onAction={lastAction}
          />
          {lastNotesOpen ? (
            <ExerciseNotesPopover exercise={exercise} open onClose={() => setLastNotesOpen(false)} />
          ) : null}
        </div>
      ) : (
        <p className="px-1 text-sm text-muted-foreground">
          No previous session — this is the first time.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY — DateGroup×N; tapping a row toggles that card (only) to edit mode
// ─────────────────────────────────────────────────────────────────────────────

type HistoryEntry = {
  workoutId: string;
  date: string;
  workoutExerciseId: string;
  sets: SetDTO[];
};

function HistoryTab({
  exercise,
  currentWorkoutId,
  history,
  visibleColumns,
  toCardExercise,
  toCardSets,
  handleCardAction,
}: {
  exercise: ExerciseDTO;
  currentWorkoutId: string | null;
  history: { data?: HistoryEntry[]; isLoading: boolean };
} & CardHelpers) {
  // per-card edit state: the workoutExerciseId currently in edit mode
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [notesEntryId, setNotesEntryId] = useState<string | null>(null);

  if (history.isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading history">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  const entries = [...(history.data ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));

  if (entries.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-sm text-muted-foreground">
        No history yet — today is the first time you train this exercise.
      </p>
    );
  }

  const cardEx = toCardExercise(exercise);

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => {
        const dayKey = entry.date.slice(0, 10);
        const editing = editEntryId === entry.workoutExerciseId;
        const entryAction = (action: CardAction) => {
          if (action.type === "notes") {
            setNotesEntryId(entry.workoutExerciseId);
            return;
          }
          handleCardAction(
            {
              workoutId: entry.workoutId,
              weId: entry.workoutExerciseId,
              ex: exercise,
              sets: entry.sets,
            },
            entry.workoutExerciseId,
          )(action);
        };
        return (
          <div key={entry.workoutExerciseId} className="flex flex-col">
            <h2 className="flex h-8 flex-none items-center gap-2 overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span className="truncate">{formatDayLabel(dayKey)}</span>
              <span className="truncate text-[10px] font-medium normal-case tracking-normal text-muted-foreground/70">
                {entry.workoutId === currentWorkoutId ? "this day" : `${entry.sets.length} sets`}
              </span>
            </h2>
            <div
              role="button"
              tabIndex={0}
              {...tourAttrs({ id: "training.historyEntry", label: "History entry", help: "Tap a past session to edit its sets inline.", order: 100 })}
              aria-label={`${editing ? "Stop editing" : "Edit"} sets from ${formatDayLabel(dayKey)}`}
              className="flex-none cursor-pointer"
              onClick={(e) => {
                // taps on the card's own controls (buttons/inputs) never toggle
                if ((e.target as HTMLElement).closest("button, input, textarea, a")) return;
                setEditEntryId(editing ? null : entry.workoutExerciseId);
              }}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setEditEntryId(editing ? null : entry.workoutExerciseId);
                }
              }}
            >
              <ExerciseCard
                mode={editing ? "edit" : "read"}
                hideHeader
                exercise={cardEx}
                sets={toCardSets(entry.sets)}
                visibleColumns={visibleColumns}
                className={editing ? "ring-1 ring-primary/40" : undefined}
                onAction={entryAction}
              />
            </div>
            {notesEntryId === entry.workoutExerciseId ? (
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GRAPH — ControlRow → fixed chart box → reserved 72px DetailRow
// ─────────────────────────────────────────────────────────────────────────────

type GraphPoint = { date: string; value: number; prev?: number | null; next?: number | null };
type ChartDatum = GraphPoint & {
  label: string;
  prev: number | null;
  next: number | null;
  trend?: number;
};

function GraphTab({ exercise }: { exercise: ExerciseDTO }) {
  const settings = useApp((s) => s.settings);

  const allowed = useMemo(
    () =>
      metricsForType(exercise.type)
        .filter((m) => !OMITTED_METRICS.has(m))
        .map((m) => ({ value: m, label: metricLabel(m) })),
    [exercise.type],
  );

  const defaultMetric = allowed.some((m) => m.value === exercise.defaultGraph)
    ? (exercise.defaultGraph as string)
    : (allowed[0]?.value ?? "MAX_WEIGHT");

  const [metric, setMetric] = useState<string>(defaultMetric);
  const [range, setRange] = useState<RangeValue>("ALL");
  const [showPoints, setShowPoints] = useState(true);
  const [showTrend, setShowTrend] = useState(true);
  const [fromZero, setFromZero] = useState(false);
  const [selected, setSelected] = useState<GraphPoint | null>(null);
  const onSelectPoint = useCallback((p: GraphPoint | null) => setSelected(p), []);

  const rangeDays = RANGE_OPTIONS.find((r) => r.value === range)?.days ?? null;
  const from = rangeDays ? addDays(todayKey(), -rangeDays) : undefined;

  const graph = useQuery({
    queryKey: qk.exerciseGraph(exercise.id, { metric, from: from ?? "" }),
    queryFn: () => exercisesApi.graph(exercise.id, { metric, from }),
    staleTime: 60_000,
  });

  const points = graph.data?.points ?? [];
  const fmt = metricValueFmt(metric, exerciseUnit(exercise, settings));

  const data = useMemo<ChartDatum[]>(() => {
    const base: ChartDatum[] = points.map((p, i) => ({
      ...p,
      prev: i > 0 ? points[i - 1].value : null,
      next: i < points.length - 1 ? points[i + 1].value : null,
      label: formatDayShort(p.date),
    }));
    if (showTrend && base.length >= 3) {
      // simple least-squares trend line (same math as the shared TrendChart)
      const n = base.length;
      const xs = base.map((_, i) => i);
      const ys = base.map((p) => p.value);
      const meanX = xs.reduce((a, b) => a + b, 0) / n;
      const meanY = ys.reduce((a, b) => a + b, 0) / n;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (xs[i] - meanX) * (ys[i] - meanY);
        den += (xs[i] - meanX) ** 2;
      }
      const slope = den === 0 ? 0 : num / den;
      const intercept = meanY - slope * meanX;
      return base.map((p, i) => ({ ...p, trend: Math.round((intercept + slope * i) * 100) / 100 }));
    }
    return base;
  }, [points, showTrend]);

  return (
    <div className="flex flex-col gap-3">
      {/* ControlRow — 48px data-row: metric | range | ⋮ options */}
      <div data-row className="flex h-12 items-center gap-2 overflow-hidden whitespace-nowrap">
        <Select
          value={metric}
          onValueChange={setMetric}
          {...tourAttrs({ skipTour: true, reason: "Metric select root renders no DOM node" })}
        >
          <SelectTrigger
            className="h-11 min-w-0 flex-1 rounded-lg text-sm font-semibold"
            aria-label="Graph metric"
            {...tourAttrs({ id: "training.metric", label: "Metric", help: "Choose what the graph plots.", order: 110 })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowed.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={range}
          onValueChange={(v) => setRange(v as RangeValue)}
          {...tourAttrs({ skipTour: true, reason: "Range select root renders no DOM node" })}
        >
          <SelectTrigger
            className="h-11 w-[88px] flex-none rounded-lg text-sm font-semibold"
            aria-label="Graph range"
            {...tourAttrs({ id: "training.range", label: "Range", help: "Limit the graph to 3M, 6M or all time.", order: 120 })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-11 flex-none px-0"
              aria-label="Chart options"
              tour={{ id: "training.chartOptions", label: "Chart options", help: "Toggle points, trend line and zero-based axis.", order: 130 }}
            >
              <MoreVertical className="h-5 w-5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuCheckboxItem checked={showPoints} onCheckedChange={(v) => setShowPoints(!!v)}>
              Show points
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showTrend} onCheckedChange={(v) => setShowTrend(!!v)}>
              Trend line
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={fromZero} onCheckedChange={(v) => setFromZero(!!v)}>
              Y axis from zero
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Chart box — fixed height; charts may scale internally (allowed exemption) */}
      <div className="flex h-[240px] flex-none items-center justify-center overflow-hidden rounded-lg border bg-card p-2 lg:h-[360px]">
        {graph.isLoading ? (
          <Skeleton className="h-full w-full rounded-lg" />
        ) : points.length === 0 ? (
          <p className="px-4 text-center text-sm text-muted-foreground">No data to chart yet</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={48}
                domain={fromZero ? [0, "auto"] : ["auto", "auto"]}
                tickFormatter={(v: number) => fmt(v)}
              />
              <Tooltip content={<GraphTooltip formatter={fmt} onSelect={onSelectPoint} />} />
              {showTrend && data[0]?.trend != null ? (
                <Line
                  type="linear"
                  dataKey="trend"
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ) : null}
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={showPoints ? { r: 3, fill: "var(--primary)", strokeWidth: 0 } : false}
                activeDot={{
                  r: 5,
                  fill: "var(--primary)",
                  strokeWidth: 2,
                  stroke: "var(--background)",
                }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* DetailRow — fixed 72px, always reserved; `–` when nothing selected */}
      <div data-row className={cn(rowHero, "gap-3 px-3")}>
        {selected ? (
          <>
            <span className="flex-none text-sm font-semibold">{formatDayShort(selected.date)}</span>
            <span className="flex-none text-xl font-bold tabular-nums text-primary">
              {fmt(selected.value)}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {selected.prev != null ? `prev ${fmt(selected.prev)}` : ""}
              {selected.prev != null && selected.next != null ? " · " : ""}
              {selected.next != null ? `next ${fmt(selected.next)}` : ""}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">–</span>
        )}
      </div>
    </div>
  );
}

function GraphTooltip({
  active,
  payload,
  formatter,
  onSelect,
}: {
  active?: boolean;
  payload?: Array<{ payload: GraphPoint }>;
  formatter: (v: number) => string;
  onSelect: (p: GraphPoint | null) => void;
}) {
  const point = active && payload?.length ? payload[0].payload : null;
  useEffect(() => {
    if (point) onSelect(point);
  });
  if (!point) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{formatDayShort(point.date)}</p>
      <p className="font-bold tabular-nums text-primary">{formatter(point.value)}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rest timer override popover (⋮ → "Rest timer") — presets + custom seconds
// ─────────────────────────────────────────────────────────────────────────────

const REST_PRESETS = [30, 60, 90, 120, 180];

function RestOverridePopover({
  open,
  onClose,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (sec?: number, setId?: string | null) => void;
}) {
  const [custom, setCustom] = useState("");
  const startCustom = () => {
    const n = Number(custom);
    if (n > 0) {
      onStart(n, null);
      onClose();
    }
  };
  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        <span className="absolute h-1 w-1" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64" onFocusOutside={(e) => e.preventDefault()}>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Rest timer override
        </p>
        <div className="mt-2 grid grid-cols-5 gap-1">
          {REST_PRESETS.map((sec) => (
            <Button
              key={sec}
              type="button"
              variant="outline"
              size="sm"
              tour={{ skipTour: true, reason: "Rest presets inside the override popover" }}
              className="h-9 px-0 text-xs font-bold tabular-nums"
              onClick={() => {
                onStart(sec, null);
                onClose();
              }}
            >
              {sec}s
            </Button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="Seconds"
            aria-label="Custom rest seconds"
            {...tourAttrs({ skipTour: true, reason: "Custom seconds field inside the rest popover" })}
            className="h-9 min-w-0 flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                startCustom();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            className="h-9 flex-none"
            disabled={!Number(custom)}
            tour={{ skipTour: true, reason: "Start control inside the rest override popover" }}
            onClick={startCustom}
          >
            <Timer className="h-4 w-4" aria-hidden /> Start
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DaySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading training screen">
      <SectionHeader label="Now" />
      <div className="h-40 animate-pulse rounded-lg bg-muted/40" />
      <SectionHeader label="Last time" />
      <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
    </div>
  );
}

// ---------- small local helpers (metric labels/formatting for this screen) ----------

function metricLabel(m: string): string {
  return (
    {
      EST_1RM: "Est. 1RM",
      MAX_WEIGHT: "Max weight",
      VOLUME: "Volume",
      TOTAL_REPS: "Total reps",
      MAX_REPS: "Max reps",
      MAX_DISTANCE: "Max distance",
      MAX_TIME: "Max time",
      MAX_SPEED: "Max speed",
      MAX_PACE: "Best pace",
      AVG_REST: "Avg rest",
    } as Record<string, string>
  )[m] ?? m;
}

function metricValueFmt(metric: string, unit: string): (v: number) => string {
  switch (metric) {
    case "VOLUME":
      return (v) => `${Math.round(v).toLocaleString()}`;
    case "EST_1RM":
    case "MAX_WEIGHT":
      return (v) => `${Math.round(v * 10) / 10} ${unit}`;
    case "TOTAL_REPS":
    case "MAX_REPS":
      return (v) => String(Math.round(v));
    case "MAX_DISTANCE":
      return (v) => `${Math.round(v * 100) / 100} km`;
    case "MAX_TIME":
    case "AVG_REST":
      return (v) => formatDuration(v);
    case "MAX_SPEED":
      return (v) => `${Math.round(v * 10) / 10} km/h`;
    case "MAX_PACE":
      return (v) => `${Math.round(v * 100) / 100}/km`;
    default:
      return (v) => String(Math.round(v * 100) / 100);
  }
}

function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
