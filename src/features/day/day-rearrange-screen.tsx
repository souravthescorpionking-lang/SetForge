"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DayRearrangeScreen — #/days/{dayId}/rearrange (Part 9 §5.1).
//
//   TopBar (56)  : [Cancel ghost] · "Rearrange" · [Save primary — disabled
//                  until dirty] · TopBarHelp
//   ScrollBody   : flat list — series headers "A SERIES" (32px label + size
//                  label right) + 56px rows: GripVertical drag handle ·
//                  exercise name · tempo (muted) · "{n}× · Rest"
//                  ("{n}× · Rest: none" when restNone).
//
// dnd-kit drag (repo pattern from the builder editors): drag an exercise
// within its series to reorder, onto another exercise to join THAT series
// (group membership changes → codes/labels recompute by size rule on every
// move), or onto a series header to append to that series. EMPTY series are
// dropped. Draft state is local; Save → dayApi.putOverride(dayId,
// { seriesOrder }) → invalidate the day query → back → toast.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GripVertical, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { dayApi } from "@/lib/client/api";
import { qk, useOnline } from "@/lib/client/query";
import { groupLabelForSize } from "@/lib/grouping";
import { errorMessage } from "@/features/routines/screen-helpers";
import type { DayExerciseDTO } from "@/lib/types";

type Item = Pick<DayExerciseDTO, "id"> & {
  name: string;
  tempo: string | null;
  setCount: number;
  restNone: boolean;
};

const seriesLetter = (i: number) => String.fromCharCode(65 + (i % 26));

/** Move `id` so it lands at target series/position; empty series dropped.
 *  NOTE: the source series' empty shell stays in place until the final filter,
 *  so target indices are stable throughout. */
function moveTo(series: string[][], id: string, targetSeries: number, targetIndex: number): string[][] {
  const from = series.findIndex((s) => s.includes(id));
  if (from < 0) return series;
  let insertIndex = targetIndex;
  if (insertSeriesSameSeries(from, targetSeries, series, id)) {
    const currentIdx = series[from].indexOf(id);
    if (currentIdx === insertIndex || currentIdx + 1 === insertIndex) return series;
    // removing first shifts the target index by one when moving downward
    if (currentIdx < insertIndex) insertIndex -= 1;
    const next = [...series];
    next[from] = arrayMove(next[from], currentIdx, insertIndex);
    return next;
  }
  const next = series.map((s) => s.filter((x) => x !== id));
  const target = [...(next[targetSeries] ?? [])];
  target.splice(Math.min(insertIndex, target.length), 0, id);
  next[targetSeries] = target;
  return next.filter((s) => s.length > 0);
}

function insertSeriesSameSeries(from: number, target: number, series: string[][], id: string): boolean {
  return from === target && series[target]?.includes(id) === true;
}

// ---------- series header (32px, droppable → append target) ----------

function SeriesHeader({ index, size }: { index: number; size: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `h:${index}` });
  const letter = seriesLetter(index);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-8 w-full flex-none items-center gap-2 overflow-hidden rounded-lg px-3 transition-colors",
        isOver ? "bg-primary/10" : "bg-muted/40",
      )}
      aria-label={`Series ${letter}${groupLabelForSize(size) ? ` — ${groupLabelForSize(size)}` : ""}`}
    >
      <span className="flex-none text-xs font-bold tabular-nums uppercase leading-none text-muted-foreground">
        {letter} series
      </span>
      <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
      {groupLabelForSize(size) ? (
        <span className="flex-none text-xs font-semibold leading-none text-muted-foreground">
          {groupLabelForSize(size)}
        </span>
      ) : null}
    </div>
  );
}

// ---------- 56px sortable row ----------

function SortableRow({ item, code }: { item: Item; code: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex h-14 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-2 touch-none",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
      data-row
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        {...tourAttrs({ id: "dayRearrange.handle", label: "Drag handle", help: "Drag to reorder within a series or drop onto another series.", order: 20 })}
        aria-label={`Reorder ${item.name}`}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <span className="w-7 flex-none text-xs font-bold tabular-nums leading-none text-muted-foreground">{code}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{item.name}</span>
      <span className="max-w-[72px] flex-none truncate text-xs tabular-nums leading-none text-muted-foreground">
        {item.tempo ? item.tempo.replace(/-/g, "/") : ""}
      </span>
      <span className="flex-none text-xs tabular-nums leading-none text-muted-foreground">
        {item.setCount}× · {item.restNone ? "Rest: none" : "Rest"}
      </span>
    </div>
  );
}

// ---------- screen ----------

export default function DayRearrangeScreen({ dayId }: { dayId: string }) {
  return <DayRearrangeInner key={dayId} dayId={dayId} />;
}

function DayRearrangeInner({ dayId }: { dayId: string }) {
  const navigate = useApp((s) => s.navigate);
  const online = useOnline();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ---------- data: the merged day (override already applied server-side) ----------
  const { data: day, isLoading, error } = useQuery({
    queryKey: qk.day(dayId),
    queryFn: () => dayApi.get(dayId),
    retry: 1,
  });

  const itemsById = useMemo(() => {
    const m = new Map<string, Item>();
    for (const ex of day?.exercises ?? []) {
      const tempo = ex.sets.find((s) => s.tempo?.trim())?.tempo ?? null;
      m.set(ex.id, {
        id: ex.id,
        name: ex.exercise.name,
        tempo: tempo ? tempo.trim() : null,
        setCount: ex.sets.length,
        restNone: ex.restNone ?? false,
      });
    }
    return m;
  }, [day]);

  const initialSeries = useMemo(
    () => (day ? day.series.map((s) => s.exercises.map((e) => e.id)) : []),
    [day],
  );
  const initialKey = useMemo(() => JSON.stringify(initialSeries), [initialSeries]);
  const [series, setSeries] = useState<string[][]>(initialSeries);
  useEffect(() => {
    setSeries(initialSeries);
  }, [initialSeries]);

  const dirty = JSON.stringify(series) !== initialKey;

  // ---------- drag ----------
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (overId.startsWith("h:")) {
      // dropped on a series header → append to that series
      const target = Number(overId.slice(2));
      setSeries((prev) => {
        const from = prev.findIndex((s) => s.includes(activeId));
        if (from === target && prev[from].length === 1) return prev;
        return moveTo(prev, activeId, target, prev[target]?.length ?? 0);
      });
      return;
    }
    setSeries((prev) => {
      const targetSeries = prev.findIndex((s) => s.includes(overId));
      if (targetSeries < 0) return prev;
      const targetIndex = prev[targetSeries].indexOf(overId);
      return moveTo(prev, activeId, targetSeries, targetIndex);
    });
  };

  // ---------- save ----------
  const save = async () => {
    if (!day || saving || !dirty) return;
    if (!online) {
      toast.info("Rearranging needs a connection");
      return;
    }
    setSaving(true);
    try {
      await dayApi.putOverride(dayId, { seriesOrder: series });
      qc.invalidateQueries({ queryKey: ["day"] });
      toast.success("Rearrange saved", {
        description: `${day.name} · ${series.length} ${series.length === 1 ? "series" : "series"}`,
      });
      navigate(`/days/${dayId}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (window.history.length > 1) window.history.back();
    else navigate(`/days/${dayId}`);
  };

  const flatIds = useMemo(() => series.flat(), [series]);

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          leading={
            <Button
              type="button"
              variant="ghost"
              className="h-11 flex-none px-3 text-sm font-semibold"
              tour={{ id: "dayRearrange.cancel", label: "Cancel", help: "Discard the draft order and go back.", order: 10 }}
              onClick={cancel}
            >
              Cancel
            </Button>
          }
          title="Rearrange"
          actions={
            <>
              <Button
                type="button"
                className="h-11 flex-none gap-1.5 px-4 text-sm font-bold"
                disabled={saving || !day || !dirty}
                aria-label="Save the new series order"
                tour={{ id: "dayRearrange.save", label: "Save", help: "Save the new series order as your day override.", order: 30 }}
                onClick={() => void save()}
              >
                <Save className="h-4 w-4" aria-hidden />
                {saving ? "Saving…" : "Save"}
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
    >
      <ScrollBody>
        {error || (!isLoading && !day) ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Day not found</p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Error-state back link for a missing day" }}
              onClick={() => navigate("/workout")}
            >
              Back to workout
            </Button>
          </div>
        ) : isLoading || !day ? (
          <div className="flex flex-col gap-2 p-1" aria-busy="true" aria-label="Loading day">
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : (day.dayType ?? "WORKOUT") === "REST" ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Rest day</p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              Nothing to arrange — rest days carry no exercises.
            </p>
          </div>
        ) : flatIds.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">No exercises in this day</p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              Add exercises from the day view first, then arrange them here.
            </p>
          </div>
        ) : (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={flatIds} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {series.map((ids, si) => (
                    <div key={ids[0] ?? `s${si}`} className="flex flex-col gap-1">
                      <SeriesHeader index={si} size={ids.length} />
                      {ids.map((id, ii) => {
                        const item = itemsById.get(id);
                        if (!item) return null;
                        return (
                          <SortableRow
                            key={id}
                            item={item}
                            code={ids.length > 1 ? `${seriesLetter(si)}${ii + 1}` : seriesLetter(si)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <p
              {...tourAttrs({ id: "dayRearrange.hint", label: "How it works", help: "Drop onto another series to change its group; empty series disappear.", order: 40, hint: true })}
              className="flex-none px-1 text-xs leading-relaxed text-muted-foreground"
            >
              Drag within a series to reorder, or onto another series to change its group — labels recompute
              (2 = Superset, 3 = Triset, 4+ = Giant set) and empty series are dropped.
              {dirty ? " Unsaved changes — tap Save to keep them." : ""}
            </p>
            <div className="h-2 flex-none" aria-hidden />
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}
