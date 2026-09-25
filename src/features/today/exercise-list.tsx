"use client";

// Sortable list of workout exercises with superset group runs (coloured
// connector bar + name chip) and the prominent Add Exercise button.
import { useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { workoutsApi } from "@/lib/client/api";
import { useInvalidate } from "@/lib/client/query";
import type { WorkoutDTO, WorkoutExerciseDTO } from "@/lib/types";
import { toast } from "sonner";
import { ExerciseCard } from "./exercise-card";
import { useMutate } from "./use-mutate";

type Props = {
  workout: WorkoutDTO;
  showCategory: boolean;
  homeSetsShown: number;
  markSetsComplete: boolean;
  selectMode: boolean;
  selectedIds: Set<string>;
  onOpenExercise: (weId: string) => void;
  onToggleSelect: (weId: string) => void;
  onLongPress: (weId: string) => void;
  onAddExercise: () => void;
};

export function ExerciseList({
  workout,
  showCategory,
  homeSetsShown,
  markSetsComplete,
  selectMode,
  selectedIds,
  onOpenExercise,
  onToggleSelect,
  onLongPress,
  onAddExercise,
}: Props) {
  const mutate = useMutate();
  const invalidate = useInvalidate();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const exercises = useMemo(
    () => [...workout.exercises].sort((a, b) => a.sortOrder - b.sortOrder),
    [workout.exercises],
  );
  const ids = useMemo(() => exercises.map((we) => we.id), [exercises]);

  // contiguous runs of the same group
  const runs = useMemo(() => {
    const out: Array<{ groupId: string | null; items: WorkoutExerciseDTO[] }> = [];
    for (const we of exercises) {
      const last = out[out.length - 1];
      if (last && last.groupId === we.groupId) last.items.push(we);
      else out.push({ groupId: we.groupId, items: [we] });
    }
    return out;
  }, [exercises]);

  const groupById = useMemo(() => {
    const m = new Map<string, WorkoutDTO["groups"][number]>();
    for (const g of workout.groups) m.set(g.id, g);
    return m;
  }, [workout.groups]);

  const onDragStart = (_: DragStartEvent) => {
    // subtle feedback handled by card styles
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const newIds = arrayMove(ids, oldIndex, newIndex);
    await mutate({
      label: "Exercise order saved",
      run: () => workoutsApi.reorderExercises(workout.id, newIds),
      queue: { path: `/api/workouts/${workout.id}/exercises/order`, method: "PUT", body: { ids: newIds } },
    });
    invalidate.workout();
  };

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {runs.map((run, i) => {
              const group = run.groupId ? groupById.get(run.groupId) ?? null : null;
              return (
                <div key={run.groupId ?? `ungrouped-${i}`} className="relative">
                  {group && (
                    <div aria-hidden className="absolute top-3 bottom-3 left-0 w-1.5 rounded-full" style={{ backgroundColor: group.colour }} />
                  )}
                  {group && (
                    <div className="relative mb-2 flex items-center gap-2 pl-4">
                      <span
                        className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm"
                        style={{ backgroundColor: group.colour }}
                      >
                        {group.name}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground">superset</span>
                    </div>
                  )}
                  <div className={group ? "space-y-3 pl-4" : "space-y-3"}>
                    {run.items.map((we) => (
                      <ExerciseCard
                        key={we.id}
                        we={we}
                        group={group}
                        showCategory={showCategory}
                        homeSetsShown={homeSetsShown}
                        markSetsComplete={markSetsComplete}
                        selectMode={selectMode}
                        isSelected={selectedIds.has(we.id)}
                        onOpen={() => onOpenExercise(we.id)}
                        onToggleSelect={() => onToggleSelect(we.id)}
                        onLongPress={() => onLongPress(we.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <Button
        size="lg"
        className="h-14 w-full rounded-2xl text-base font-bold shadow-lg shadow-primary/25"
        onClick={onAddExercise}
        aria-label="Add an exercise to this workout"
      >
        <Plus className="h-5 w-5" /> Add Exercise
      </Button>
    </div>
  );
}
