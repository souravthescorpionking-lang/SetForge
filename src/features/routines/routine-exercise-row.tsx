"use client";

// One routine exercise row: header (drag, category dot, name, set count,
// copy-previous badge, overview link, remove) + collapsible predefined set editor.
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, Info, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CategoryDot } from "@/components/shared/category-dot";
import { routinesApi } from "@/lib/client/api";
import { fieldsForType } from "@/lib/constants";
import { useApp } from "@/lib/client/store";
import type { RoutineExerciseDTO } from "@/lib/types";
import { useRoutineMutations } from "./use-routine-mutations";
import { PredefinedSetRow } from "./predefined-set-row";
import { DragHandle, expandSpring } from "./bits";
import { cn } from "@/lib/utils";

type Props = {
  routineId: string;
  dayId: string;
  re: RoutineExerciseDTO;
};

export function RoutineExerciseRow({ routineId, dayId, re }: Props) {
  const { run } = useRoutineMutations();
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const [open, setOpen] = useState(true);

  const fields = useMemo(() => fieldsForType(re.exercise.type), [re.exercise.type]);
  const weightStep = re.exercise.weightIncrement ?? settings?.defaultWeightIncrement ?? 2.5;
  const sets = useMemo(() => [...re.sets].sort((a, b) => a.sortOrder - b.sortOrder), [re.sets]);
  const allBlank =
    sets.length > 0 && sets.every((s) => s.weight == null && s.reps == null && s.distance == null && s.timeSec == null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: re.id });
  const style = { transform: CSS.Translate.toString(transform), transition };

  const exercisePath = `/api/routines/${routineId}/days/${dayId}/exercises/${re.id}`;

  const addSet = () => {
    void run(() => routinesApi.addSet(routineId, dayId, re.id, {}), {
      path: `${exercisePath}/sets`,
      method: "POST",
      body: {},
      label: "Set added",
    });
  };

  const removeExercise = () => {
    void run(() => routinesApi.removeExercise(routineId, dayId, re.id), {
      path: exercisePath,
      method: "DELETE",
      label: `Removed ${re.exercise.name}`,
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border border-border/70 bg-background/80",
        isDragging && "z-10 rotate-[0.4deg] scale-[1.01] border-primary/40 shadow-lg shadow-primary/10",
      )}
    >
      <div className="flex items-center gap-1 px-1 py-0.5">
        <DragHandle {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-accent/40"
        >
          <CategoryDot colour={re.exercise.category?.colour} />
          <span className="truncate text-sm font-semibold">{re.exercise.name}</span>
          <span className="numeric shrink-0 text-xs text-muted-foreground">
            {sets.length} {sets.length === 1 ? "set" : "sets"}
          </span>
          {allBlank && (
            <span className="hidden shrink-0 items-center gap-1 rounded-md border border-dashed border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">
              copy previous
            </span>
          )}
          <ChevronDown
            aria-hidden
            className={cn("ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
          />
        </button>
        <button
          type="button"
          aria-label={`View ${re.exercise.name} overview`}
          title="Exercise overview"
          onClick={() => navigate(`/exercise-overview/${re.exerciseId}`)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Info className="h-4 w-4" />
        </button>
        <ConfirmDialog
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${re.exercise.name}`}
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          }
          title="Remove exercise?"
          description={`“${re.exercise.name}” and its ${sets.length} predefined set${
            sets.length === 1 ? "" : "s"
          } will be removed from this day.`}
          confirmLabel="Remove"
          onConfirm={removeExercise}
        />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="sets"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={expandSpring}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 px-2 pb-2 pl-8">
              {sets.map((s, i) => (
                <PredefinedSetRow
                  key={s.id}
                  routineId={routineId}
                  dayId={dayId}
                  routineExerciseId={re.id}
                  set={s}
                  index={i}
                  fields={fields}
                  weightStep={weightStep}
                />
              ))}
              {sets.length === 0 && (
                <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                  No predefined sets yet — add one, or leave the exercise blank to copy your previous workout when
                  logging.
                </p>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={addSet}
                aria-label={`Add set to ${re.exercise.name}`}
              >
                <Plus className="h-4 w-4" /> Add set
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
