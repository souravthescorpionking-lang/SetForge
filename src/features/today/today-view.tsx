"use client";

// TodayView — the day view / workout logging heart of SetForge.
// Date navigation (buttons, swipe, picker), workout header, exercise cards
// with drag-reorder + superset groups, multi-select bulk actions, the
// training screen, rest timer, and the floating nav panel.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ExercisePickerDialog } from "@/components/shared/exercise-picker";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Dumbbell, Flame, Link2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { ApiError, exercisesApi, statsApi, workoutsApi } from "@/lib/client/api";
import { qk, useInvalidate, useOnline, useWorkoutByDate } from "@/lib/client/query";
import { addDaysKey, todayKey } from "@/lib/client/format";
import type { WorkoutGroupDTO } from "@/lib/types";
import { DateBar } from "./date-bar";
import { WorkoutHeaderCard } from "./workout-header-card";
import { ExerciseList } from "./exercise-list";
import { NavPanel } from "./nav-panel";
import { TrainingScreen } from "./training-screen";
import { RestTimerProvider } from "./rest-timer";
import { SummarySheet } from "./summary-sheet";
import { CopyWorkoutDialog } from "./copy-workout-dialog";
import { MoveWorkoutDialog } from "./move-workout-dialog";
import { CreateGroupDialog, EditGroupDialog } from "./group-dialog";
import { useMutate } from "./use-mutate";

export function TodayView() {
  const route = useApp((s) => s.route);
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const invalidate = useInvalidate();
  const online = useOnline();
  const mutate = useMutate();

  // ---------- date state (syncs with ?date= query param) ----------
  const routeDate = route.query.get("date");
  const [dateKey, setDateKey] = useState(() => {
    const q = route.query.get("date");
    return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayKey();
  });

  useEffect(() => {
    if (routeDate && /^\d{4}-\d{2}-\d{2}$/.test(routeDate)) {
      if (routeDate !== dateKey) setDateKey(routeDate);
    } else if (route.view === "today" && !routeDate) {
      // /today without a ?date= param always means today (e.g. sidebar Today
      // click after browsing a past date) — otherwise the stale date sticks.
      if (dateKey !== todayKey()) setDateKey(todayKey());
    }
  }, [routeDate, route.view]);

  const goTo = useCallback(
    (key: string) => {
      setDateKey(key);
      if (key === todayKey()) navigate("/today");
      else navigate(`/today?date=${key}`);
    },
    [navigate],
  );

  // ---------- data ----------
  const { data, isLoading } = useWorkoutByDate(dateKey);
  const workout = data?.workout ?? null;

  // does any workout exist before this date? (enables "Copy Previous")
  const previousWorkouts = useQuery({
    queryKey: qk.workoutList({ to: addDaysKey(dateKey, -1), limit: 1 }),
    queryFn: () => workoutsApi.list({ to: addDaysKey(dateKey, -1) }),
    staleTime: 30_000,
  });
  const hasPrevious = (previousWorkouts.data?.workouts.length ?? 0) > 0;

  // current streak (all time) — feeds the header flame chip
  const streakQuery = useQuery({
    queryKey: qk.stats("all"),
    queryFn: () => statsApi.get("all"),
    staleTime: 60_000,
    select: (s) => s.streak?.current ?? 0,
  });

  // ---------- ui state ----------
  const [trainingWeId, setTrainingWeId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [groupPreselect, setGroupPreselect] = useState<string[]>([]);
  const [editGroup, setEditGroup] = useState<WorkoutGroupDTO | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [summaryOpen, setSummaryOpen] = useState(false);

  // if the workout data changes and selected exercises vanish → tidy selection
  useEffect(() => {
    if (!selectMode || !workout) return;
    const ids = new Set(workout.exercises.map((we) => we.id));
    const next = new Set([...selectedIds].filter((id) => ids.has(id)));
    if (next.size !== selectedIds.size) {
      setSelectedIds(next);
      if (next.size === 0) setSelectMode(false);
    }
  }, [workout]);

  // ---------- swipe navigation ----------
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    // ignore gestures that begin on the sticky nav bar (chip drags, buttons)
    if ((e.target as HTMLElement).closest("[data-no-swipe]")) {
      swipeStart.current = null;
      return;
    }
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 64 && Math.abs(dy) < 48) {
      goTo(addDaysKey(dateKey, dx < 0 ? 1 : -1));
    }
  };

  // ---------- empty-day actions ----------
  const startNewWorkout = async () => {
    if (!online) {
      toast.info("Starting a workout needs a connection");
      return;
    }
    try {
      await workoutsApi.createOrGet(dateKey);
      invalidate.workout(dateKey);
      toast.success("New workout started", { icon: <Flame className="h-4 w-4" /> });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start workout");
    }
  };

  const copyPreviousWorkout = async () => {
    if (!online) {
      toast.info("Copying needs a connection");
      return;
    }
    try {
      const w = await workoutsApi.createOrGet(dateKey);
      await workoutsApi.copy(w.id, {});
      invalidate.workout(dateKey);
      toast.success("Previous workout copied in");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        toast.info("No source workout found — log a session first, then copy it forward");
      } else {
        toast.error(e instanceof Error ? e.message : "Copy failed");
      }
    }
  };

  // ---------- exercise mutations ----------
  const addExerciseToWorkout = async (exerciseId: string) => {
    if (!workout) return;
    await mutate({
      label: "Exercise added",
      run: () => workoutsApi.addExercise(workout.id, exerciseId),
      queue: { path: `/api/workouts/${workout.id}/exercises`, method: "POST", body: { exerciseId } },
    });
    toast.success("Exercise added to workout");
  };

  const createAndAddExercise = async (name: string, categoryId: string) => {
    if (!workout) return;
    if (!online) {
      toast.info("Creating exercises needs a connection");
      return;
    }
    try {
      const created = await exercisesApi.create({ name, categoryId });
      invalidate.exercises();
      await addExerciseToWorkout(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create exercise");
    }
  };

  const bulkDeleteExercises = async () => {
    if (!workout || selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      await Promise.all([...selectedIds].map((id) => workoutsApi.removeExercise(workout.id, id)));
      toast.success(`Removed ${count} exercise${count > 1 ? "s" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete exercises");
    } finally {
      setSelectMode(false);
      setSelectedIds(new Set());
      invalidate.workout(dateKey);
    }
  };

  const toggleSelect = (weId: string) => {
    setSelectMode(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(weId)) next.delete(weId);
      else next.add(weId);
      return next;
    });
  };

  const longPressSelect = (weId: string) => {
    setSelectMode(true);
    setSelectedIds((prev) => new Set(prev).add(weId));
  };

  const openTraining = (weId: string) => setTrainingWeId(weId);

  const openGroupFromSelection = () => {
    setGroupPreselect([...selectedIds]);
    setGroupCreateOpen(true);
  };

  const trainingWe = trainingWeId ? workout?.exercises.find((we) => we.id === trainingWeId) ?? null : null;

  const defaults = {
    homeSetsShown: settings?.homeSetsShown ?? 2,
    showCategory: settings?.showCategory ?? true,
    markSetsComplete: settings?.markSetsComplete ?? false,
    defaultWeightIncrement: settings?.defaultWeightIncrement ?? 2.5,
  };

  return (
    <RestTimerProvider active={!!trainingWeId}>
      <div className="space-y-4 pb-16">
        <DateBar dateKey={dateKey} onChange={goTo} workoutExists={!!workout} />

        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {isLoading ? (
            <DaySkeleton />
          ) : !workout ? (
            <motion.div
              key={`empty-${dateKey}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <EmptyState
                icon={<Dumbbell className="h-7 w-7" />}
                title="No workout this day"
                description="Forge a new session, or bring in the plan from your last one and tweak it."
                className="py-14"
                action={
                  <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
                    <Button
                      size="lg"
                      className="h-13 gap-2 rounded-2xl px-6 text-base font-bold shadow-lg shadow-primary/25"
                      onClick={() => void startNewWorkout()}
                    >
                      <Flame className="h-5 w-5" /> Start New Workout
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-13 gap-2 rounded-2xl px-6 text-base font-semibold"
                      disabled={!hasPrevious && previousWorkouts.isSuccess}
                      onClick={() => void copyPreviousWorkout()}
                    >
                      <Dumbbell className="h-5 w-5" /> Copy Previous Workout
                    </Button>
                  </div>
                }
              />
            </motion.div>
          ) : (
            <motion.div
              key={workout.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <WorkoutHeaderCard
                workout={workout}
                dateKey={dateKey}
                streak={streakQuery.data ?? null}
                onCopy={() => setCopyOpen(true)}
                onMove={() => setMoveOpen(true)}
                onEnterSelectMode={() => {
                  setSelectMode(true);
                  toast.info("Tap exercises to select them");
                }}
                onOpenSummary={() => setSummaryOpen(true)}
              />

              {/* sticky slim nav bar below the header + selection toolbar */}
              <div data-no-swipe className="sticky top-14 z-30 -mx-4 bg-background/80 px-4 py-1.5 backdrop-blur-md sm:-mx-6 sm:px-6">
                <NavPanel
                  workout={workout}
                  activeWeId={trainingWeId}
                  onOpenExercise={openTraining}
                  onAddExercise={() => setPickerOpen(true)}
                  onAddToGroup={() => {
                    setGroupPreselect(selectMode ? [...selectedIds] : []);
                    setGroupCreateOpen(true);
                  }}
                  onEditGroup={(g) => setEditGroup(g)}
                  onHome={() => goTo(todayKey())}
                />
                <AnimatePresence initial={false}>
                  {selectMode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border bg-popover/95 p-1.5 pl-3 shadow-lg">
                        <span className="numeric text-sm font-bold">
                          {selectedIds.size} selected
                        </span>
                        <span className="flex-1" />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-9 gap-1.5 rounded-xl font-semibold"
                          disabled={selectedIds.size === 0}
                          onClick={openGroupFromSelection}
                        >
                          <Link2 className="h-4 w-4" /> Group
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-9 gap-1.5 rounded-xl font-semibold"
                              disabled={selectedIds.size === 0}
                            >
                              <Trash2 className="h-4 w-4" /> Delete
                            </Button>
                          }
                          title={`Delete ${selectedIds.size} exercise${selectedIds.size === 1 ? "" : "s"}?`}
                          description="Their sets will be removed from this workout. This cannot be undone."
                          confirmLabel="Delete exercises"
                          onConfirm={() => void bulkDeleteExercises()}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 gap-1 rounded-xl"
                          onClick={() => {
                            setSelectMode(false);
                            setSelectedIds(new Set());
                          }}
                          aria-label="Exit selection mode"
                        >
                          <X className="h-4 w-4" /> Done
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <ExerciseList
                workout={workout}
                showCategory={defaults.showCategory}
                homeSetsShown={defaults.homeSetsShown}
                markSetsComplete={defaults.markSetsComplete}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onOpenExercise={openTraining}
                onToggleSelect={toggleSelect}
                onLongPress={longPressSelect}
                onAddExercise={() => setPickerOpen(true)}
              />
            </motion.div>
          )}
        </div>

        {/* training screen */}
        {workout && (
          <TrainingScreen
            open={!!trainingWeId && !!trainingWe}
            onOpenChange={(o) => !o && setTrainingWeId(null)}
            workout={workout}
            weId={trainingWeId}
            onChangeWeId={setTrainingWeId}
            settings={
              settings ?? {
                theme: "dark",
                unitSystem: "metric",
                weekStart: 1,
                defaultWeightIncrement: defaults.defaultWeightIncrement,
                homeSetsShown: defaults.homeSetsShown,
                showCategory: defaults.showCategory,
                trackPR: true,
                markSetsComplete: defaults.markSetsComplete,
                autoSelectNextSet: false,
                keepScreenOn: false,
                estOneRmRepLimit: 10,
              }
            }
            onNavigateDate={(key) => goTo(key)}
          />
        )}

        {/* dialogs */}
        <ExercisePickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onPick={(ex) => void addExerciseToWorkout(ex.id)}
          onCreateNew={(name, categoryId) => void createAndAddExercise(name, categoryId)}
          title="Add exercise to workout"
          description="Pick from your library or create a new one."
        />

        {workout && (
          <CopyWorkoutDialog open={copyOpen} onOpenChange={setCopyOpen} workout={workout} dateKey={dateKey} />
        )}
        {workout && (
          <MoveWorkoutDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            workout={workout}
            dateKey={dateKey}
            onMoved={(targetKey, whole) => {
              if (whole) goTo(targetKey);
            }}
          />
        )}
        {workout && (
          <CreateGroupDialog
            open={groupCreateOpen}
            onOpenChange={setGroupCreateOpen}
            workout={workout}
            preselectedIds={groupPreselect}
            onCreated={() => {
              setSelectMode(false);
              setSelectedIds(new Set());
            }}
          />
        )}
        {workout && (
          <EditGroupDialog open={!!editGroup} onOpenChange={(o) => !o && setEditGroup(null)} workout={workout} group={editGroup} />
        )}
        {workout && (
          <SummarySheet
            open={summaryOpen}
            onOpenChange={setSummaryOpen}
            workout={workout}
            dateKey={dateKey}
            streak={streakQuery.data ?? null}
          />
        )}
      </div>
    </RestTimerProvider>
  );
}

function DaySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading day">
      <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 sm:p-5">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border bg-card p-4">
          <Skeleton className="mb-3 h-4 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-20 rounded-lg" />
            <Skeleton className="h-7 w-24 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
