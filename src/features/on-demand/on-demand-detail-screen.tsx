"use client";

// ─────────────────────────────────────────────────────────────────────────────
// OnDemandDetailScreen — #/on-demand/{id} (Part 8 §3.6).
//
//   TopBar (56)  : BackButton(→ #/on-demand) · session name · ★ favourite ·
//                  ⋮ (Edit in Builder · Copy · History · Delete — destructive
//                  confirm) · TopBarHelp
//   SubBar (48)  : meta row `{est} min · {n} exercises · {muscles}` (muscles
//                  degrade from day.primaryMuscles to the exercise union)
//   ScrollBody   : GroupCardStack of VIEW-mode GroupCards for the session's
//                  single day — deriveGroups(day.exercises), entries carry
//                  {exercise, sets: toCardSet(predefinedSet, i+1),
//                  code: memberCode(group.code, i)}; the … popover navigates to
//                  exercise overview/history/records + inline notes popover.
//   BottomBar(56): `Start now` (programsApi.startDay → #/session) ·
//                  `Schedule` (→ #/schedule/pick?date=today).
//
// Sessions are Routine.kind === "SESSION" (single workout day). Group colours
// come from the first member's category colour — the RoutineDTO carries no
// RoutineGroup colour, and GroupCard falls back exactly that way.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarClock, Copy, History, MoreVertical, PencilRuler, Play, Star, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { programsApi, programsMetaApi, routinesApi } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { todayKey } from "@/lib/client/format";
import { deriveGroups, memberCode } from "@/lib/grouping";
import { GroupCard, GroupCardStack, toCardSet, type CardAction, type CardVisibleColumns } from "@/components/group-card";
import { MUSCLE_LABELS, type Muscle } from "@/lib/constants";
import type { RoutineExerciseDTO } from "@/lib/types";
import { errorMessage, toCardExercise } from "@/features/routines/screen-helpers";
import { rowTall } from "@/lib/ui/tokens";

const muscleLabel = (m: string) => MUSCLE_LABELS[m as Muscle] ?? m;

/** Sets-based minute estimate (≈2.5 min per set incl. rest), rounded to 5. */
function estimateMinutes(exercises: RoutineExerciseDTO[]): number | null {
  const totalSets = exercises.reduce((n, re) => n + re.sets.length, 0);
  if (totalSets === 0) return null;
  return Math.max(5, Math.round((totalSets * 2.5) / 5) * 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// ExerciseNotesPopover — read-only exercise notes (anchored popover, the same
// pattern + Radix focus gotcha handling as the program detail body).
// ─────────────────────────────────────────────────────────────────────────────

function ExerciseNotesPopover({
  exerciseName,
  notes,
  open,
  onClose,
}: {
  exerciseName: string;
  notes: string | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        <span className="absolute bottom-2 left-2 h-1 w-1" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <p className="pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {exerciseName} — notes
        </p>
        <p className="text-sm leading-relaxed text-foreground">
          {notes && notes.trim().length > 0 ? notes : "No notes on this exercise."}
        </p>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OnDemandDetailScreen — keyed by routineId so local UI state (favourite
// pending, rest expansion, notes popover, dialogs) resets on navigation.
// ─────────────────────────────────────────────────────────────────────────────

export default function OnDemandDetailScreen({ routineId }: { routineId: string }) {
  return <OnDemandDetailInner key={routineId} routineId={routineId} />;
}

function OnDemandDetailInner({ routineId }: { routineId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const online = useOnline();
  const invalidate = useInvalidate();

  // ---------- data ----------
  const { data: routine, isLoading, error } = useQuery({
    queryKey: qk.routine(routineId),
    queryFn: () => routinesApi.get(routineId),
    retry: 1,
  });

  // the session's single workout day (§3.6)
  const day = useMemo(() => {
    if (!routine) return null;
    return routine.days.find((d) => (d.dayType ?? "WORKOUT") === "WORKOUT") ?? null;
  }, [routine]);

  const exercises = useMemo(
    () => (day ? [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [day],
  );

  // §2.1 derived groups: letters A, B, C…; singletons are their own group of 1
  const groups = useMemo(() => deriveGroups(exercises), [exercises]);

  // ---------- ui state ----------
  const [favPending, setFavPending] = useState<boolean | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [restExpandedKeys, setRestExpandedKeys] = useState<Set<string>>(new Set());
  const [notesReId, setNotesReId] = useState<string | null>(null);

  const isFav = favPending ?? (routine?.isFavorite ?? false);
  if (favPending != null && routine && favPending === (routine.isFavorite ?? false)) {
    setFavPending(null);
  }

  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  // ---------- derived meta (SubBar line) ----------
  const est = routine?.estMinutes ?? day?.estMinutes ?? estimateMinutes(exercises);
  const muscles = useMemo(() => {
    const dayMuscles = (day?.primaryMuscles ?? []).filter(Boolean);
    if (dayMuscles.length > 0) return dayMuscles;
    return [...new Set(exercises.flatMap((re) => re.exercise.primaryMuscles ?? []))];
  }, [day, exercises]);
  const metaParts = [
    ...(est != null ? [`${est} min`] : []),
    `${exercises.length} ${exercises.length === 1 ? "exercise" : "exercises"}`,
    ...(muscles.length > 0 ? [muscles.map(muscleLabel).join(", ")] : []),
  ];

  // ---------- mutations ----------
  const toggleFavourite = async () => {
    if (!routine) return;
    if (!online) {
      toast.info("Favourite sessions need a connection");
      return;
    }
    const next = !isFav;
    setFavPending(next);
    try {
      await programsMetaApi.update(routineId, { isFavorite: next });
      invalidate.routines();
      toast.success(
        next ? `“${routine.name}” added to favourites` : `“${routine.name}” removed from favourites`,
      );
    } catch (e) {
      setFavPending(null);
      toast.error(errorMessage(e));
    }
  };

  const copySession = async () => {
    if (!routine) return;
    try {
      await routinesApi.copy(routineId);
      invalidate.routines();
      invalidate.programs();
      toast.success(`Duplicated “${routine.name}”`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const deleteSession = async () => {
    if (!routine) return;
    try {
      await routinesApi.remove(routineId);
      invalidate.routines();
      invalidate.programs();
      toast.success(`Deleted “${routine.name}”`);
      navigate("/on-demand");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // Start now — the SESSION start flow: atomic day start (workout + predefined
  // sets + provenance + schedule DONE entry), then jump into logging.
  const startNow = async () => {
    if (!routine || !day || starting) return;
    if (!online) {
      toast.info("Starting a session needs a connection");
      return;
    }
    setStarting(true);
    try {
      await programsApi.startDay(routineId, { dayId: day.id });
      invalidate.workout(todayKey());
      invalidate.programs();
      invalidate.dashboard();
      invalidate.schedule();
      toast.success(`Started ${routine.name}`);
      navigate("/session");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  // Schedule — reuse the schedule-pick flow (date + routine/day choice there)
  const schedule = () => navigate(`/schedule/pick?date=${todayKey()}`);

  // ---------- GroupCard … popover actions (view mode: NAV items only) ----------
  const handleCardAction = (re: RoutineExerciseDTO) => (action: CardAction): void => {
    switch (action.type) {
      case "detail":
        navigate(`/exercise-overview/${re.exerciseId}`);
        break;
      case "history":
        navigate(`/exercise-overview/${re.exerciseId}?tab=history`);
        break;
      case "graph":
        navigate(`/exercise-overview/${re.exerciseId}?tab=history`);
        break;
      case "records":
        navigate(`/exercise-overview/${re.exerciseId}?tab=records`);
        break;
      case "notes":
        setNotesReId(re.id);
        break;
      case "rest-timer":
        toast.info("The rest timer lives on the logging screen");
        break;
      default:
        break; // edit/log-mode-only actions — never emitted by view-mode cards
    }
  };

  const toggleRest = (key: string) => {
    setRestExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ---------- render helpers ----------

  const groupEntries = (g: (typeof groups)[number]) =>
    g.members.map((re, i) => ({
      exercise: toCardExercise(re, settings),
      sets: [...re.sets]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s, idx) => toCardSet(s, idx + 1)),
      code: memberCode(g.code, i),
      tip: re.exercise.trainerTip ?? null,
    }));

  const hasContent = routine != null && day != null;

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          title={routine?.name ?? "Session"}
          leading={<BackButton fallbackHash="#/on-demand" label="Back to On Demand" />}
          actions={
            <>
              {routine ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn("h-11 w-11 flex-none", isFav && "text-amber-500 hover:text-amber-500")}
                  aria-pressed={isFav}
                  aria-label={isFav ? `Unfavourite ${routine.name}` : `Favourite ${routine.name}`}
                  tour={{ id: "onDemandDetail.favourite", label: "Favourite", help: "Star this session to find it faster.", order: 20 }}
                  onClick={() => void toggleFavourite()}
                >
                  <Star className="h-5 w-5" aria-hidden fill={isFav ? "currentColor" : "none"} />
                </Button>
              ) : null}
              {routine ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 flex-none"
                      aria-label={`Actions for ${routine.name}`}
                      tour={{ id: "onDemandDetail.menu", label: "Session menu", help: "Edit in Builder, copy, history or delete.", order: 30 }}
                    >
                      <MoreVertical className="h-5 w-5" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => navigate(`/builder/session/${routineId}`)}>
                      <PencilRuler className="h-4 w-4" aria-hidden /> Edit in Builder
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void copySession()}>
                      <Copy className="h-4 w-4" aria-hidden /> Copy
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate(`/logs?routineId=${routineId}`)}>
                      <History className="h-4 w-4" aria-hidden /> History
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        hasContent ? (
          <SubBar>
            <div data-row className={`${rowTall} w-full min-w-0 gap-2`} aria-label="Session summary">
              <Zap className="h-4 w-4 flex-none text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm leading-none text-muted-foreground">
                {metaParts.join(" · ")}
              </span>
            </div>
          </SubBar>
        ) : undefined
      }
      bottomBar={
        hasContent ? (
          <BottomBar>
            <Button
              type="button"
              className="h-11 min-w-0 flex-1 gap-2 text-base font-bold"
              disabled={starting}
              aria-label={`Start ${routine?.name ?? "session"} now`}
              tour={{ id: "onDemandDetail.start", label: "Start now", help: "Begin this session now and jump into logging.", order: 40 }}
              onClick={() => void startNow()}
            >
              <Play className="h-5 w-5" aria-hidden />
              {starting ? "Starting…" : "Start now"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 min-w-0 flex-1 gap-2 text-base font-bold"
              aria-label="Schedule this session"
              tour={{ id: "onDemandDetail.schedule", label: "Schedule", help: "Pick a date for this session on the calendar.", order: 50 }}
              onClick={schedule}
            >
              <CalendarClock className="h-5 w-5" aria-hidden />
              Schedule
            </Button>
          </BottomBar>
        ) : undefined
      }
    >
      <ScrollBody>
        {error || (!isLoading && !routine) ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Session not found</p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Error-state back link for a missing session" }}
              onClick={() => navigate("/on-demand")}
            >
              Back to On Demand
            </Button>
          </div>
        ) : isLoading || !routine ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading session">
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-28 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-28 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-28 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : !day ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">No workout day in this session</p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              Add exercises to the session in the Builder to see them here.
            </p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Empty-day link to the session editor in the Builder" }}
              onClick={() => navigate(`/builder/session/${routineId}`)}
            >
              Edit in Builder
            </Button>
          </div>
        ) : exercises.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">No exercises in this session yet</p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Empty-session link to the session editor in the Builder" }}
              onClick={() => navigate(`/builder/session/${routineId}`)}
            >
              Edit in Builder
            </Button>
          </div>
        ) : (
          <GroupCardStack>
            {groups.map((g) => (
              <div key={g.key} className="relative flex-none">
                <GroupCard
                  mode="view"
                  group={{ code: g.code, label: g.label }}
                  entries={groupEntries(g)}
                  visibleColumns={visibleColumns}
                  restExpanded={restExpandedKeys.has(g.key)}
                  onToggleRest={() => toggleRest(g.key)}
                  onAction={(action, entryIndex) => {
                    const member = g.members[entryIndex];
                    if (member) handleCardAction(member)(action);
                  }}
                />
                {g.members.map((re) =>
                  notesReId === re.id ? (
                    <ExerciseNotesPopover
                      key={re.id}
                      exerciseName={re.exercise.name}
                      notes={re.exercise.notes ?? null}
                      open
                      onClose={() => setNotesReId(null)}
                    />
                  ) : null,
                )}
              </div>
            ))}
          </GroupCardStack>
        )}

        {/* destructive confirm: session delete */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete session?</AlertDialogTitle>
              <AlertDialogDescription>
                “{routine?.name ?? "This session"}” and its days will be removed. Logged workouts
                stay untouched. This cannot be undone.
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
      </ScrollBody>
    </Screen>
  );
}
