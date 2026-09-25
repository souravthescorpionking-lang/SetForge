"use client";

// One routine day section: header (drag, name, exercise count, Log All,
// rename, delete) + sortable exercise list + add-exercise picker.
import { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ExercisePickerDialog } from "@/components/shared/exercise-picker";
import { routinesApi } from "@/lib/client/api";
import type { RoutineDayDTO, RoutineExerciseDTO } from "@/lib/types";
import { useRoutineMutations } from "./use-routine-mutations";
import { RoutineExerciseRow } from "./routine-exercise-row";
import { DragHandle } from "./bits";
import { cn } from "@/lib/utils";

type Props = {
  routineId: string;
  day: RoutineDayDTO;
  onOpenLog: (day: RoutineDayDTO) => void;
  onRename: (day: RoutineDayDTO) => void;
};

export function RoutineDayCard({ routineId, day, onOpenLog, onRename }: Props) {
  const { online, run } = useRoutineMutations();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Local ordering override applied right after a drag, cleared when fresh server data lands.
  const [orderOverride, setOrderOverride] = useState<{ ids: string[]; base: RoutineExerciseDTO[] } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const exercises = useMemo(() => {
    const base = [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder);
    if (orderOverride && orderOverride.base === day.exercises) {
      const map = new Map(base.map((e) => [e.id, e]));
      const ordered = orderOverride.ids.map((id) => map.get(id)).filter(Boolean) as RoutineExerciseDTO[];
      for (const e of base) if (!orderOverride.ids.includes(e.id)) ordered.push(e);
      return ordered;
    }
    return base;
  }, [day.exercises, orderOverride]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: day.id });
  const style = { transform: CSS.Translate.toString(transform), transition };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = exercises.map((e) => e.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(exercises, oldIndex, newIndex);
    setOrderOverride({ ids: next.map((e) => e.id), base: day.exercises });
    void run(() => routinesApi.reorderExercises(routineId, day.id, next.map((e) => e.id)), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/order`,
      method: "PUT",
      body: { ids: next.map((e) => e.id) },
      label: "Exercise order",
    });
  };

  const removeDay = () => {
    void run(() => routinesApi.removeDay(routineId, day.id), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "DELETE",
      label: `Deleted ${day.name}`,
    });
  };

  const logDisabled = !online || exercises.length === 0;
  const logDisabledReason = !online
    ? "Requires connection"
    : exercises.length === 0
      ? "Add exercises first"
      : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-2xl border border-border/70 bg-card/50 p-3 sm:p-4",
        isDragging && "z-10 scale-[1.01] border-primary/40 shadow-lg shadow-primary/10",
      )}
    >
      <div className="flex items-center gap-1">
        <DragHandle {...attributes} {...listeners} />
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
          <h4 className="truncate text-sm font-bold sm:text-base">{day.name}</h4>
          <Badge variant="secondary" className="numeric shrink-0">
            {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {logDisabledReason ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="sm" className="gap-1.5" disabled aria-label={`Log all of ${day.name}`}>
                    <Zap className="h-4 w-4" /> Log All
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{logDisabledReason}</TooltipContent>
            </Tooltip>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={() => onOpenLog(day)} aria-label={`Log all of ${day.name}`}>
              <Zap className="h-4 w-4" /> Log All
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Rename ${day.name}`}
            className="h-9 w-9 text-muted-foreground"
            onClick={() => onRename(day)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${day.name}`}
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            }
            title="Delete day?"
            description={`“${day.name}” and its ${exercises.length} exercise${
              exercises.length === 1 ? "" : "s"
            } will be removed from this routine.`}
            confirmLabel="Delete day"
            onConfirm={removeDay}
          />
        </div>
      </div>

      <div className="mt-2 space-y-2 pl-0 sm:pl-6">
        {exercises.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {exercises.map((re) => (
                  <RoutineExerciseRow key={re.id} routineId={routineId} dayId={day.id} re={re} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {exercises.length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
            No exercises in this day yet.
          </p>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 border-dashed"
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="h-4 w-4" /> Add exercise
        </Button>
      </div>

      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(exercise) => {
          void run(() => routinesApi.addExercise(routineId, day.id, exercise.id), {
            path: `/api/routines/${routineId}/days/${day.id}/exercises`,
            method: "POST",
            body: { exerciseId: exercise.id },
            label: `Added ${exercise.name}`,
          });
        }}
        title={`Add exercise — ${day.name}`}
        description="Pick from your exercise catalogue to add it to this routine day."
      />
    </div>
  );
}
