"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TodayArrangeScreen — #/today/arrange (Part 6 §4.10c), optionally
// #/today/arrange?date=YYYY-MM-DD for a non-today day.
//
//   TopBar (56)  : [◀ back to #/today] · "Arrange · {date}" · [Done]
//   ScrollBody   : the same ArrangeBlocksView as the routine day arrange —
//                  one block per workout superset group (+ "Ungrouped").
//   Done         : workoutsApi.reorderExercises(workoutId, flatIds) via the
//                  offline-aware useMutate → invalidate → back.
//
// Entry point: the Today screen ⋮ menu ("Arrange exercises") — agent 6-e owns
// that menu item; the route itself is live and reachable by direct URL now.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { ArrowDownUp, Check, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { workoutsApi } from "@/lib/client/api";
import { useWorkoutByDate } from "@/lib/client/query";
import { formatDayLabel, todayKey } from "@/lib/client/format";
import { useHashRoute } from "@/features/shell/router";
import { useMutate } from "./use-mutate";
import {
  buildArrangeBlocks,
  flattenBlocks,
  moveBlock,
  moveMember,
  type ArrangeBlock,
} from "@/features/routines/arrange-blocks";
import { ArrangeBlocksView } from "@/features/routines/arrange-blocks-view";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function TodayArrangeScreen() {
  const navigate = useApp((s) => s.navigate);
  const route = useHashRoute();
  const mutate = useMutate();
  const [saving, setSaving] = useState(false);

  const routeDate = route.name === "today-arrange" ? route.query.get("date") : null;
  const dateKey = routeDate && DATE_RE.test(routeDate) ? routeDate : todayKey();

  // ---------- data ----------
  const { data, isLoading } = useWorkoutByDate(dateKey);
  const workout = data?.workout ?? null;

  const members = useMemo(
    () =>
      workout
        ? [...workout.exercises]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((we) => ({ id: we.id, name: we.exercise.name, groupId: we.groupId ?? null }))
        : [],
    [workout],
  );
  const groupNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of workout?.groups ?? []) m.set(g.id, g.name);
    return m;
  }, [workout]);

  // ---------- local arrange draft (resyncs when the server order changes) ----------
  const initialBlocks = useMemo(() => buildArrangeBlocks(members, groupNames), [members, groupNames]);
  const initialIds = useMemo(() => flattenBlocks(initialBlocks).join("|"), [initialBlocks]);
  const [blocks, setBlocks] = useState<ArrangeBlock[]>(initialBlocks);
  useEffect(() => {
    setBlocks(initialBlocks);
  }, [initialBlocks]);

  const currentIds = flattenBlocks(blocks).join("|");
  const changed = currentIds !== initialIds;

  const backPath = dateKey === todayKey() ? "/today" : `/today?date=${dateKey}`;

  // ---------- persistence ----------
  const save = async () => {
    if (!workout || saving) return;
    const flatIds = flattenBlocks(blocks);
    if (flatIds.join("|") === initialIds) {
      navigate(backPath);
      return;
    }
    setSaving(true);
    await mutate({
      label: "Exercise order saved",
      run: () => workoutsApi.reorderExercises(workout.id, flatIds),
      queue: {
        path: `/api/workouts/${workout.id}/exercises/order`,
        method: "PUT",
        body: { ids: flatIds },
      },
    });
    setSaving(false);
    toast.success("Exercise order saved", {
      description: `${formatDayLabel(dateKey)} · ${flatIds.length} exercises`,
    });
    navigate(backPath);
  };

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          leading={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 flex-none"
              onClick={() => navigate(backPath)}
              aria-label="Back to today"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <ArrowDownUp className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
              <span className="min-w-0 truncate">Arrange · {formatDayLabel(dateKey)}</span>
            </span>
          }
          actions={
            <Button
              type="button"
              className="h-11 flex-none gap-1.5 px-4 text-sm font-bold"
              disabled={saving || !workout || members.length < 2}
              aria-label="Save the new exercise order"
              onClick={() => void save()}
            >
              <Check className="h-4 w-4" aria-hidden />
              {saving ? "Saving…" : "Done"}
            </Button>
          }
        />
      }
    >
      <ScrollBody>
        {isLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading day">
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-28 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-28 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : !workout ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">No workout on this day</p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              Start logging exercises first — then arrange supersets here.
            </p>
            <Button type="button" variant="outline" onClick={() => navigate(backPath)}>
              Back to today
            </Button>
          </div>
        ) : members.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">No exercises in this workout</p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              Add exercises from the Today screen first, then arrange them here.
            </p>
          </div>
        ) : (
          <>
            <ArrangeBlocksView
              blocks={blocks}
              onMoveBlock={(blockIndex, delta) =>
                setBlocks((prev) => moveBlock(prev, blockIndex, delta))
              }
              onMoveMember={(blockKey, memberIndex, delta) =>
                setBlocks((prev) => moveMember(prev, blockKey, memberIndex, delta))
              }
            />
            <p className="flex-none px-1 text-xs leading-relaxed text-muted-foreground">
              Arrows on a block header move the whole superset; arrows on a row move that exercise
              inside its block.
              {changed ? " Unsaved changes — tap Done to save." : ""}
            </p>
            <div className="h-2 flex-none" aria-hidden />
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}
