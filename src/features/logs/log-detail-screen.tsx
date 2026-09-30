"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LogDetailScreen — #/logs/{workoutId} (Part 8 §3.4 Log detail).
//
//   TopBar (56)  : BackButton(→ #/logs) · "Thu 26 Sep · Push day" · ⋮ menu
//                  (Edit sets [today's active session only] · Save as session ·
//                  Move date [DatePickerDialog → workoutsApi.move] · Share
//                  [navigator.share → clipboard fallback] · Delete [confirm])
//   SubBar (48)  : meta row "PPL · Day 2 · 48 min · 3,400 kg" — program name ·
//                  day name · duration · volume, computed from the workout tree
//                  (same rules as the server summary mapper: performed, non-
//                  warm-up sets; duration from startAt→endAt)
//   ScrollBody   : GroupCard ×N in READ mode inside GroupCardStack (deriveGroups
//                  over the workout's exercises; group colour from
//                  workout.groups, singleton groups fall back to the category
//                  colour exactly like SoloCard) + note row when a comment
//                  exists
//   BottomBar    : "Repeat this session" (primary) → copy into today.
//
// Repeat semantics (read from workout-service.copyWorkout before deciding):
// copyWorkout(targetId, { fromDate }) copies the LATEST session of `fromDate`
// INTO the target workout — there is no copy-by-id endpoint. "Repeat" therefore
// does createOrGet(today) (continues today's active session) then copies this
// session's date into it, then opens #/session. Documented edges: on multi-
// session dates the server picks the newest session of that date (may not be
// this exact one), and repeating TODAY's finished session can copy today's
// newer shell instead — both stem from copy-by-date; noted in the worklog.
// When this workout already IS today's live session we just open #/session.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody, BottomBar } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  BookmarkPlus,
  MoreVertical,
  PencilRuler,
  Repeat2,
  RotateCw,
  Share2,
  TriangleAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { tourAttrs } from "@/lib/tour/attrs";
import { GroupCard, GroupCardStack, toCardSet } from "@/components/group-card";
import type { CardExercise, CardSet, CardVisibleColumns } from "@/components/group-card";
import { deriveGroups, memberCode } from "@/lib/grouping";
import { useApp } from "@/lib/client/store";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { ApiError, routinesApi, sessionsApi, workoutLifecycleApi, workoutsApi } from "@/lib/client/api";
import { dayKeyOf, formatDayLabel, round2, todayKey } from "@/lib/client/format";
import { rowTall } from "@/lib/ui/tokens";
import { exerciseUnit } from "@/features/exercises/labels";
import { DatePickerDialog } from "@/features/schedule/schedule-shared";
import { errorMessage } from "@/features/routines/screen-helpers";
import { hapticWarning } from "@/lib/client/haptics";
import type { SetDTO, SettingsDTO, WorkoutDTO, WorkoutExerciseDTO } from "@/lib/types";

// ---------- pure mapping (pattern from features/history/workout-block.tsx) ----------

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
 * SetDTO → CardSet. NB: SetDTO.distance is KILOMETRES while CardSet.distanceM
 * renders metres ("800 m" / "5 km") — converted here so cardio sessions show
 * "6.5 km", not "6.5 m".
 */
function toReadCardSets(sets: SetDTO[]): CardSet[] {
  return [...sets]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s, i) => toCardSet({ ...s, distance: s.distance != null ? s.distance * 1000 : null }, i + 1));
}

/** Performed tonnage of one session (mirrors mapWorkoutSummary server-side). */
function workoutStats(workout: WorkoutDTO): { setCount: number; volume: number; distance: number; durationSec: number } {
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
  const durationSec =
    workout.startAt && workout.endAt
      ? Math.max(0, Math.round((new Date(workout.endAt).getTime() - new Date(workout.startAt).getTime()) / 1000))
      : 0;
  return { setCount, volume, distance, durationSec };
}

/** Seconds → "45 s" / "48 min". */
function formatMinutes(sec: number): string {
  if (sec < 60) return `${sec} s`;
  return `${Math.max(1, Math.round(sec / 60))} min`;
}

// ---------- screen ----------

export default function LogDetailScreen({ workoutId }: { workoutId: string }) {
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

  // routines cache — resolves the source chip (routine · day names), same as Today
  const routinesQuery = useQuery({
    queryKey: qk.routines,
    queryFn: () => routinesApi.list(),
    staleTime: 30_000,
  });

  const dayKey = workout ? dayKeyOf(workout.date) : "";
  const isRemoved = workout?.removedAt != null;
  const isToday = !!workout && dayKey === todayKey();
  const isLive = !!workout && isToday && !workout.finishedAt && !isRemoved;

  // ---------- source / name resolution ----------
  const source = useMemo(() => {
    if (!workout?.sourceRoutineId) return null;
    if (workout.sourceType !== "ROUTINE_DAY" && workout.sourceType !== "SESSION") return null;
    const r = routinesQuery.data?.routines.find((x) => x.id === workout.sourceRoutineId);
    if (!r) return null;
    if (workout.sourceType === "SESSION") return { routineName: r.name, dayName: null as string | null };
    const day = r.days.find((d) => d.id === workout.sourceDayId);
    return { routineName: r.name, dayName: day?.name ?? null };
  }, [workout, routinesQuery.data]);

  const sessionName = source?.dayName ?? source?.routineName ?? "Freestyle session";
  const stats = useMemo(() => (workout ? workoutStats(workout) : null), [workout]);

  // SubBar meta parts: "PPL · Day 2 · 48 min · 3,400 kg"
  const metaParts = useMemo(() => {
    if (!stats) return [] as string[];
    const parts: string[] = [];
    if (source?.routineName) parts.push(source.routineName);
    if (source?.dayName && source.dayName !== source.routineName) parts.push(source.dayName);
    if (stats.durationSec > 0) parts.push(formatMinutes(stats.durationSec));
    if (stats.volume > 0) parts.push(`${Math.round(stats.volume).toLocaleString()} kg`);
    else if (stats.distance > 0) parts.push(`${round2(stats.distance)} km`);
    return parts;
  }, [source, stats]);

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

  // ---------- mutations ----------
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
      `SetForge — ${formatDayLabel(dayKey)} · ${sessionName}`,
      metaParts.length > 0 ? metaParts.join(" · ") : null,
      "",
      ...exercises.map(
        (we) => `• ${we.exercise.name} — ${we.sets.length} ${we.sets.length === 1 ? "set" : "sets"}`,
      ),
    ]
      .filter((l) => l != null)
      .join("\n");
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

  // ---------- render ----------

  const notFound = workoutQuery.error instanceof ApiError && workoutQuery.error.status === 404;
  const title = workout ? `${formatDayLabel(dayKey)} · ${sessionName}` : "Log detail";

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/logs" label="Back to Workout Logs" />}
          title={title}
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
                    tour={{ id: "logDetail.menu", label: "Menu", help: "Edit sets, save as session, move, share or delete.", order: 10 }}
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
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
      subBar={
        workout && stats ? (
          <SubBar>
            <div data-row className={`${rowTall} w-full gap-2 px-0`}>
              {metaParts.length > 0 ? (
                metaParts.map((part, i) => (
                  <span key={part} className="flex min-w-0 items-center gap-2">
                    {i > 0 ? (
                      <span className="flex-none text-muted-foreground/60" aria-hidden>
                        ·
                      </span>
                    ) : null}
                    <span
                      className={
                        i === 0
                          ? "flex-none text-sm font-semibold text-primary"
                          : "flex-none text-sm text-muted-foreground"
                      }
                    >
                      {part}
                    </span>
                  </span>
                ))
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {workout.exercises.length} {workout.exercises.length === 1 ? "exercise" : "exercises"}
                </span>
              )}
            </div>
          </SubBar>
        ) : null
      }
      bottomBar={
        workout ? (
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
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
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
                aria-label="Back to Workout Logs"
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

            {/* GroupCard ×N — read mode */}
            {groups.length > 0 ? (
              <GroupCardStack>
                {groups.map((g) => {
                  const wg = g.groupId ? groupById.get(g.groupId) : undefined;
                  const colour = wg?.colour ?? g.members[0]?.exercise.category?.colour;
                  return (
                    <GroupCard
                      key={g.key}
                      mode="read"
                      group={{ code: g.code, label: g.label, colour }}
                      entries={g.members.map((we, i) => ({
                        exercise: toCardExercise(we, settings),
                        sets: toReadCardSets(we.sets),
                        code: memberCode(g.code, i),
                        tip: we.exercise.trainerTip ?? null,
                      }))}
                      visibleColumns={visibleColumns}
                    />
                  );
                })}
              </GroupCardStack>
            ) : (
              <p className="px-1 text-sm text-muted-foreground">No exercises logged in this session.</p>
            )}

            {/* note row — 48px, only when a comment exists */}
            {workout.comment?.trim() ? (
              <div data-row className={`${rowTall} gap-2 rounded-lg border bg-card px-3`}>
                <span className="flex-none text-sm text-muted-foreground">Note:</span>
                <span className="min-w-0 flex-1 truncate text-sm" title={workout.comment}>
                  {workout.comment}
                </span>
              </div>
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
          description={`${sessionName} moves to a new date.`}
          onSelect={(key) => void moveSession(key)}
        />
      ) : null}

      {/* destructive confirm — delete (§6.9 remove semantics + Undo toast) */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => !o && setDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {`${sessionName} on ${formatDayLabel(dayKey)} will be removed from your logs. You can undo for a few seconds.`}
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
