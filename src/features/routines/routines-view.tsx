"use client";

// RoutinesView (#/routines): routine template manager + "Log All".
// Top-level picker switches between the routine list (default) and the full
// exercise catalogue browse mode. Clicking a routine expands its editor
// full-width below the list with a spring animation.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
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
import { Dumbbell, Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { routinesApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import type { RoutineDTO, RoutineDayDTO } from "@/lib/types";
import { toast } from "sonner";
import { useRoutineMutations } from "./use-routine-mutations";
import { RoutineCard } from "./routine-card";
import { RoutineDetail } from "./routine-detail";
import { ExerciseCatalog } from "./exercise-catalog";
import { LogAllDialog } from "./log-all-dialog";
import { DayNameDialog, RoutineFormDialog } from "./routine-dialogs";
import { expandSpring } from "./bits";

type Mode = "routines" | "exercises";

type DayDialogState = { routineId: string; day: RoutineDayDTO | null; defaultName: string } | null;

export function RoutinesView() {
  const [mode, setMode] = useState<Mode>("routines");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<RoutineDTO | null>(null);
  const [dayDialog, setDayDialog] = useState<DayDialogState>(null);
  const [logTarget, setLogTarget] = useState<{ routineId: string; dayId: string } | null>(null);

  const { data, isLoading } = useQuery({ queryKey: qk.routines, queryFn: () => routinesApi.list() });
  const { online, run, runOrder } = useRoutineMutations();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Local ordering override applied right after a routine drag; it stops
  // applying as soon as fresh server data lands (new array reference).
  const [orderOverride, setOrderOverride] = useState<{ ids: string[]; base: RoutineDTO[] } | null>(null);
  const routines = useMemo(() => {
    const base = [...(data?.routines ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    if (orderOverride && orderOverride.base === data?.routines) {
      const map = new Map(base.map((r) => [r.id, r]));
      const ordered = orderOverride.ids.map((id) => map.get(id)).filter(Boolean) as RoutineDTO[];
      for (const r of base) if (!orderOverride.ids.includes(r.id)) ordered.push(r);
      return ordered;
    }
    return base;
  }, [data?.routines, orderOverride]);

  const expandedRoutine = routines.find((r) => r.id === expandedId) ?? null;
  const logRoutine = routines.find((r) => r.id === logTarget?.routineId) ?? null;

  const onRoutineDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = routines.map((r) => r.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(routines, oldIndex, newIndex);
    setOrderOverride({ ids: next.map((r) => r.id), base: data?.routines ?? [] });
    void runOrder(
      "Routine order",
      next.map((r, i) => ({
        fn: () => routinesApi.update(r.id, { sortOrder: i }),
        path: `/api/routines/${r.id}`,
        method: "PATCH",
        body: { sortOrder: i },
      })),
    );
  };

  const openCreate = () => {
    setEditingRoutine(null);
    setFormOpen(true);
  };

  const duplicateRoutine = async (routine: RoutineDTO) => {
    const ok = await run(() => routinesApi.copy(routine.id), {
      path: `/api/routines/${routine.id}/copy`,
      method: "POST",
      label: "Duplicate routine",
    });
    if (ok) toast.success(`Duplicated “${routine.name}”`);
  };

  const deleteRoutine = async (routine: RoutineDTO) => {
    const ok = await run(() => routinesApi.remove(routine.id), {
      path: `/api/routines/${routine.id}`,
      method: "DELETE",
      label: `Deleted ${routine.name}`,
    });
    if (ok) {
      toast.success(`Deleted “${routine.name}”`);
      if (expandedId === routine.id) setExpandedId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Layers className="h-5 w-5" aria-hidden />}
        title="Routines"
        subtitle="Template your training days — log a whole day in one tap"
      />

      {/* Browse mode picker + primary action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <SelectTrigger className="w-[190px]" aria-label="Browse routines or all exercises">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="routines" className="gap-2">
              <Layers className="h-4 w-4" aria-hidden /> Routines
            </SelectItem>
            <SelectItem value="exercises" className="gap-2">
              <Dumbbell className="h-4 w-4" aria-hidden /> All Exercises
            </SelectItem>
          </SelectContent>
        </Select>

        {mode === "routines" && (
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden /> New routine
          </Button>
        )}
      </div>

      {mode === "exercises" ? (
        <ExerciseCatalog />
      ) : (
        <>
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          )}

          {!isLoading && routines.length === 0 && (
            <EmptyState
              icon={<Layers className="h-6 w-6" aria-hidden />}
              title="No routines yet"
              description="Create a template you can log in one tap"
              action={
                <Button onClick={openCreate} className="gap-1.5">
                  <Plus className="h-4 w-4" aria-hidden /> Create routine
                </Button>
              }
            />
          )}

          {routines.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onRoutineDragEnd}>
              <SortableContext items={routines.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {routines.map((routine, index) => (
                    <RoutineCard
                      key={routine.id}
                      routine={routine}
                      index={index}
                      expanded={expandedId === routine.id}
                      onToggle={() => setExpandedId((cur) => (cur === routine.id ? null : routine.id))}
                      onOpenLog={(r, dayId) => setLogTarget({ routineId: r.id, dayId })}
                      onEdit={(r) => {
                        setEditingRoutine(r);
                        setFormOpen(true);
                      }}
                      onDuplicate={(r) => void duplicateRoutine(r)}
                      onDelete={(r) => void deleteRoutine(r)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Expanded routine editor — full-width below the list */}
          <AnimatePresence initial={false}>
            {expandedRoutine && (
              <motion.div
                key={expandedRoutine.id}
                initial={{ opacity: 0, height: 0, y: -6 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -6 }}
                transition={expandSpring}
                className="overflow-hidden"
              >
                <RoutineDetail
                  routine={expandedRoutine}
                  onEdit={() => {
                    setEditingRoutine(expandedRoutine);
                    setFormOpen(true);
                  }}
                  onAddDay={(routine, defaultName) =>
                    setDayDialog({ routineId: routine.id, day: null, defaultName })
                  }
                  onRenameDay={(routine, day) => setDayDialog({ routineId: routine.id, day, defaultName: day.name })}
                  onOpenLog={(day) => setLogTarget({ routineId: expandedRoutine.id, dayId: day.id })}
                  onCollapse={() => setExpandedId(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {routines.length > 1 && (
            <p className="text-center text-xs text-muted-foreground/60">
              Drag <span className="font-medium">⠿</span> handles to reorder routines · {online ? "online" : "offline — changes queue"}
            </p>
          )}
        </>
      )}

      {/* Dialogs (keyed by target so local state resets on each open) */}
      <RoutineFormDialog
        key={editingRoutine ? `edit-${editingRoutine.id}` : "create"}
        open={formOpen}
        onOpenChange={setFormOpen}
        routine={editingRoutine}
        onCreated={(created) => setExpandedId(created.id)}
      />

      <DayNameDialog
        key={dayDialog ? `day-${dayDialog.routineId}-${dayDialog.day?.id ?? "new"}` : "day-dialog-closed"}
        open={dayDialog !== null}
        onOpenChange={(o) => {
          if (!o) setDayDialog(null);
        }}
        routineId={dayDialog?.routineId ?? null}
        day={dayDialog?.day ?? null}
        defaultName={dayDialog?.defaultName ?? "Day A"}
      />

      <LogAllDialog
        key={logTarget ? `log-${logTarget.routineId}-${logTarget.dayId}` : "log-dialog-closed"}
        routine={logRoutine}
        dayId={logTarget?.dayId ?? null}
        open={logTarget !== null}
        onOpenChange={(o) => {
          if (!o) setLogTarget(null);
        }}
      />
    </div>
  );
}
