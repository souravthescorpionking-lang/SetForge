"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuilderAddSelectedScreen — §4.3 "…/add/selected"
// (#/builder/session/{id|new}/add/selected?return={the add hash}).
//
//   TopBar (56)   : BackButton → the add screen · "Selected"
//   List rows 56  : grip handle (drag reorder) · name · muscle chips (max 2)
//                   · ✕ removes the pick
//   BottomBar (56): "Update" → back to the add route with the edited
//                   ?selected= csv (the picks live in the add route's URL)
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Screen, TopBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { useExercises } from "@/lib/client/query";
import type { ExerciseDTO } from "@/lib/types";
import { addExerciseHash, initialHashQuery, parseAddFlowQuery } from "./add-flow-url";
import { MuscleChips } from "./add-flow-shared";

function SortablePickRow({
  id,
  name,
  muscles,
  onRemove,
}: {
  id: string;
  name: string;
  muscles: string[];
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      data-row
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap px-2", isDragging && "z-20 opacity-80")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        {...tourAttrs({ id: "builderSelected.grip", label: "Drag handle", help: "Drag to reorder the picks.", order: 30 })}
        aria-label={`Reorder ${name}`}
        className="flex h-11 w-11 flex-none touch-none items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{name}</span>
      <MuscleChips muscles={muscles} />
      <button
        type="button"
        {...tourAttrs({ id: "builderSelected.remove", label: "Remove", help: "Drop this exercise from the picks.", order: 40 })}
        aria-label={`Remove ${name}`}
        onClick={onRemove}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

export default function BuilderAddSelectedScreen({ routineId }: { routineId: string }) {
  const navigate = useApp((s) => s.navigate);

  // ?return= carries the full add-route hash (selection included).
  const returnHash = useMemo(() => {
    const raw = initialHashQuery().get("return") ?? "";
    return raw.startsWith("#") ? raw : raw ? `#${raw}` : `#/builder/session/${routineId}/add`;
  }, [routineId]);
  const returnFlow = useMemo(() => {
    const queryPart = returnHash.split("?")[1] ?? "";
    return parseAddFlowQuery(new URLSearchParams(queryPart));
  }, [returnHash]);

  const [ids, setIds] = useState<string[]>(returnFlow.selected);

  const { data: exercises, isLoading } = useExercises();
  const byId = useMemo(() => {
    const m = new Map<string, ExerciseDTO>();
    for (const e of exercises ?? []) m.set(e.id, e);
    return m;
  }, [exercises]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setIds((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  const update = () => {
    navigate(addExerciseHash(routineId, { ...returnFlow, selected: ids }));
  };

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash={returnHash} label="Back to Add exercise" />}
          title={
            <span {...tourAttrs({ id: "builderSelected.title", label: "Selected", help: "The exercises picked for this series.", order: 10 })}>
              Selected
            </span>
          }
          actions={<TopBarHelp />}
        />
      }
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            className="h-11 w-full gap-1.5 text-base font-bold"
            tour={{ id: "builderSelected.update", label: "Update", help: "Apply the reorder or removals to the picks.", order: 50 }}
            onClick={update}
          >
            <Check className="h-5 w-5" aria-hidden />
            Update
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody>
        {isLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading exercises">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : ids.length === 0 ? (
          <div
            role="group"
            aria-label="No picks"
            className="flex h-[200px] w-full flex-none flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border"
          >
            <p className="px-4 text-center text-sm font-semibold">Nothing selected.</p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              Remove picks with ✕ — they&apos;ll disappear from the basket back on the add screen.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="divide-y divide-border/60">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  {ids.map((id) => {
                    const ex = byId.get(id);
                    return (
                      <SortablePickRow
                        key={id}
                        id={id}
                        name={ex?.name ?? "Exercise"}
                        muscles={ex?.primaryMuscles ?? []}
                        onRemove={() => setIds((prev) => prev.filter((x) => x !== id))}
                      />
                    );
                  })}
                </SortableContext>
              </DndContext>
            </div>
          </div>
        )}
        <div className="h-2 flex-none" aria-hidden />
      </ScrollBody>
    </Screen>
  );
}
