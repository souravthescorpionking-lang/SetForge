"use client";

// Expanded routine detail (rendered full-width below the routine list):
// header (name, notes, edit, add day, collapse) + sortable day sections.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CalendarPlus, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { routinesApi } from "@/lib/client/api";
import type { RoutineDayDTO, RoutineDTO } from "@/lib/types";
import { useRoutineMutations } from "./use-routine-mutations";
import { RoutineDayCard } from "./routine-day-card";
import { expandSpring } from "./bits";

type Props = {
  routine: RoutineDTO;
  onEdit: () => void;
  onAddDay: (routine: RoutineDTO, defaultName: string) => void;
  onRenameDay: (routine: RoutineDTO, day: RoutineDayDTO) => void;
  onOpenLog: (day: RoutineDayDTO) => void;
  onCollapse: () => void;
};

export function RoutineDetail({ routine, onEdit, onAddDay, onRenameDay, onOpenLog, onCollapse }: Props) {
  const { runOrder } = useRoutineMutations();
  const ref = useRef<HTMLDivElement>(null);
  const [dayOverride, setDayOverride] = useState<{ ids: string[]; base: RoutineDayDTO[] } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const days = useMemo(() => {
    const base = [...routine.days].sort((a, b) => a.sortOrder - b.sortOrder);
    if (dayOverride && dayOverride.base === routine.days) {
      const map = new Map(base.map((d) => [d.id, d]));
      const ordered = dayOverride.ids.map((id) => map.get(id)).filter(Boolean) as RoutineDayDTO[];
      for (const d of base) if (!dayOverride.ids.includes(d.id)) ordered.push(d);
      return ordered;
    }
    return base;
  }, [routine.days, dayOverride]);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [routine.id]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = days.map((d) => d.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(days, oldIndex, newIndex);
    setDayOverride({ ids: next.map((d) => d.id), base: routine.days });
    void runOrder(
      "Day order",
      next.map((d, i) => ({
        fn: () => routinesApi.updateDay(routine.id, d.id, { sortOrder: i }),
        path: `/api/routines/${routine.id}/days/${d.id}`,
        method: "PATCH",
        body: { sortOrder: i },
      })),
    );
  };

  const nextDayName = () => {
    const n = days.length;
    const letter = String.fromCharCode(65 + (n % 26));
    return n < 26 ? `Day ${letter}` : `Day ${n + 1}`;
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={expandSpring}
      className="rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/[0.07] to-transparent p-4 shadow-sm sm:p-5"
    >
      {/* Routine header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold tracking-tight sm:text-xl">{routine.name}</h3>
          {routine.notes && <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{routine.notes}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onEdit}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => onAddDay(routine, nextDayName())}>
            <CalendarPlus className="h-4 w-4" /> Add day
          </Button>
          <Button variant="ghost" size="icon" aria-label="Collapse routine" onClick={onCollapse} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Days */}
      <div className="mt-4 space-y-3">
        {days.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
            <p className="text-sm font-medium">No days yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Split this routine into training days, then log a whole day in one tap.</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => onAddDay(routine, nextDayName())}>
              <CalendarPlus className="h-4 w-4" /> Add first day
            </Button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={days.map((d) => d.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {days.map((day) => (
                  <RoutineDayCard
                    key={day.id}
                    routineId={routine.id}
                    day={day}
                    onOpenLog={onOpenLog}
                    onRename={(d) => onRenameDay(routine, d)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </motion.div>
  );
}
