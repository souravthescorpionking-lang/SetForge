"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DayArrangeScreen — #/programs/{id}/day/{dayId}/arrange (Part 6 §4.10c).
//
//   TopBar (56)  : [◀ back to the program] · "Arrange · {day name}" · [Done]
//   ScrollBody   : one rounded-lg block per superset group (+ one "Ungrouped"
//                  block). Block header 48px: code chip A 32px · names joined
//                  · [▲][▼] move the WHOLE group; body rows 40px: member name
//                  · [▲][▼] move within the group.
//   Done         : flatten blocks (groups as units) → routinesApi.
//                  reorderExercises(routineId, dayId, ids) → invalidate → back.
//
// Draft state is local — nothing persists before Done. A no-op session (same
// flatten as the initial blocks) skips the API call entirely.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { ArrowDownUp, Check, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { routinesApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import { useRoutineRun } from "./screen-helpers";
import {
  buildArrangeBlocks,
  flattenBlocks,
  moveBlock,
  moveMember,
  type ArrangeBlock,
} from "./arrange-blocks";
import { ArrangeBlocksView } from "./arrange-blocks-view";

export default function DayArrangeScreen({ routineId, dayId }: { routineId: string; dayId: string }) {
  return <DayArrangeInner key={`${routineId}:${dayId}`} routineId={routineId} dayId={dayId} />;
}

function DayArrangeInner({ routineId, dayId }: { routineId: string; dayId: string }) {
  const navigate = useApp((s) => s.navigate);
  const { run } = useRoutineRun();
  const [saving, setSaving] = useState(false);

  // ---------- data ----------
  const { data: routine, isLoading, error } = useQuery({
    queryKey: qk.routine(routineId),
    queryFn: () => routinesApi.get(routineId),
    retry: 1,
  });

  const days = useMemo(
    () => (routine ? [...routine.days].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [routine],
  );
  const day = useMemo(() => days.find((d) => d.id === dayId) ?? null, [days, dayId]);
  const members = useMemo(
    () =>
      day
        ? [...day.exercises]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((re) => ({ id: re.id, name: re.exercise.name, groupId: re.groupId ?? null }))
        : [],
    [day],
  );

  // ---------- local arrange draft (resyncs when the server order changes) ----------
  const initialBlocks = useMemo(() => buildArrangeBlocks(members), [members]);
  const initialIds = useMemo(() => flattenBlocks(initialBlocks).join("|"), [initialBlocks]);
  const [blocks, setBlocks] = useState<ArrangeBlock[]>(initialBlocks);
  useEffect(() => {
    setBlocks(initialBlocks);
  }, [initialBlocks]);

  const currentIds = flattenBlocks(blocks).join("|");
  const changed = currentIds !== initialIds;

  // ---------- persistence ----------
  const save = async () => {
    if (!day || saving) return;
    const flatIds = flattenBlocks(blocks);
    if (flatIds.join("|") === initialIds) {
      navigate(`/programs/${routineId}`);
      return;
    }
    setSaving(true);
    const ok = await run(
      () => routinesApi.reorderExercises(routineId, dayId, flatIds),
      {
        path: `/api/routines/${routineId}/days/${dayId}/exercises/order`,
        method: "PUT",
        body: { ids: flatIds },
        label: "Exercise order",
      },
    );
    setSaving(false);
    if (ok) {
      toast.success("Exercise order saved", {
        description: `${day.name} · ${flatIds.length} exercises`,
      });
    }
    navigate(`/programs/${routineId}`);
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
              onClick={() => navigate(`/programs/${routineId}`)}
              aria-label="Back to program"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <ArrowDownUp className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
              <span className="min-w-0 truncate">
                Arrange{day ? ` · ${day.name}` : ""}
              </span>
            </span>
          }
          actions={
            <Button
              type="button"
              className="h-11 flex-none gap-1.5 px-4 text-sm font-bold"
              disabled={saving || !day || members.length < 2}
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
        {error || (!isLoading && !day) ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Day not found</p>
            <Button type="button" variant="outline" onClick={() => navigate(`/programs/${routineId}`)}>
              Back to program
            </Button>
          </div>
        ) : isLoading || !routine ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading day">
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-28 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-28 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : (day?.dayType ?? "WORKOUT") === "REST" ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Rest day</p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              Nothing to arrange — rest days carry no exercises.
            </p>
          </div>
        ) : members.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">No exercises in this day</p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              Add exercises from the day view first, then arrange them here.
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
