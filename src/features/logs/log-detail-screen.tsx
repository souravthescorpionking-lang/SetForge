"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LogDetailScreen — #/logs/{workoutId} (Part 9 §8 Log detail).
//
//   TopBar (56)  : BackButton(→ #/logs) · log name (sourceLabel-derived) · ⋮
//                  [Edit sets (live only) · Save as session · Move date · Share
//                  · Rearrange (#/session/arrange?date=… — the existing workout
//                  arrange flow writes workoutsApi.reorderExercises) · Replace
//                  exercise… (inline §5.2-pattern flow writing
//                  workoutsApi.updateExercise({exerciseId}) — THIS log only,
//                  sets kept) · Notes (log-scoped workout comment editor) ·
//                  Delete (confirm)]
//   ScrollBody   : §8 header — "Started 07:32" · duration (zero units dropped)
//                  · difficulty pill · sourceLabel · muscle chips (32px
//                  scroller, union of the exercises' primary muscles)
//                  · GroupCard ×N in VIEW mode fed the PERFORMED sets (reps row
//                  "100·5", AMRAP → "AMRAP→{actual}", tempo row) with a §8
//                  footer per exercise:
//                      "Max weight logged: {v} {unit}" (N/A when none)
//                      set table — 32px rows Set | Type | Reps | Weight,
//                         type short W/N/D/F, AMRAP stays "AMRAP"
//                      Rest expand (40px) — actual list "45s · 60s · —",
//                         planned values fill the gaps
//                      "Edit history" (40px) → #/session/exercise/{weId}?
//                         date={log}&tab=history — the existing per-exercise
//                         history editor, opened scrolled to this exercise
//   BottomBar    : "Repeat this session" (primary) — swapped to Cancel/Apply
//                  while the replace or notes editors are open (ONE primary).
//
// Deviations documented in the worklog: WorkoutExercise carries no per-exercise
// note field, so log-scoped "Notes" edits the WORKOUT comment (the schema's
// only log-scoped note); "Rearrange"/"Edit history" reuse by-date flows, which
// target the latest session of the log's date (this log on single-session days).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, BottomBar } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowRightLeft,
  ArrowDownUp,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  MessageSquareText,
  MoreVertical,
  PencilRuler,
  Repeat2,
  Replace,
  RotateCw,
  Share2,
  Timer,
  TriangleAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import { GroupCard, GroupCardStack, toCardSet, type GroupMenuItem } from "@/components/group-card";
import type { CardAction, CardExercise, CardSet, CardVisibleColumns } from "@/components/group-card";
import { deriveGroups, memberCode } from "@/lib/grouping";
import { useApp } from "@/lib/client/store";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import {
  ApiError,
  exerciseSuggestionsApi,
  sessionsApi,
  workoutLifecycleApi,
  workoutsApi,
} from "@/lib/client/api";
import { dayKeyOf, formatDayLabel, formatDurationParts, round1, round2, todayKey } from "@/lib/client/format";
import { formatRestSec, MUSCLE_LABELS, muscleColour, type Muscle } from "@/lib/constants";
import { rowTall } from "@/lib/ui/tokens";
import { exerciseUnit } from "@/features/exercises/labels";
import { DatePickerDialog } from "@/features/schedule/schedule-shared";
import { errorMessage } from "@/features/routines/screen-helpers";
import { hapticWarning } from "@/lib/client/haptics";
import type {
  ExerciseSuggestionDTO,
  SetDTO,
  SettingsDTO,
  WorkoutDTO,
  WorkoutExerciseDTO,
} from "@/lib/types";
import { logDetailName, setTypeShort, startedAtLabel } from "./log-shared";

const muscleLabel = (m: string) => MUSCLE_LABELS[m as Muscle] ?? m.replace(/_/g, " ").toLowerCase();

// ---------- pure mapping ----------

/** WorkoutExerciseDTO → CardExercise (Part 8 per-exercise column flags included). */
function toCardExercise(we: WorkoutExerciseDTO, settings: SettingsDTO | null): CardExercise {
  const ex = we.exercise;
  return {
    id: ex.id,
    name: ex.name,
    categoryLabel: ex.category?.name ?? "Exercise",
    categoryColour: ex.category?.colour ?? "#71717a",
    modality: ex.type,
    unit: exerciseUnit(ex, settings),
    weightIncrement: ex.weightIncrement ?? settings?.defaultWeightIncrement ?? 2.5,
    showRpe: ex.showRpe,
    showTempo: ex.showTempo,
    showRest: ex.showRest,
    transitionRestSec: ex.transitionRestSec,
  };
}

/**
 * Performed SetDTO[] → view-mode CardSet[]: distance km→m ("6.5 km" not "6.5 m")
 * and restPlannedSec STRIPPED — §8 renders its own actual-rest expand in the
 * entry footer, so the card's built-in planned-rest row stays suppressed.
 */
function toPerformedCardSets(sets: SetDTO[]): CardSet[] {
  return [...sets]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s, i) =>
      toCardSet(
        { ...s, distance: s.distance != null ? s.distance * 1000 : null, restPlannedSec: null },
        i + 1,
      ),
    );
}

/** Performed tonnage of one session (mirrors mapWorkoutSummary server-side). */
function workoutStats(workout: WorkoutDTO): { setCount: number; volume: number; distance: number } {
  let setCount = 0;
  let volume = 0;
  let distance = 0;
  for (const we of workout.exercises) {
    for (const s of we.sets) {
      if (!s.isComplete || s.isWarmup) continue;
      setCount++;
      volume += (s.weight ?? 0) * (s.reps ?? 0);
      distance += s.distance ?? 0;
    }
  }
  return { setCount, volume, distance };
}

/** §8 duration: stored durationSec, else legacy startAt→(endAt|finishedAt). */
function logDurationSec(workout: WorkoutDTO): number {
  if (workout.durationSec != null) return workout.durationSec;
  if (workout.startAt) {
    const end = workout.endAt ?? workout.finishedAt;
    if (end) return Math.max(0, Math.round((new Date(end).getTime() - new Date(workout.startAt).getTime()) / 1000));
  }
  return 0;
}

/** 32px section header — not a data-row (height law). */
function SectionHeader({ label }: { label: string }) {
  return (
    <h2 className="flex h-8 flex-none items-center gap-2 overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span className="truncate">{label}</span>
      <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
    </h2>
  );
}

// ---------- §8 per-exercise footer (max weight · set table · rest · history) ----------

function PerformedFooter({
  we,
  settings,
  isRemoved,
  onEditHistory,
}: {
  we: WorkoutExerciseDTO;
  settings: SettingsDTO | null;
  isRemoved: boolean;
  onEditHistory: (we: WorkoutExerciseDTO) => void;
}) {
  const [restOpen, setRestOpen] = useState(false);
  const unit = exerciseUnit(we.exercise, settings);
  const sets = useMemo(() => [...we.sets].sort((a, b) => a.sortOrder - b.sortOrder), [we.sets]);

  // Max weight: heaviest logged, non-warm-up set of THIS exercise in THIS log.
  // A set counts when it carries a weight value (performed or prefilled by the
  // template) — completion state alone would show "N/A" on legacy logs whose
  // rows were never checked off. Warm-up ramps stay excluded (same rule the
  // PR engine uses).
  const maxWeight = sets.reduce<number | null>((max, s) => {
    if (s.isWarmup || s.weight == null) return max;
    return max == null || s.weight > max ? s.weight : max;
  }, null);

  // Actual rest list, planned values filling the gaps ("45s · 60s · —").
  const restList = sets.map((s) =>
    s.restActualSec != null ? `${s.restActualSec}s` : s.restPlannedSec != null ? `${s.restPlannedSec}s` : "—",
  );
  const anyRest = restList.some((r) => r !== "—");

  return (
    <div className="flex flex-col gap-1 pb-1">
      {/* Max weight logged */}
      <div data-row className="flex h-8 w-full items-center gap-2 overflow-hidden whitespace-nowrap px-2">
        <span className="flex-none text-xs font-medium leading-none text-muted-foreground">Max weight logged:</span>
        <span
          className={cn(
            "truncate text-xs font-bold leading-none tabular-nums",
            maxWeight != null ? "text-foreground" : "text-muted-foreground/60",
          )}
        >
          {maxWeight != null ? `${round1(maxWeight)} ${unit}` : "N/A"}
        </span>
      </div>

      {/* §8 set table — 32px header + 32px data rows */}
      {sets.length > 0 ? (
        <div
          {...tourAttrs({ id: "logDetail.setTable", label: "Set table", help: "Performed sets: number, short type, reps and weight.", order: 150 })}
          className="overflow-hidden rounded-lg border border-border/60 bg-muted/15"
        >
          <div
            data-row
            aria-hidden
            className="grid h-8 w-full grid-cols-[40px_56px_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-1 overflow-hidden whitespace-nowrap border-b border-border/60 bg-muted/40 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            <span className="text-center">Set</span>
            <span className="text-center">Type</span>
            <span className="min-w-0 truncate">Reps</span>
            <span className="min-w-0 truncate text-right">Weight</span>
          </div>
          {sets.map((s, i) => {
            const reps =
              s.reps != null
                ? String(s.reps)
                : s.timeSec != null
                  ? formatRestSec(s.timeSec)
                  : s.distance != null
                    ? `${round2(s.distance)} km`
                    : "—";
            const weight = s.weight != null ? `${round1(s.weight)} ${unit}` : "—";
            return (
              <div
                key={s.id}
                data-row
                aria-label={`Set ${i + 1}: ${setTypeShort(s.setType)}, ${reps}${weight !== "—" ? `, ${weight}` : ""}`}
                className="grid h-8 w-full grid-cols-[40px_56px_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-1 overflow-hidden whitespace-nowrap px-2 text-xs leading-none tabular-nums"
              >
                <span className="text-center text-muted-foreground">{i + 1}</span>
                <span className="text-center font-semibold text-muted-foreground">{setTypeShort(s.setType)}</span>
                <span className="flex min-w-0 items-center gap-1">
                  <span className="min-w-0 truncate">{reps}</span>
                  {s.newPr ? <span aria-hidden className="text-[10px] leading-none">🏆</span> : null}
                </span>
                <span className="min-w-0 truncate text-right">{weight}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Rest expand — actual list, planned fallback */}
      {anyRest ? (
        <button
          type="button"
          data-row
          {...tourAttrs({ id: "logDetail.restRow", label: "Rest row", help: "Actual rest between sets; planned values fill the gaps.", order: 140 })}
          aria-expanded={restOpen}
          aria-label={`Rest between sets of ${we.exercise.name}`}
          onClick={() => setRestOpen((o) => !o)}
          className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg px-2 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Timer className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          <span className="flex-none text-xs font-semibold leading-none text-muted-foreground">Rest</span>
          <span className="min-w-0 flex-1 truncate text-xs leading-none tabular-nums text-muted-foreground">
            {restOpen
              ? restList.join(" · ")
              : `${sets.length}× · ${restList.slice(0, 2).join(" · ")}${restList.length > 2 ? " …" : ""}`}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", !restOpen && "-rotate-90")}
            aria-hidden
          />
        </button>
      ) : null}

      {/* Edit history → the existing per-exercise history editor */}
      {!isRemoved ? (
        <button
          type="button"
          data-row
          {...tourAttrs({ id: "logDetail.editHistory", label: "Edit history", help: "Open this exercise's past sessions and edit the sets inline.", order: 130 })}
          aria-label={`Edit history for ${we.exercise.name}`}
          onClick={() => onEditHistory(we)}
          className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg px-2 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <History className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          <span className="flex-none text-xs font-semibold leading-none text-muted-foreground">Edit history</span>
          <ChevronRight className="ml-auto h-4 w-4 flex-none text-muted-foreground/60" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

// ---------- §8 header: muscle chips ----------

function MuscleChipRow({ muscles }: { muscles: string[] }) {
  return (
    <div
      data-row
      data-chip-scroller
      role="group"
      aria-label="Primary muscles"
      className="no-scrollbar flex h-8 w-full flex-none items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
    >
      {muscles.map((m) => (
        <span
          key={m}
          {...tourAttrs({ skipTour: true, reason: "Data-driven muscle chips derived from the logged exercises" })}
          className="flex h-6 flex-none items-center gap-1.5 rounded-full border bg-card px-2 text-[11px] font-semibold leading-none"
        >
          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: muscleColour(m) }} aria-hidden />
          {muscleLabel(m)}
        </span>
      ))}
    </div>
  );
}

// ---------- per-exercise … menu (REPLACES the GroupCard default) ----------

const LOG_MENU: GroupMenuItem[] = [
  { icon: Replace, label: "Replace exercise", action: { type: "replace" } },
  { icon: PencilRuler, label: "Edit history", action: { type: "history", exerciseId: "" } },
  { icon: History, label: "Exercise detail", action: { type: "detail", exerciseId: "" } },
];

// ---------- screen ----------

export default function LogDetailScreen({ workoutId }: { workoutId: string }) {
  return <LogDetailInner key={workoutId} workoutId={workoutId} />;
}

function LogDetailInner({ workoutId }: { workoutId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const invalidate = useInvalidate();
  const online = useOnline();

  // full workout tree — key shares the ["workout"] prefix so invalidate().workout() refreshes it
  const workoutQuery = useQuery({
    queryKey: ["workout", "byId", workoutId],
    queryFn: () => workoutsApi.get(workoutId),
    retry: false, // 404s should surface immediately
  });
  const workout = workoutQuery.data ?? null;

  const dayKey = workout ? dayKeyOf(workout.date) : "";
  const isRemoved = workout?.removedAt != null;
  const isToday = !!workout && dayKey === todayKey();
  const isLive = !!workout && isToday && !workout.finishedAt && !isRemoved;

  const logName = workout ? logDetailName(workout) : "Log detail";
  const stats = useMemo(() => (workout ? workoutStats(workout) : null), [workout]);
  const durationSec = workout ? logDurationSec(workout) : 0;
  const muscles = useMemo(() => {
    const seen: string[] = [];
    for (const we of workout?.exercises ?? []) {
      for (const m of we.exercise.primaryMuscles ?? []) {
        if (!seen.includes(m)) seen.push(m);
      }
    }
    return seen;
  }, [workout]);

  // ---------- read-mode group cards ----------
  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  const exercises = useMemo(
    () => (workout ? [...workout.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [workout],
  );
  const groups = useMemo(() => deriveGroups(exercises), [exercises]);
  const groupById = useMemo(() => {
    const m = new Map<string, WorkoutDTO["groups"][number]>();
    for (const g of workout?.groups ?? []) m.set(g.id, g);
    return m;
  }, [workout]);

  // §8 "Edit history" → the existing per-exercise editor (training screen
  // history tab) resolved BY DATE for this log's date, scrolled to this exercise.
  const openEditHistory = (we: WorkoutExerciseDTO) => {
    navigate(`/session/exercise/${we.id}?date=${dayKey}&tab=history`);
  };

  // ---------- log-scoped replace flow (§5.2 pattern, writes the WORKOUT) ----------
  // target == null → "pick an exercise" step; target set → suggestions step.
  const [replaceTarget, setReplaceTarget] = useState<WorkoutExerciseDTO | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceSelection, setReplaceSelection] = useState<ExerciseSuggestionDTO | null>(null);
  const [replaceBusy, setReplaceBusy] = useState(false);

  const suggestionsQuery = useQuery({
    queryKey: qk.exerciseSuggestions(replaceTarget?.exerciseId ?? ""),
    queryFn: () => exerciseSuggestionsApi.list(replaceTarget!.exerciseId),
    enabled: replaceOpen && replaceTarget != null,
  });

  const openReplace = (we: WorkoutExerciseDTO | null) => {
    setReplaceOpen(true);
    setReplaceTarget(we);
    setReplaceSelection(null);
  };
  const closeReplace = () => {
    setReplaceOpen(false);
    setReplaceTarget(null);
    setReplaceSelection(null);
  };
  const applyReplace = async () => {
    const target = replaceTarget;
    const selection = replaceSelection;
    if (!workout || !target || !selection || replaceBusy || !online) return;
    setReplaceBusy(true);
    try {
      await workoutsApi.updateExercise(workout.id, target.id, { exerciseId: selection.id });
      invalidate.workout(dayKey);
      toast.success(`Replaced with ${selection.name}`, { description: "Sets are kept — this log only" });
      closeReplace();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setReplaceBusy(false);
    }
  };

  // ---------- log-scoped notes (workout comment — see header comment) ----------
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const openNoteEditor = () => {
    setNoteDraft(workout?.comment ?? "");
    setNoteEditorOpen(true);
  };
  const saveNote = async () => {
    if (!workout || noteBusy) return;
    setNoteBusy(true);
    try {
      const comment = noteDraft.trim() ? noteDraft : null;
      await workoutsApi.update(workout.id, { comment });
      invalidate.workout(dayKey);
      toast.success("Note saved", { description: `${logName} · ${formatDayLabel(dayKey)}` });
      setNoteEditorOpen(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setNoteBusy(false);
    }
  };

  // ---------- other mutations (kept from Part 8) ----------
  const [savingSession, setSavingSession] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const saveAsSession = async () => {
    if (!workout) return;
    setSavingSession(true);
    try {
      const r = await sessionsApi.fromWorkout(workout.id);
      invalidate.programs();
      toast.success(`Saved “${r.name}” as a session — find it in On Demand`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSavingSession(false);
    }
  };

  const moveSession = async (toDate: string) => {
    if (!workout) return;
    const fromKey = dayKey;
    try {
      // move relocates exercises into the target date's workout — the returned
      // DTO is where the data now lives, so the detail route follows it.
      const moved = await workoutsApi.move(workout.id, { toDate });
      invalidate.workout(fromKey);
      invalidate.workout(toDate);
      toast.success(`Moved to ${formatDayLabel(toDate)}`);
      navigate(`/logs/${moved.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const shareSession = async () => {
    if (!workout) return;
    const text = [
      `SetForge — ${formatDayLabel(dayKey)} · ${logName}`,
      `${formatDurationParts(durationSec)}${stats && stats.volume > 0 ? ` · ${Math.round(stats.volume).toLocaleString()} kg` : ""}`,
      "",
      ...exercises.map(
        (we) => `• ${we.exercise.name} — ${we.sets.length} ${we.sets.length === 1 ? "set" : "sets"}`,
      ),
    ].join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: "SetForge session", text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("Session copied to clipboard");
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // user dismissed the sheet
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Session copied to clipboard");
      } catch {
        toast.error("Could not share this session");
      }
    }
  };

  const deleteSession = async () => {
    if (!workout) return;
    const { id } = workout;
    const fromKey = dayKey;
    try {
      await workoutsApi.remove(id);
      invalidate.workout(fromKey);
      toast.success("Session deleted", {
        duration: 10_000,
        action: {
          label: "Undo",
          onClick: () =>
            void (async () => {
              try {
                await workoutLifecycleApi.restore(id);
                invalidate.workout(fromKey);
                toast.success("Session restored");
              } catch (e) {
                toast.error(errorMessage(e));
              }
            })(),
        },
      });
      navigate("/logs");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const repeatSession = async () => {
    if (!workout) return;
    // today's live session — nothing to copy, just continue logging it
    if (isLive) {
      navigate("/session");
      return;
    }
    const sourceKey = dayKey;
    setRepeating(true);
    try {
      const target = await workoutsApi.createOrGet(todayKey());
      await workoutsApi.copy(target.id, { fromDate: sourceKey });
      invalidate.workout(todayKey());
      invalidate.dashboard();
      toast.success("Session repeated to today");
      navigate("/session");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRepeating(false);
    }
  };

  // ---------- per-exercise … menu dispatch ----------
  const handleGroupAction =
    (members: WorkoutExerciseDTO[]) =>
    (action: CardAction, entryIndex: number): void => {
      const we = members[entryIndex];
      switch (action.type) {
        case "replace": // §8 log-scoped replace — writes workoutsApi.updateExercise
          if (we) openReplace(we);
          break;
        case "history":
          if (we) openEditHistory(we);
          break;
        case "detail":
          if (we) navigate(`/exercise-overview/${we.exerciseId}`);
          break;
        default:
          break; // performed mode emits only the §8 … navigations
      }
    };

  // ---------- render ----------
  const notFound = workoutQuery.error instanceof ApiError && workoutQuery.error.status === 404;

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/logs" label="Back to Logs" />}
          title={workout ? logName : "Log detail"}
          actions={
            workout ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 flex-none"
                    aria-label="Session actions"
                    tour={{ id: "logDetail.menu", label: "Menu", help: "Rearrange, replace, notes, save as session, move, share or delete.", order: 10 }}
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {isLive ? (
                    <DropdownMenuItem onClick={() => navigate("/session")}>
                      <PencilRuler className="h-4 w-4" aria-hidden /> Edit sets
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem disabled={!online || savingSession} onClick={() => void saveAsSession()}>
                    <BookmarkPlus className="h-4 w-4" aria-hidden /> Save as session
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={isRemoved} onClick={() => setMoveOpen(true)}>
                    <ArrowRightLeft className="h-4 w-4" aria-hidden /> Move date
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isRemoved || !online || exercises.length === 0}
                    {...tourAttrs({ id: "logDetail.replace", label: "Replace exercise", help: "Swap an exercise inside this log; its sets are kept.", order: 60 })}
                    onClick={() => openReplace(null)}
                  >
                    <Replace className="h-4 w-4" aria-hidden /> Replace exercise…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isRemoved || !online}
                    {...tourAttrs({ id: "logDetail.rearrange", label: "Rearrange", help: "Reorder this log's exercises in the arrange editor.", order: 50 })}
                    onClick={() => navigate(`/session/arrange?date=${dayKey}`)}
                  >
                    <ArrowDownUp className="h-4 w-4" aria-hidden /> Rearrange
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isRemoved || !online}
                    {...tourAttrs({ id: "logDetail.notes", label: "Notes", help: "Read or edit the note saved on this log.", order: 70 })}
                    onClick={openNoteEditor}
                  >
                    <MessageSquareText className="h-4 w-4" aria-hidden /> Notes
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void shareSession()}>
                    <Share2 className="h-4 w-4" aria-hidden /> Share
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      hapticWarning();
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null
          }
        />
      }
      bottomBar={
        noteEditorOpen ? (
          <BottomBar>
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-0 flex-1 text-sm font-semibold"
                disabled={noteBusy}
                tour={{ skipTour: true, reason: "Dismissal-only secondary control of the note editor" }}
                onClick={() => setNoteEditorOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11 min-w-0 flex-1 text-sm font-bold"
                disabled={noteBusy || !online}
                aria-label="Save the session note"
                tour={{ id: "logDetail.noteSave", label: "Save note", help: "Store this note on the log itself.", order: 120 }}
                onClick={() => void saveNote()}
              >
                {noteBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Save note
              </Button>
            </div>
          </BottomBar>
        ) : replaceOpen ? (
          <BottomBar>
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-0 flex-1 text-sm font-semibold"
                disabled={replaceBusy}
                tour={{ skipTour: true, reason: "Dismissal-only secondary control of the replace flow" }}
                onClick={closeReplace}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11 min-w-0 flex-1 text-sm font-bold"
                disabled={replaceBusy || replaceSelection == null || !online}
                aria-label="Replace the exercise in this log"
                tour={{ id: "logDetail.replaceApply", label: "Replace", help: "Swap the exercise in this log; its sets are kept.", order: 110 }}
                onClick={() => void applyReplace()}
              >
                {replaceBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {replaceSelection ? `Replace with ${replaceSelection.name}` : "Replace exercise"}
              </Button>
            </div>
          </BottomBar>
        ) : workout ? (
          <BottomBar>
            <Button
              type="button"
              className="h-11 min-w-0 flex-1 gap-1.5 text-sm font-bold"
              disabled={repeating || !online || isRemoved}
              aria-label="Repeat this session"
              tour={{ id: "logDetail.repeat", label: "Repeat session", help: "Copy this session's exercises and sets into today.", order: 20 }}
              onClick={() => void repeatSession()}
            >
              <Repeat2 className="h-4 w-4" aria-hidden />
              {repeating ? "Repeating…" : "Repeat this session"}
            </Button>
          </BottomBar>
        ) : null
      }
    >
      <ScrollBody>
        {workoutQuery.isLoading ? (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading session">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        ) : workoutQuery.error ? (
          <div
            data-row
            role="alert"
            className={`${rowTall} gap-2 rounded-lg border border-destructive/40 bg-card px-4 text-sm text-destructive`}
          >
            <TriangleAlert className="h-4 w-4 flex-none" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {notFound ? "This session doesn’t exist (or belongs to another account)." : errorMessage(workoutQuery.error)}
            </span>
            {notFound ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 flex-none px-3 text-xs font-semibold"
                aria-label="Back to Logs"
                tour={{ id: "logDetail.backToLogs", label: "Back to logs", help: "Return to the workout logs list.", order: 40 }}
                onClick={() => navigate("/logs")}
              >
                Back to logs
              </Button>
            ) : (
              <button
                type="button"
                {...tourAttrs({ id: "logDetail.retry", label: "Retry", help: "Reload this logged session.", order: 30 })}
                aria-label="Try again"
                onClick={() => void workoutQuery.refetch()}
                className="flex h-8 w-8 flex-none items-center justify-center rounded-md transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <RotateCw className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        ) : workout ? (
          <div className="flex flex-col gap-4">
            {isRemoved ? (
              <div
                data-row
                className={`${rowTall} gap-2 rounded-lg border border-amber-500/40 bg-card px-3 text-sm text-amber-500`}
              >
                <TriangleAlert className="h-4 w-4 flex-none" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  This session was removed — restore it from Settings → Hidden workouts.
                </span>
              </div>
            ) : null}

            {/* §8 header — start time · duration · difficulty · sourceLabel · muscles */}
            <div className="flex flex-col gap-2">
              <div data-row className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap">
                <span className="flex-none text-sm font-semibold leading-none">
                  {startedAtLabel(workout.startAt, formatDayLabel(dayKey))}
                </span>
                <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
                <span className="flex-none text-xs leading-none tabular-nums text-muted-foreground">
                  {formatDurationParts(durationSec)}
                </span>
              </div>
              <div data-row className="flex h-8 w-full items-center gap-2 overflow-hidden whitespace-nowrap">
                {workout.difficulty ? (
                  <span
                    aria-label={`Difficulty ${workout.difficulty.toLowerCase()}`}
                    className="flex h-6 flex-none items-center rounded-full border border-primary/50 bg-primary/10 px-2 text-[10px] font-bold uppercase leading-none text-primary"
                  >
                    {workout.difficulty}
                  </span>
                ) : null}
                {workout.sourceLabel ? (
                  <span className="min-w-0 flex-1 truncate text-xs leading-none text-muted-foreground">
                    {workout.sourceLabel}
                  </span>
                ) : (
                  <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
                )}
                {stats ? (
                  <span className="flex-none text-xs leading-none tabular-nums text-muted-foreground">
                    {stats.setCount} {stats.setCount === 1 ? "set" : "sets"}
                    {stats.volume > 0
                      ? ` · ${Math.round(stats.volume).toLocaleString()} kg`
                      : stats.distance > 0
                        ? ` · ${round2(stats.distance)} km`
                        : ""}
                  </span>
                ) : null}
              </div>
              {muscles.length > 0 ? <MuscleChipRow muscles={muscles} /> : null}
            </div>

            {/* log-scoped replace flow (inline) */}
            {replaceOpen ? (
              <div className="flex flex-col gap-2 rounded-lg border bg-card p-2">
                {replaceTarget == null ? (
                  <>
                    <SectionHeader label="Replace in this log" />
                    {exercises.map((we) => (
                      <button
                        key={we.id}
                        type="button"
                        data-row
                        {...tourAttrs({ id: "logDetail.replaceRow", label: "Exercise row", help: "Pick which exercise of this log to replace.", order: 80 })}
                        aria-label={`Replace ${we.exercise.name} in this log`}
                        onClick={() => {
                          setReplaceTarget(we);
                          setReplaceSelection(null);
                        }}
                        className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border px-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
                          {we.exercise.name}
                        </span>
                        <span className="flex-none text-xs leading-none text-muted-foreground">
                          {we.sets.length} {we.sets.length === 1 ? "set" : "sets"}
                        </span>
                        <ChevronRight className="h-4 w-4 flex-none text-muted-foreground/60" aria-hidden />
                      </button>
                    ))}
                  </>
                ) : suggestionsQuery.isLoading ? (
                  <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading replacement suggestions">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-14 rounded-lg" />
                    ))}
                  </div>
                ) : suggestionsQuery.error ? (
                  <div data-row role="alert" className={`${rowTall} gap-2 px-2 text-sm text-destructive`}>
                    <TriangleAlert className="h-4 w-4 flex-none" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{errorMessage(suggestionsQuery.error)}</span>
                  </div>
                ) : (
                  <>
                    <SectionHeader label={`Replace ${replaceTarget.exercise.name} with`} />
                    {(suggestionsQuery.data?.suggestions ?? []).length === 0 ? (
                      <p className="px-1 py-2 text-sm text-muted-foreground">
                        No suggestions — this exercise has no alternatives yet.
                      </p>
                    ) : (
                      (suggestionsQuery.data?.suggestions ?? []).map((s) => {
                        const selected = replaceSelection?.id === s.id;
                        const musclesText = (s.primaryMuscles ?? []).map(muscleLabel).slice(0, 3).join(" · ");
                        return (
                          <button
                            key={s.id}
                            type="button"
                            data-row
                            role="radio"
                            aria-checked={selected}
                            {...tourAttrs({ id: "logDetail.replaceSuggest", label: "Suggestion row", help: "Pick the replacement exercise; sets are kept.", order: 90 })}
                            aria-label={`Replace with ${s.name}`}
                            onClick={() => setReplaceSelection(selected ? null : s)}
                            className={cn(
                              "flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border px-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                              selected
                                ? "border-primary/60 bg-primary/10"
                                : "border-border hover:border-primary/40 hover:bg-accent/40",
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{s.name}</span>
                            <span className="max-w-[120px] flex-none truncate text-xs leading-none text-muted-foreground">
                              {musclesText}
                            </span>
                            {selected ? <Check className="h-4 w-4 flex-none text-primary" aria-hidden /> : null}
                          </button>
                        );
                      })
                    )}
                  </>
                )}
              </div>
            ) : null}

            {/* GroupCard ×N — performed view mode with §8 footers */}
            {groups.length > 0 ? (
              <GroupCardStack>
                {groups.map((g) => {
                  const wg = g.groupId ? groupById.get(g.groupId) : undefined;
                  const colour = wg?.colour ?? g.members[0]?.exercise.category?.colour;
                  return (
                    <GroupCard
                      key={g.key}
                      mode="view"
                      group={{ code: g.code, label: g.label, colour }}
                      menuItems={LOG_MENU}
                      entries={g.members.map((we, i) => ({
                        exercise: toCardExercise(we, settings),
                        sets: toPerformedCardSets(we.sets),
                        code: memberCode(g.code, i),
                        tip: we.exercise.trainerTip ?? null,
                        footer: (
                          <PerformedFooter
                            we={we}
                            settings={settings}
                            isRemoved={isRemoved}
                            onEditHistory={openEditHistory}
                          />
                        ),
                      }))}
                      visibleColumns={visibleColumns}
                      onAction={handleGroupAction(g.members)}
                    />
                  );
                })}
              </GroupCardStack>
            ) : (
              <p className="px-1 text-sm text-muted-foreground">No exercises logged in this session.</p>
            )}

            {/* note row / inline note editor (log-scoped workout comment) */}
            {noteEditorOpen ? (
              <div className="flex flex-col gap-2 rounded-lg border bg-card p-2">
                <SectionHeader label="Session note" />
                <Textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="How did this session feel?"
                  aria-label="Session note"
                  maxLength={1000}
                  {...tourAttrs({ id: "logDetail.noteEditor", label: "Note editor", help: "Write or update the note saved on this log.", order: 100 })}
                  className="min-h-[88px] w-full resize-none text-sm"
                />
                <p className="px-1 text-[11px] leading-none text-muted-foreground">
                  Saved on this log only — use Save note below.
                </p>
              </div>
            ) : workout.comment?.trim() ? (
              <button
                type="button"
                data-row
                {...tourAttrs({ id: "logDetail.noteRow", label: "Note", help: "The note saved on this log; tap to edit it.", order: 160 })}
                aria-label="Edit this session's note"
                onClick={openNoteEditor}
                className={`${rowTall} w-full gap-2 rounded-lg border bg-card px-3 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
              >
                <MessageSquareText className="h-4 w-4 flex-none text-primary" aria-hidden />
                <span className="flex-none text-sm text-muted-foreground">Note:</span>
                <span className="min-w-0 flex-1 truncate text-sm" title={workout.comment}>
                  {workout.comment}
                </span>
                <PencilRuler className="h-4 w-4 flex-none text-muted-foreground/60" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
      </ScrollBody>

      {/* move date — the one allowed non-destructive modal (shared picker) */}
      {workout ? (
        <DatePickerDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          initialKey={dayKey}
          title="Move session"
          description={`${logName} moves to a new date.`}
          onSelect={(key) => void moveSession(key)}
        />
      ) : null}

      {/* destructive confirm — delete (§6.9 remove semantics + Undo toast) */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => !o && setDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {`${logName} on ${formatDayLabel(dayKey)} will be removed from your logs. You can undo for a few seconds.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setDeleteOpen(false);
                void deleteSession();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
