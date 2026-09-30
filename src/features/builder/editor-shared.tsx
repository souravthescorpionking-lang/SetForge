"use client";

// ─────────────────────────────────────────────────────────────────────────────
// editor-shared.tsx — the machinery shared by the Part 8 §3.8 program + session
// editors (builder-program / builder-session screens).
//
//   · kindSegment(routine)             → "program" | "session" URL segment
//   · cardSetsOfFull(re)               → CardSet[] WITH §6.4 weightKind/pct
//   · isInteractiveTarget(target)      → did a click hit a real control?
//   · SortableGroupCard                → one dnd-kit sortable GROUP card
//                                         (mode="edit": drag handle on the
//                                         first member, ⋮ Edit sets/Remove,
//                                         card tap → sets editor)
//   · EditorDayBody                    → GroupCardStack of sortable group
//                                         cards + "+ Exercise | + Group" row
//   · GroupDialog                      → create / edit / dissolve a superset
//                                         group (member checklist)
//
// Every edit persists IMMEDIATELY (routinesApi + invalidate, same contract as
// the routines screens' editor machinery).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type ReactNode } from "react";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GripVertical, Link2, Plus, Trash2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { routinesApi } from "@/lib/client/api";
import { useInvalidate, useOnline } from "@/lib/client/query";
import { deriveGroups, memberCode, type DerivedGroup } from "@/lib/grouping";
import { GroupCard, GroupCardStack, toCardSet } from "@/components/group-card";
import type { CardAction, CardSet, CardVisibleColumns, GroupCardEntry } from "@/components/group-card";
import type { RoutineDayDTO, RoutineDTO, RoutineExerciseDTO, SettingsDTO } from "@/lib/types";
import { errorMessage, toCardExercise, useRoutineRun } from "@/features/routines/screen-helpers";
import { tourAttrs } from "@/lib/tour/attrs";

// ---------- small helpers ----------

/** URL segment for builder routes ("program" | "session") from the routine kind. */
export function kindSegment(routine: Pick<RoutineDTO, "kind">): "program" | "session" {
  return routine.kind === "SESSION" ? "session" : "program";
}

/** CardSet[] from a routine exercise's predefined sets, KEEPING §6.4 weightKind/pct. */
export function cardSetsOfFull(re: RoutineExerciseDTO): CardSet[] {
  return [...re.sets]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s, i) => toCardSet(s, i + 1));
}

/** Long-press/tap guard: did the event land on an inner interactive control? */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("button, a, input, textarea, [role='menuitem']");
}

/** Sensors for the editors' DndContext (4px move threshold — taps stay taps). */
export function useEditorSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

export function visibleColumnsOf(settings: SettingsDTO | null | undefined): CardVisibleColumns {
  return {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SortableGroupCard — one superset group (or singleton) as a dnd-kit sortable
// item rendered through GroupCard mode="edit".
// ─────────────────────────────────────────────────────────────────────────────

export type RemoveRequest = (re: RoutineExerciseDTO) => void;

function SortableGroupCard({
  routineId,
  kindSeg,
  dayId,
  group,
  settings,
  onRemoveRequest,
}: {
  routineId: string;
  kindSeg: "program" | "session";
  dayId: string;
  group: DerivedGroup<RoutineExerciseDTO>;
  settings: SettingsDTO | null | undefined;
  onRemoveRequest: RemoveRequest;
}) {
  const navigate = useApp((s) => s.navigate);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `g:${group.key}`,
    data: { type: "exercise-group", dayId },
  });

  const firstRe = group.members[0];
  const dragHandle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      {...tourAttrs({ id: "programEditor.dragHandle", label: "Drag handle", help: "Drag to move this exercise or group.", order: 90 })}
      aria-label={`Reorder ${firstRe?.exercise.name ?? "exercise"}`}
      className="flex h-8 w-11 touch-none items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );

  const entries: GroupCardEntry[] = group.members.map((re, i) => ({
    exercise: toCardExercise(re, settings),
    sets: cardSetsOfFull(re),
    code: group.size > 1 ? memberCode(group.code, i) : group.code,
    ...(i === 0 ? { dragHandle } : {}),
  }));

  const onAction = (action: CardAction, entryIndex: number): void => {
    const re = group.members[entryIndex];
    if (!re) return;
    switch (action.type) {
      case "edit-sets":
        navigate(`/builder/${kindSeg}/${routineId}/exercise/${re.id}`);
        break;
      case "detail":
      case "history":
      case "graph":
      case "records":
        navigate(`/exercise-overview/${re.exerciseId}`);
        break;
      case "remove":
        onRemoveRequest(re);
        break;
      default:
        break;
    }
  };

  const openSets = () => {
    if (firstRe) navigate(`/builder/${kindSeg}/${routineId}/exercise/${firstRe.id}`);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative flex-none", isDragging && "z-20 opacity-80")}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Edit sets for ${firstRe?.exercise.name ?? "exercise"}`}
        onClick={(e) => {
          // §3.8: tapping the card (its reps row) opens the sets editor —
          // inner controls (⋮, drag handle, rest toggle) keep their events.
          if (!isInteractiveTarget(e.target)) openSets();
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openSets();
          }
        }}
      >
        <GroupCard
          mode="edit"
          group={{ code: group.code, label: group.label }}
          entries={entries}
          visibleColumns={visibleColumnsOf(settings)}
          onAction={onAction}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GroupDialog — create a new superset group (preselects the day's last
// exercise) or edit/dissolve an existing one. Members persist via
// routinesApi.updateExercise({ groupId }) diffs.
// ─────────────────────────────────────────────────────────────────────────────

function GroupDialog({
  open,
  onOpenChange,
  routineId,
  day,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routineId: string;
  day: RoutineDayDTO;
  groups: Array<DerivedGroup<RoutineExerciseDTO>>;
}) {
  const online = useOnline();
  const invalidate = useInvalidate();
  const exercises = useMemo(
    () => [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder),
    [day],
  );
  const namedGroups = useMemo(() => groups.filter((g) => g.groupId != null), [groups]);

  const [target, setTarget] = useState<string>("new");
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const seedFor = (t: string): Set<string> => {
    if (t === "new") {
      // §3.8: new groups start from the day's LAST exercise.
      const last = exercises[exercises.length - 1];
      return new Set(last ? [last.id] : []);
    }
    return new Set(exercises.filter((e) => e.groupId === t).map((e) => e.id));
  };

  const openFor = (t: string) => {
    setTarget(t);
    setMembers(seedFor(t));
  };

  const toggleMember = (id: string) => {
    setMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (busy) return;
    if (!online) {
      toast.info("Editing groups needs a connection");
      return;
    }
    if (members.size === 0) {
      toast.info("Pick at least one exercise for the group");
      return;
    }
    setBusy(true);
    try {
      const ids = [...members];
      if (target === "new") {
        const res = await routinesApi.addGroup(routineId, { assignReId: ids[0] });
        for (const id of ids.slice(1)) {
          await routinesApi.updateExercise(routineId, day.id, id, { groupId: res.groupId });
        }
        toast.success(`Superset created · ${ids.length} exercise${ids.length === 1 ? "" : "s"}`);
      } else {
        const current = new Set(exercises.filter((e) => e.groupId === target).map((e) => e.id));
        let changed = 0;
        for (const id of ids) {
          if (!current.has(id)) {
            await routinesApi.updateExercise(routineId, day.id, id, { groupId: target });
            changed++;
          }
        }
        for (const id of current) {
          if (!members.has(id)) {
            await routinesApi.updateExercise(routineId, day.id, id, { groupId: null });
            changed++;
          }
        }
        toast.success(changed > 0 ? "Group updated" : "No changes");
      }
      invalidate.routines();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const dissolve = async () => {
    if (busy || target === "new") return;
    if (!online) {
      toast.info("Dissolving a group needs a connection");
      return;
    }
    setBusy(true);
    try {
      await routinesApi.removeGroup(routineId, target);
      invalidate.routines();
      toast.success("Group dissolved — exercises kept, now ungrouped");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) openFor(target);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Superset group</DialogTitle>
          <DialogDescription>
            Grouped exercises run back-to-back as a superset (A1, A2…).
          </DialogDescription>
        </DialogHeader>

        {exercises.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add an exercise to this day first.</p>
        ) : (
          <>
            {namedGroups.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant={target === "new" ? "default" : "outline"}
                  size="sm"
                  tour={{ id: "programEditor.newGroupChip", label: "New group", help: "Start a brand-new superset group.", order: 100 }}
                  className="h-8 rounded-lg px-3 text-xs font-bold"
                  onClick={() => openFor("new")}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden /> New
                </Button>
                {namedGroups.map((g) => (
                  <Button
                    key={g.key}
                    type="button"
                    variant={target === g.groupId ? "default" : "outline"}
                    size="sm"
                    tour={{ skipTour: true, reason: "Existing-group chip inside the group dialog" }}
                    className="h-8 rounded-lg px-3 text-xs font-bold"
                    onClick={() => openFor(g.groupId!)}
                  >
                    <Link2 className="h-3.5 w-3.5" aria-hidden /> {g.code}
                  </Button>
                ))}
              </div>
            ) : null}

            <div
              role="group"
              aria-label="Group members"
              className="scroll-slim flex max-h-64 flex-col gap-1 overflow-y-auto"
            >
              {exercises.map((re) => {
                const checked = members.has(re.id);
                return (
                  <label
                    key={re.id}
                    className="flex h-12 flex-none cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-accent/40"
                  >
                    <Checkbox
                      checked={checked}
                      {...tourAttrs({ skipTour: true, reason: "Member checkbox inside the group dialog" })}
                      onCheckedChange={() => toggleMember(re.id)}
                      aria-label={`Include ${re.exercise.name}`}
                    />
                    <span className="min-w-0 flex-1 truncate">{re.exercise.name}</span>
                    {re.groupId && re.groupId !== target ? (
                      <span className="flex-none text-[10px] font-bold uppercase text-muted-foreground">grouped</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </>
        )}

        <DialogFooter className="gap-2">
          {target !== "new" ? (
            <Button
              type="button"
              variant="outline"
              tour={{ id: "programEditor.dissolveGroup", label: "Dissolve", help: "Remove the group; its exercises stay, ungrouped.", order: 110 }}
              disabled={busy}
              onClick={() => void dissolve()}
              className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Unlink className="h-4 w-4" aria-hidden /> Dissolve
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            tour={{ skipTour: true, reason: "Cancel inside the group dialog" }}
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            tour={{ id: "programEditor.saveGroup", label: "Save group", help: "Save the superset membership.", order: 120 }}
            disabled={busy || exercises.length === 0}
            onClick={() => void save()}
          >
            Save group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EditorDayBody — the expanded-day content of BOTH editors:
//   · rest days render a muted note row
//   · workout days render the sortable GroupCardStack + destructive-remove
//     confirm + the 40px "+ Exercise | + Group" row
// ─────────────────────────────────────────────────────────────────────────────

export function EditorDayBody({
  routineId,
  kindSeg,
  day,
  settings,
}: {
  routineId: string;
  kindSeg: "program" | "session";
  day: RoutineDayDTO;
  settings: SettingsDTO | null | undefined;
}) {
  const navigate = useApp((s) => s.navigate);
  const online = useOnline();
  const invalidate = useInvalidate();
  const { run } = useRoutineRun();
  const sensors = useEditorSensors();

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [removeRe, setRemoveRe] = useState<RoutineExerciseDTO | null>(null);

  const exercises = useMemo(
    () => [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder),
    [day],
  );
  const groups = useMemo(() => deriveGroups(exercises), [exercises]);

  // ---- drag reorder: groups move as units → flat PUT of the new order ----
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = groups.map((g) => `g:${g.key}`);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const nextGroups = arrayMove(groups, oldIndex, newIndex);
    const flatIds = nextGroups.flatMap((g) => g.members.map((m) => m.id));
    void run(() => routinesApi.reorderExercises(routineId, day.id, flatIds), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/order`,
      method: "PUT",
      body: { ids: flatIds },
      label: "Exercise order",
    });
  };

  const removeExercise = async (re: RoutineExerciseDTO) => {
    await run(() => routinesApi.removeExercise(routineId, day.id, re.id), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}`,
      method: "DELETE",
      label: `Removed ${re.exercise.name}`,
    });
    setRemoveRe(null);
    toast.success(`${re.exercise.name} removed`);
  };

  if ((day.dayType ?? "WORKOUT") === "REST") {
    return (
      <div
        data-row
        className="flex h-10 items-center overflow-hidden whitespace-nowrap px-3 text-sm text-muted-foreground"
      >
        Rest day — nothing to build
      </div>
    );
  }

  return (
    <div className="flex-none p-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={groups.map((g) => `g:${g.key}`)}
          strategy={verticalListSortingStrategy}
        >
          <GroupCardStack>
            {groups.map((g) => (
              <SortableGroupCard
                key={g.key}
                routineId={routineId}
                kindSeg={kindSeg}
                dayId={day.id}
                group={g}
                settings={settings}
                onRemoveRequest={setRemoveRe}
              />
            ))}
          </GroupCardStack>
        </SortableContext>
      </DndContext>

      {exercises.length === 0 ? (
        <p className="flex-none rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No exercises in this day yet — add the first one below.
        </p>
      ) : null}

      {/* 40px row: + Exercise · + Group */}
      <div data-row className="mt-2 flex h-10 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap">
        <button
          type="button"
          {...tourAttrs({ id: "programEditor.addExercise", label: "Add exercise", help: "Pick exercises from the library for this day.", order: 130 })}
          aria-label="Add exercise to this day"
          onClick={() =>
            navigate(`/exercises?context=routine&routineId=${routineId}&dayId=${day.id}&multi=1`)
          }
          className="flex h-10 min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
        >
          <Plus className="h-4 w-4 flex-none" aria-hidden />
          <span className="truncate">Exercise</span>
        </button>
        <button
          type="button"
          {...tourAttrs({ id: "programEditor.addGroup", label: "Add group", help: "Superset exercises together, or edit an existing group.", order: 140 })}
          aria-label="Add a superset group"
          onClick={() => setGroupDialogOpen(true)}
          className="flex h-10 min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
        >
          <Link2 className="h-4 w-4 flex-none" aria-hidden />
          <span className="truncate">Group</span>
        </button>
      </div>

      <GroupDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        routineId={routineId}
        day={day}
        groups={groups}
      />

      {/* destructive confirm: remove exercise from the day */}
      <AlertDialog open={removeRe != null} onOpenChange={(o) => !o && setRemoveRe(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeRe?.exercise.name ?? "exercise"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {removeRe?.sets.length ?? 0} predefined set{(removeRe?.sets.length ?? 0) === 1 ? "" : "s"} leave this
              template. Logged workouts stay untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (removeRe) void removeExercise(removeRe);
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DaySection — one accordion section: header + 0fr→1fr animated body (the
// routine-detail screen's pattern: closing unmounts the body so a collapsed
// section owns zero [data-row] elements).
// ─────────────────────────────────────────────────────────────────────────────

export function DaySection({ open, header, children }: { open: boolean; header: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-none flex-col overflow-hidden rounded-lg border bg-card">
      {header}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">{open ? children : null}</div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// createSessionDay — ensure a SESSION-kind routine owns exactly one workout
// day (the day-create endpoint refuses SESSION-kind routines, so the kind is
// flipped ROUTINE → add day → SESSION, validated server-side).
// ─────────────────────────────────────────────────────────────────────────────

export async function ensureSessionDay(routineId: string): Promise<boolean> {
  const routine = await routinesApi.get(routineId);
  const workoutDay = routine.days.find((d) => (d.dayType ?? "WORKOUT") !== "REST");
  if (workoutDay) return true;
  if (routine.kind === "SESSION") {
    await routinesApi.update(routineId, { kind: "ROUTINE" });
    await routinesApi.addDay(routineId, "Workout", "WORKOUT");
    await routinesApi.update(routineId, { kind: "SESSION" });
  } else {
    await routinesApi.addDay(routineId, "Workout", "WORKOUT");
  }
  return true;
}

// re-exported for the editors' inline renames
export { InlineInput } from "@/features/routines/screen-helpers";
