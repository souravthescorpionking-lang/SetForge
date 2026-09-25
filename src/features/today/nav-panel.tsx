"use client";

// Sticky slim horizontal nav bar (rendered below the workout header):
// drag-reorderable exercise chips (tap → open that exercise's training
// screen) + Add exercise / superset group actions / Home buttons.
import { useRef } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Flame, Link2, Plus, Settings2 } from "lucide-react";
import { workoutsApi } from "@/lib/client/api";
import { useInvalidate } from "@/lib/client/query";
import type { WorkoutDTO, WorkoutExerciseDTO, WorkoutGroupDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMutate } from "./use-mutate";

export function NavPanel({
  workout,
  activeWeId,
  onOpenExercise,
  onAddExercise,
  onAddToGroup,
  onEditGroup,
  onHome,
}: {
  workout: WorkoutDTO;
  activeWeId: string | null;
  onOpenExercise: (weId: string) => void;
  onAddExercise: () => void;
  onAddToGroup: () => void;
  onEditGroup: (group: WorkoutGroupDTO) => void;
  onHome: () => void;
}) {
  const mutate = useMutate();
  const invalidate = useInvalidate();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const exercises = [...workout.exercises].sort((a, b) => a.sortOrder - b.sortOrder);
  const ids = exercises.map((we) => we.id);

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
    <nav
      aria-label="Workout exercise navigation"
      className="rounded-2xl border bg-popover/95 p-1.5 shadow-sm backdrop-blur-md"
    >
      <div className="flex items-center gap-1">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            <div className="scroll-slim flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5">
              {exercises.length === 0 && (
                <span className="px-2 py-2 text-xs text-muted-foreground">No exercises yet — add one to start</span>
              )}
              {exercises.map((we) => (
                <NavChip key={we.id} we={we} active={activeWeId === we.id} onClick={() => onOpenExercise(we.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {exercises.length > 0 && <Separator orientation="vertical" className="!h-8 shrink-0" />}

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Add exercise"
            className="h-10 w-10 rounded-xl text-primary hover:bg-primary/10 hover:text-primary"
            onClick={onAddExercise}
          >
            <Plus className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Create a superset group"
            className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onAddToGroup}
          >
            <Link2 className="h-4.5 w-4.5" />
          </Button>
          {workout.groups.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit superset groups"
                  className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Settings2 className="h-4.5 w-4.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">Edit group</DropdownMenuLabel>
                {workout.groups.map((g) => (
                  <DropdownMenuItem key={g.id} onClick={() => onEditGroup(g)}>
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: g.colour }} />
                    <span className="truncate">{g.name}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onAddToGroup}>
                  <Link2 className="h-4 w-4" /> New group…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Jump back to today"
            className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onHome}
          >
            <Flame className="h-4.5 w-4.5" />
          </Button>
        </div>
      </div>
    </nav>
  );
}

function NavChip({
  we,
  active,
  onClick,
}: {
  we: WorkoutExerciseDTO;
  active: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: we.id });
  // suppress the click that fires after a completed drag gesture
  const downPos = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("shrink-0", isDragging && "z-10")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => {
          const down = downPos.current;
          downPos.current = null;
          if (down && (Math.abs(e.clientX - down.x) > 6 || Math.abs(e.clientY - down.y) > 6)) return;
          onClick();
        }}
        onPointerDown={(e) => {
          downPos.current = { x: e.clientX, y: e.clientY };
          listeners?.onPointerDown?.(e);
        }}
        className={cn(
          "flex h-10 max-w-44 touch-manipulation items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors",
          active
            ? "border-primary/60 bg-primary/15 text-primary"
            : "bg-muted/60 text-foreground hover:border-primary/40 hover:bg-accent",
          isDragging && "cursor-grabbing opacity-80 shadow-lg ring-2 ring-primary/60",
        )}
        aria-label={`Open ${we.exercise.name} (${we.sets.length} sets) — drag to reorder`}
      >
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: we.exercise.category?.colour ?? "var(--muted-foreground)" }}
        />
        <span className="max-w-40 truncate sm:max-w-44" title={we.exercise.name}>{we.exercise.name}</span>
        <span className="numeric shrink-0 rounded-md bg-background/70 px-1 py-0.5 text-[10px] text-muted-foreground">
          {we.sets.length}
        </span>
      </button>
    </div>
  );
}
