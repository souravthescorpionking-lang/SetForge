"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProgramEditorScreen — #/builder/program/{id} (Part 8 §3.8).
//
//   TopBar (56)  : BackButton → #/builder · program name · [Done] (validates
//                  the name → back to #/programs/{id}; every edit below
//                  already persisted immediately)
//   ScrollBody   : Name row 48 (inline input)
//                  Level row 48 (segmented Beginner/Intermediate/Advanced)
//                  Day accordion rows 56 (▾ chevron · `Day {n} {name}` · ⋮
//                  [Rename · Workout/Rest toggle · Delete] · ≡ drag handle —
//                  dnd-kit sortable days). Expanded body = EditorDayBody
//                  (GroupCards in edit mode + "+ Exercise | + Group").
//                  + Day row 48.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Check, ChevronDown, GripVertical, Loader2, Moon, MoreVertical, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { routinesApi } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty } from "@/lib/constants";
import type { RoutineDayDTO } from "@/lib/types";
import { errorMessage, nextDayName, useRoutineRun } from "@/features/routines/screen-helpers";
import {
  DaySection,
  EditorDayBody,
  InlineInput,
  kindSegment,
  useEditorSensors,
} from "./editor-shared";

/** Short segmented labels (spec ASCII: `Level Beg · (Int) · Adv`). */
const LEVEL_SHORT: Record<Difficulty, string> = {
  BEGINNER: "Beg",
  INTERMEDIATE: "Int",
  ADVANCED: "Adv",
};

export default function ProgramEditorScreen({ routineId }: { routineId: string }) {
  return <ProgramEditorInner key={routineId} routineId={routineId} />;
}

// ---------- screen ----------

function ProgramEditorInner({ routineId }: { routineId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const online = useOnline();
  const invalidate = useInvalidate();
  const { run } = useRoutineRun();
  const sensors = useEditorSensors();

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
  const kindSeg = routine ? kindSegment(routine) : "program";

  // ---------- ui state ----------
  const [openDayId, setOpenDayId] = useState<string | undefined>(undefined);
  const [renamingDayId, setRenamingDayId] = useState<string | null>(null);
  const [deleteDay, setDeleteDay] = useState<RoutineDayDTO | null>(null);
  const [savingDone, setSavingDone] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  // name input draft syncs from the server value once
  useEffect(() => {
    if (routine && nameDraft == null) setNameDraft(routine.name);
  }, [routine, nameDraft]);

  const defaultOpenDayId = days[0]?.id ?? "";
  const effectiveOpen = (dayId: string) => (openDayId ?? defaultOpenDayId) === dayId;
  const toggleDay = (dayId: string) => {
    const current = openDayId ?? defaultOpenDayId;
    setOpenDayId(current === dayId ? "" : dayId);
  };

  // ---------- routine-level mutations ----------
  const saveName = async () => {
    if (!routine || nameDraft == null) return;
    const name = nameDraft.trim();
    if (!name) {
      toast.info("Give the program a name");
      setNameDraft(routine.name);
      return;
    }
    if (name === routine.name) return;
    const ok = await run(() => routinesApi.update(routineId, { name }), {
      path: `/api/routines/${routineId}`,
      method: "PATCH",
      body: { name },
      label: "Name saved",
    });
    if (ok) toast.success("Name saved");
  };

  const saveLevel = async (difficulty: Difficulty) => {
    if (!routine || routine.difficulty === difficulty) return;
    const ok = await run(() => routinesApi.update(routineId, { difficulty }), {
      path: `/api/routines/${routineId}`,
      method: "PATCH",
      body: { difficulty },
      label: "Level saved",
    });
    if (ok) toast.success(`Level · ${DIFFICULTY_LABELS[difficulty]}`);
  };

  const done = () => {
    if (!routine) return;
    const name = (nameDraft ?? routine.name).trim();
    if (!name) {
      toast.info("Give the program a name before finishing");
      return;
    }
    setSavingDone(true);
    if (name !== routine.name) {
      void saveName().finally(() => {
        setSavingDone(false);
        navigate(`/programs/${routineId}`);
      });
      return;
    }
    setSavingDone(false);
    toast.success("Saved");
    navigate(`/programs/${routineId}`);
  };

  // ---------- day-level mutations ----------
  const renameDay = async (day: RoutineDayDTO, name: string) => {
    setRenamingDayId(null);
    if (!name || name === day.name) return;
    const ok = await run(() => routinesApi.updateDay(routineId, day.id, { name }), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "PATCH",
      body: { name },
      label: "Day renamed",
    });
    if (ok) toast.success("Day renamed");
  };

  const toggleDayType = async (day: RoutineDayDTO) => {
    const next = (day.dayType ?? "WORKOUT") === "REST" ? "WORKOUT" : "REST";
    const ok = await run(() => routinesApi.updateDay(routineId, day.id, { dayType: next }), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "PATCH",
      body: { dayType: next },
      label: "Day type changed",
    });
    if (ok) toast.success(`${day.name} → ${next === "REST" ? "rest day" : "workout day"}`);
  };

  const removeDay = async (day: RoutineDayDTO) => {
    const ok = await run(() => routinesApi.removeDay(routineId, day.id), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "DELETE",
      label: `Deleted ${day.name}`,
    });
    setDeleteDay(null);
    if (ok) toast.success(`Deleted “${day.name}”`);
  };

  const addDay = async () => {
    if (!routine) return;
    if (!online) {
      toast.info("Adding a day needs a connection");
      return;
    }
    try {
      const updated = await routinesApi.addDay(routineId, nextDayName(routine.days));
      invalidate.routines();
      const oldIds = new Set(routine.days.map((d) => d.id));
      const created =
        [...updated.days].sort((a, b) => b.sortOrder - a.sortOrder).find((d) => !oldIds.has(d.id)) ?? null;
      if (created) {
        setOpenDayId(created.id);
        setRenamingDayId(created.id);
      }
      toast.success("Day added");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // ---------- day drag reorder (persist the changed sortOrders) ----------
  const onDragEnd = (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = days.map((d) => d.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const next = arrayMove(days, oldIndex, newIndex);
    const persist = async () => {
      for (let i = 0; i < next.length; i++) {
        if (next[i].sortOrder === i) continue;
        const dayId = next[i].id;
        await run(() => routinesApi.updateDay(routineId, dayId, { sortOrder: i }), {
          path: `/api/routines/${routineId}/days/${dayId}`,
          method: "PATCH",
          body: { sortOrder: i },
          label: "Day order",
        });
      }
    };
    void persist();
  };

  // ---------- day header (56px accordion row) ----------
  const renderDayHeader = (day: RoutineDayDTO, index: number, handle: ReactNode) => {
    const open = effectiveOpen(day.id);
    const isRest = (day.dayType ?? "WORKOUT") === "REST";
    const renaming = renamingDayId === day.id;
    return (
      <div
        data-row
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`Day ${index + 1} ${day.name}`}
        {...tourAttrs({ id: "programEditor.dayRow", label: "Day row", help: "Open this day to edit its exercise groups.", order: 60 })}
        className="relative flex h-14 cursor-pointer select-none items-center gap-1 overflow-hidden whitespace-nowrap pl-2 pr-1 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => toggleDay(day.id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleDay(day.id);
          }
        }}
      >
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-6 flex-none p-0"
          aria-label={open ? `Collapse ${day.name}` : `Expand ${day.name}`}
          aria-expanded={open}
          tour={{ id: "programEditor.dayToggle", label: "Day chevron", help: "Expand or collapse this day.", order: 70 }}
          onClick={(e) => {
            e.stopPropagation();
            toggleDay(day.id);
          }}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open ? "" : "-rotate-90")} aria-hidden />
        </Button>
        <span className="w-14 flex-none text-xs font-semibold leading-none text-muted-foreground">
          Day {index + 1}
        </span>
        {renaming ? (
          <span
            className="flex min-w-0 flex-1 items-center"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <InlineInput
              value={day.name}
              onCommit={(name) => void renameDay(day, name)}
              onCancel={() => setRenamingDayId(null)}
              ariaLabel={`Rename ${day.name}`}
            />
          </span>
        ) : (
          <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold leading-none", isRest && "text-muted-foreground")}>
            {isRest ? <Moon className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden /> : null}
            {day.name}
          </span>
        )}
        {/* ⋮ day menu: Rename · Workout/Rest · Delete */}
        <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-11 p-0"
                aria-label={`Actions for ${day.name}`}
                tour={{ id: "programEditor.dayMenu", label: "Day menu", help: "Rename, switch workout/rest, or delete this day.", order: 80 }}
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setRenamingDayId(day.id)}>
                <Pencil className="h-4 w-4" aria-hidden /> Rename…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void toggleDayType(day)}>
                {isRest ? (
                  <Zap className="h-4 w-4" aria-hidden />
                ) : (
                  <Moon className="h-4 w-4" aria-hidden />
                )}
                {isRest ? "Make workout day" : "Make rest day"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteDay(day)}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Delete day…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
        {/* ≡ drag handle (dnd-kit listeners) */}
        {handle}
      </div>
    );
  };

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/builder" label="Back to Builder" />}
          title={routine ? routine.name : "Program editor"}
          actions={
            <>
              <Button
                type="button"
                className="h-11 flex-none gap-1.5 px-4 text-sm font-bold"
                disabled={!routine || savingDone}
                tour={{ id: "programEditor.done", label: "Done", help: "Finish editing and return to the program.", order: 10 }}
                onClick={done}
              >
                {savingDone ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                Done
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
    >
      <ScrollBody>
        {error ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Program not found</p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Error-state back link for a missing program" }}
              onClick={() => navigate("/builder")}
            >
              Back to Builder
            </Button>
          </div>
        ) : isLoading || !routine ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading program">
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : (
          <>
            {/* ---------- Name row 48px ---------- */}
            <div
              data-row
              {...tourAttrs({ id: "programEditor.name", label: "Name", help: "Rename this program; saved when you leave the field.", order: 20 })}
              className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3"
            >
              <span className="w-14 flex-none text-xs font-semibold text-muted-foreground">Name</span>
              <Input
                value={nameDraft ?? ""}
                maxLength={80}
                aria-label="Program name"
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                className="h-10 min-w-0 flex-1"
              />
            </div>

            {/* ---------- Level row 48px (segmented) ---------- */}
            <div
              data-row
              role="group"
              aria-label="Program level"
              {...tourAttrs({ id: "programEditor.level", label: "Level", help: "Beginner, intermediate or advanced — drives suggestions.", order: 30 })}
              className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3"
            >
              <span className="w-14 flex-none text-xs font-semibold text-muted-foreground">Level</span>
              <div className="flex h-10 min-w-0 flex-1 items-center gap-1">
                {DIFFICULTIES.map((d) => {
                  const active = (routine.difficulty ?? "BEGINNER") === d;
                  return (
                    <Button
                      key={d}
                      type="button"
                      variant={active ? "default" : "outline"}
                      aria-pressed={active}
                      tour={{ id: "programEditor.levelOption", label: "Level option", help: "Pick the program's training level.", order: 40 }}
                      className="h-10 min-w-0 flex-1 px-1 text-xs font-bold"
                      onClick={() => void saveLevel(d)}
                    >
                      <span className="truncate">{LEVEL_SHORT[d]}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* ---------- day accordion (dnd-kit sortable days) ---------- */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={days.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3">
                  {days.map((day, index) => (
                    <SortableDaySectionWrapper
                      key={day.id}
                      day={day}
                      index={index}
                      open={effectiveOpen(day.id)}
                      renderHeader={(handle) => renderDayHeader(day, index, handle)}
                    >
                      <EditorDayBody routineId={routineId} kindSeg={kindSeg} day={day} settings={settings} />
                    </SortableDaySectionWrapper>
                  ))}
                </div>
              </SortableContext>

              {/* ---------- + Day row 48px ---------- */}
              <button
                type="button"
                data-row
                {...tourAttrs({ id: "programEditor.addDay", label: "Add day", help: "Append another training day to this program.", order: 50 })}
                aria-label="Add a day"
                onClick={() => void addDay()}
                className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
              >
                <Plus className="h-4 w-4 flex-none" aria-hidden />
                Day
              </button>
            </DndContext>
          </>
        )}
      </ScrollBody>

      {/* destructive confirm: delete day */}
      <AlertDialog open={deleteDay != null} onOpenChange={(o) => !o && setDeleteDay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteDay?.name ?? "day"}?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteDay?.name}” and its {deleteDay?.exercises.length ?? 0} exercise
              {(deleteDay?.exercises.length ?? 0) === 1 ? "" : "s"} leave this program. Logged workouts stay
              untouched. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteDay) void removeDay(deleteDay);
              }}
            >
              Delete day
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}

// ---------- wrapper that owns the sortable handle node for a day ----------

function SortableDaySectionWrapper({
  day,
  index,
  open,
  renderHeader,
  children,
}: {
  day: RoutineDayDTO;
  index: number;
  open: boolean;
  renderHeader: (handle: ReactNode) => ReactNode;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: day.id,
    data: { type: "day", index },
  });
  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      {...tourAttrs({ id: "programEditor.dayDrag", label: "Day drag", help: "Drag to reorder the days of this program.", order: 90 })}
      aria-label={`Reorder ${day.name}`}
      className="flex h-11 w-11 flex-none touch-none items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
    >
      <GripVertical className="h-5 w-5" aria-hidden />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex-none", isDragging && "z-20 opacity-80")}
    >
      <DaySection open={open} header={renderHeader(handle)}>
        {children}
      </DaySection>
    </div>
  );
}
