"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RoutineDetailScreen — the Part 3 rebuild of #/routines/{id}.
//
//   TopBar (56)  : back → #/routines | routine name (tap = inline rename,
//                  Enter saves / Esc cancels) | `Edit`⇄`Done` toggle | ⋮
//                  (Rename · Copy · Reorder days · Delete confirm)
//   SubBar (48)  : notes single line ellipsis — tap expands (read mode, max
//                  3 lines, tap again collapses); in edit mode the block below
//                  is an inline textarea (persist on blur). Hidden when empty
//                  and not editing.
//   ScrollBody   : DaySection×N accordion (mobile: one day open; ≥768: all
//                  open; animates grid-template-rows 0fr→1fr, never height).
//                  DayHeader 48px: chevron | day name (inline rename in edit
//                  mode) | `Log` 72px (read) or ⋮ 44px (edit: Rename · Move
//                  up/down · Delete confirm). Body: ExerciseCard×N template
//                  mode (blank cells ↺ = copy from last workout; set edits
//                  persist immediately). Edit mode adds drag-handle glyphs in
//                  card headers, `+ Add exercise to day` 40px ghost rows and a
//                  `+ Add day` 48px footer row.
//
// Edit mode is a whole-screen state. NO per-item edit dialogs — everything is
// inline. Dialogs: routine Delete + day Delete (confirm-destructive) only.
// Drag handles are rendered but DnD is NOT wired (reorder via ⋮ Move up/down).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody } from "@/components/layout";
import { Button } from "@/components/ui/button";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  Copy,
  Layers,
  MoreVertical,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { routinesApi } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import type { CardAction, CardSet, CardVisibleColumns } from "@/components/exercise-card/exercise-card";
import { ExerciseCard } from "@/components/exercise-card/exercise-card";
import { useViewportWidth } from "@/components/set-row/viewport";
import type { RoutineDayDTO, RoutineExerciseDTO } from "@/lib/types";
import {
  DragGlyph,
  InlineInput,
  cardPatchToPredefinedInput,
  cardSetsOf,
  errorMessage,
  nextDayName,
  toCardExercise,
  useDayReorder,
  useLastSetsPrefill,
  useRoutineRun,
} from "./screen-helpers";
import { cn } from "@/lib/utils";

/** ≥768px: every day section opens (tablet/desktop accordion rule). */
const WIDE_DAY_VIEWPORT = 768;

// ─────────────────────────────────────────────────────────────────────────────
// DaySection — one accordion section: header + 0fr→1fr animated body.
// The grid-TEMPLATE-ROWS animates (never height): opening reveals the mounted
// body smoothly; closing unmounts it instantly, so a collapsed section owns
// zero [data-row] elements (harness-safe) and nothing can ever overlap.
// ─────────────────────────────────────────────────────────────────────────────

function DaySection({ open, header, children }: { open: boolean; header: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-none flex-col overflow-hidden rounded-lg border bg-card">
      {header}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          {open ? children : null}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ExerciseNotesPopover — read-only exercise notes (anchored popover).
// ─────────────────────────────────────────────────────────────────────────────

function ExerciseNotesPopover({
  exerciseName,
  notes,
  open,
  onClose,
}: {
  exerciseName: string;
  notes: string | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        <span className="absolute bottom-2 left-2 h-1 w-1" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72"
        onOpenAutoFocus={(e) => e.preventDefault()}
        // The ⋮ menu closes by returning focus to its trigger; without this
        // the popover would be instantly dismissed (same Radix gotcha as the
        // Today card popovers). Pointer-outside + Escape still close.
        onFocusOutside={(e) => e.preventDefault()}
      >
        <p className="pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {exerciseName} — notes
        </p>
        <p className="text-sm leading-relaxed text-foreground">
          {notes && notes.trim().length > 0 ? notes : "No notes on this exercise."}
        </p>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RoutineDetailScreen — keyed by routineId so every local UI state (edit mode,
// open day, collapses, renames, notes draft) resets naturally on navigation.
// ─────────────────────────────────────────────────────────────────────────────

export default function RoutineDetailScreen({ routineId }: { routineId: string }) {
  return <RoutineDetailInner key={routineId} routineId={routineId} />;
}

function RoutineDetailInner({ routineId }: { routineId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const invalidate = useInvalidate();
  const online = useOnline();
  const { run } = useRoutineRun();
  const prefillFor = useLastSetsPrefill();

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

  // ---------- ui state ----------
  const vw = useViewportWidth();
  const isWide = vw >= WIDE_DAY_VIEWPORT;
  const [editing, setEditing] = useState(false);
  // undefined = follow the default (first day open); "" = all collapsed.
  const [openDayId, setOpenDayId] = useState<string | undefined>(undefined);
  const [collapsedReIds, setCollapsedReIds] = useState<Set<string>>(new Set());
  const [renamingRoutine, setRenamingRoutine] = useState(false);
  const [renamingDayId, setRenamingDayId] = useState<string | null>(null);
  const [deleteRoutineOpen, setDeleteRoutineOpen] = useState(false);
  const [deleteDay, setDeleteDay] = useState<RoutineDayDTO | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesReId, setNotesReId] = useState<string | null>(null);

  const effectiveOpen = (dayId: string) =>
    isWide ? true : (openDayId ?? days[0]?.id ?? "") === dayId;

  const toggleDay = (dayId: string) => {
    const current = openDayId ?? days[0]?.id ?? "";
    setOpenDayId(current === dayId ? "" : dayId);
  };

  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  // ---------- routine-level mutations ----------
  const renameRoutine = async (name: string) => {
    if (!routine || !name || name === routine.name) return;
    const ok = await run(() => routinesApi.update(routineId, { name }), {
      path: `/api/routines/${routineId}`,
      method: "PATCH",
      body: { name },
      label: "Routine renamed",
    });
    if (ok) toast.success("Routine renamed");
  };

  const saveNotes = async () => {
    if (!routine) return;
    const next = notesDraft.trim();
    if (next === (routine.notes ?? "")) return;
    const ok = await run(() => routinesApi.update(routineId, { notes: next || null }), {
      path: `/api/routines/${routineId}`,
      method: "PATCH",
      body: { notes: next || null },
      label: "Notes saved",
    });
    if (ok) toast.success("Notes saved");
  };

  const copyRoutine = async () => {
    if (!routine) return;
    const ok = await run(() => routinesApi.copy(routineId), {
      path: `/api/routines/${routineId}/copy`,
      method: "POST",
      label: "Duplicate routine",
    });
    if (ok) toast.success(`Duplicated “${routine.name}”`);
  };

  const removeRoutine = async () => {
    const ok = await run(() => routinesApi.remove(routineId), {
      path: `/api/routines/${routineId}`,
      method: "DELETE",
      label: `Deleted ${routine?.name ?? "routine"}`,
    });
    if (ok) {
      toast.success(`Deleted “${routine?.name ?? "routine"}”`);
      navigate("/routines");
    }
  };

  // ---------- day-level mutations ----------
  const renameDay = async (day: RoutineDayDTO, name: string) => {
    if (!name || name === day.name) return;
    const ok = await run(() => routinesApi.updateDay(routineId, day.id, { name }), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "PATCH",
      body: { name },
      label: "Day renamed",
    });
    if (ok) toast.success("Day renamed");
  };

  const removeDay = async (day: RoutineDayDTO) => {
    const ok = await run(() => routinesApi.removeDay(routineId, day.id), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "DELETE",
      label: `Deleted ${day.name}`,
    });
    if (ok) toast.success(`Deleted “${day.name}”`);
  };

  const reorderDay = useDayReorder(routineId);

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
      const created = [...updated.days].sort((a, b) => b.sortOrder - a.sortOrder).find((d) => !oldIds.has(d.id)) ?? null;
      if (created) {
        setOpenDayId(created.id);
        setRenamingDayId(created.id);
      }
      toast.success("Day added");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // ---------- card (template) mutations ----------
  const reorderExercises = async (dayId: string, ids: string[], reId: string, delta: -1 | 1) => {
    const i = ids.indexOf(reId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    await run(() => routinesApi.reorderExercises(routineId, dayId, next), {
      path: `/api/routines/${routineId}/days/${dayId}/exercises/order`,
      method: "PUT",
      body: { ids: next },
      label: "Exercise order",
    });
  };

  const patchPredefinedSet = async (
    day: RoutineDayDTO,
    re: RoutineExerciseDTO,
    setId: string,
    patch: Partial<CardSet>,
  ) => {
    const input = cardPatchToPredefinedInput(patch);
    if (Object.keys(input).length === 0) return; // note-only: predefined sets carry no comments
    await run(() => routinesApi.updateSet(routineId, day.id, re.id, setId, input), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}/sets/${setId}`,
      method: "PATCH",
      body: input,
      label: "Set updated",
    });
  };

  const removePredefinedSet = async (day: RoutineDayDTO, re: RoutineExerciseDTO, setId: string) => {
    await run(() => routinesApi.removeSet(routineId, day.id, re.id, setId), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}/sets/${setId}`,
      method: "DELETE",
      label: "Set removed",
    });
  };

  const addPredefinedSet = async (day: RoutineDayDTO, re: RoutineExerciseDTO) => {
    await run(() => routinesApi.addSet(routineId, day.id, re.id, {}), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}/sets`,
      method: "POST",
      body: {},
      label: "Set added",
    });
  };

  const copyLastToSet = async (day: RoutineDayDTO, re: RoutineExerciseDTO, setId: string) => {
    const sorted = [...re.sets].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((s) => s.id === setId);
    if (idx < 0) return;
    const src = await prefillFor(re.exerciseId, idx);
    if (!src) {
      toast.info("No previous workout to copy from");
      return;
    }
    await run(
      () =>
        routinesApi.updateSet(routineId, day.id, re.id, setId, {
          weight: src.weight,
          reps: src.reps,
          distance: src.distance,
          timeSec: src.timeSec,
        }),
      {
        path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}/sets/${setId}`,
        method: "PATCH",
        body: { weight: src.weight, reps: src.reps, distance: src.distance, timeSec: src.timeSec },
        label: "Copied from last workout",
      },
    );
    toast.success("Copied from last workout");
  };

  const removeRoutineExercise = async (day: RoutineDayDTO, re: RoutineExerciseDTO) => {
    await run(() => routinesApi.removeExercise(routineId, day.id, re.id), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}`,
      method: "DELETE",
      label: `Removed ${re.exercise.name}`,
    });
    toast.success(`${re.exercise.name} removed from day`);
  };

  // ---------- card action dispatch ----------
  const handleCardAction = (day: RoutineDayDTO, re: RoutineExerciseDTO) => (action: CardAction): void => {
    switch (action.type) {
      case "toggle-collapse":
        setCollapsedReIds((prev) => {
          const next = new Set(prev);
          if (next.has(re.id)) next.delete(re.id);
          else next.add(re.id);
          return next;
        });
        break;
      case "add-set":
        void addPredefinedSet(day, re);
        break;
      case "update-set":
        void patchPredefinedSet(day, re, action.setId, action.patch);
        break;
      case "remove-set":
        void removePredefinedSet(day, re, action.setId);
        break;
      case "copy-last":
        void copyLastToSet(day, re, action.setId);
        break;
      case "move-up":
      case "move-down": {
        const ids = [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder).map((e) => e.id);
        void reorderExercises(day.id, ids, re.id, action.type === "move-up" ? -1 : 1);
        break;
      }
      case "remove":
        void removeRoutineExercise(day, re);
        break;
      case "notes":
        setNotesReId(re.id);
        break;
      case "add-to-group":
        toast.info("Routine groups arrive with a later build");
        break;
      case "replace":
        toast.info("Replacing exercises in templates arrives with a later build");
        break;
      case "select":
        toast.info("Multi-select arrives with the next build");
        break;
      case "rest-timer":
        toast.info("The rest timer lives on the Today screen");
        break;
      case "toggle-done":
      case "toggle-select":
      case "open":
        break; // preview/edit-mode-only actions; never emitted by template cards
    }
  };

  // ---------- render helpers ----------
  const renderDayHeader = (day: RoutineDayDTO, index: number) => {
    const open = effectiveOpen(day.id);
    const renaming = editing && renamingDayId === day.id;
    return (
      <div data-row className="flex h-12 items-center gap-1 overflow-hidden whitespace-nowrap pl-2 pr-1">
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-6 flex-none p-0"
          onClick={() => toggleDay(day.id)}
          aria-label={open ? `Collapse ${day.name}` : `Expand ${day.name}`}
          aria-expanded={open}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open ? "" : "-rotate-90")}
            aria-hidden
          />
        </Button>
        {renaming ? (
          <InlineInput
            value={day.name}
            ariaLabel={`Rename ${day.name}`}
            onCommit={(name) => {
              setRenamingDayId(null);
              void renameDay(day, name);
            }}
            onCancel={() => setRenamingDayId(null)}
            className="h-10 min-w-0 flex-1"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{day.name}</span>
        )}
        {editing ? (
          <span className="flex flex-none">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-11 p-0"
                  aria-label={`Actions for ${day.name}`}
                >
                  <MoreVertical className="h-5 w-5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setRenamingDayId(day.id)}>
                  <Pencil className="h-4 w-4" aria-hidden /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem disabled={index === 0} onClick={() => void reorderDay(days, index, -1)}>
                  <ArrowUp className="h-4 w-4" aria-hidden /> Move up
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={index === days.length - 1}
                  onClick={() => void reorderDay(days, index, 1)}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden /> Move down
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteDay(day)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        ) : (
          <Button
            type="button"
            className="h-11 w-18 flex-none gap-1 px-0"
            aria-label={`Log ${day.name} to today`}
            onClick={() => navigate(`/routines/${routineId}/log/${day.id}`)}
          >
            <Zap className="h-4 w-4" aria-hidden />
            Log
          </Button>
        )}
      </div>
    );
  };

  const renderDayBody = (day: RoutineDayDTO) => {
    const exercises = [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder);
    return (
      <div className="flex flex-col gap-2 p-2">
        {exercises.map((re) => {
          const openNotes = notesReId === re.id;
          return (
            <div key={re.id} className="relative flex-none">
              <ExerciseCard
                mode="template"
                exercise={toCardExercise(re, settings)}
                sets={cardSetsOf(re)}
                collapsed={collapsedReIds.has(re.id)}
                visibleColumns={visibleColumns}
                headerLeading={editing ? <DragGlyph /> : undefined}
                onAction={handleCardAction(day, re)}
              />
              {openNotes ? (
                <ExerciseNotesPopover
                  exerciseName={re.exercise.name}
                  notes={re.exercise.notes ?? null}
                  open
                  onClose={() => setNotesReId(null)}
                />
              ) : null}
            </div>
          );
        })}
        {exercises.length === 0 ? (
          <p className="flex-none rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No exercises in this day yet.
          </p>
        ) : null}
        {editing ? (
          <button
            type="button"
            data-row
            className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40"
            onClick={() => navigate(`/exercises?context=routine&routineId=${routineId}&dayId=${day.id}`)}
          >
            <Plus className="h-4 w-4 flex-none" aria-hidden />
            Add exercise to day
          </button>
        ) : null}
      </div>
    );
  };

  const notesVisible = editing || !!(routine?.notes && routine.notes.trim().length > 0);

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
              onClick={() => navigate("/routines")}
              aria-label="Back to routines"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title={
            renamingRoutine || !routine ? (
              routine ? (
                <InlineInput
                  value={routine.name}
                  ariaLabel="Rename routine"
                  onCommit={(name) => {
                    setRenamingRoutine(false);
                    void renameRoutine(name);
                  }}
                  onCancel={() => setRenamingRoutine(false)}
                  className="h-11 min-w-0 w-full"
                />
              ) : (
                "Routine"
              )
            ) : (
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-base font-semibold leading-none"
                aria-label={`Rename ${routine.name}`}
                title="Tap to rename"
                onClick={() => setRenamingRoutine(true)}
              >
                {routine.name}
              </button>
            )
          }
          actions={
            routine ? (
              <>
                <Button
                  type="button"
                  variant={editing ? "default" : "outline"}
                  className="h-11 flex-none px-4"
                  aria-pressed={editing}
                  onClick={() => {
                    if (!editing) setNotesDraft(routine?.notes ?? ""); // draft starts from the saved notes
                    setEditing((e) => !e);
                  }}
                >
                  {editing ? "Done" : "Edit"}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 flex-none"
                      aria-label="More actions"
                    >
                      <MoreVertical className="h-5 w-5" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setRenamingRoutine(true)}>
                      <Pencil className="h-4 w-4" aria-hidden /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void copyRoutine()}>
                      <Copy className="h-4 w-4" aria-hidden /> Copy
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing(true);
                        toast.info("Edit mode on — use ⋮ on a day to move it up or down");
                      }}
                    >
                      <Layers className="h-4 w-4" aria-hidden /> Reorder days
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteRoutineOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : undefined
          }
        />
      }
      subBar={
        notesVisible ? (
          <SubBar>
            <button
              type="button"
              className="flex h-11 min-w-0 flex-1 items-center gap-2 text-left"
              aria-label={editing ? "Routine notes editor below" : "Expand routine notes"}
              aria-expanded={editing ? true : notesOpen}
              onClick={() => {
                if (!editing) setNotesOpen((o) => !o);
              }}
            >
              <StickyNote className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {editing
                  ? routine?.notes?.trim()
                    ? "Notes — editing below"
                    : "Tap the field below to add notes"
                  : routine?.notes}
              </span>
              {editing ? null : (
                <ChevronDown
                  className={`h-4 w-4 flex-none text-muted-foreground transition-transform ${notesOpen ? "" : "-rotate-90"}`}
                  aria-hidden
                />
              )}
            </button>
          </SubBar>
        ) : undefined
      }
    >
      <ScrollBody>
        {error ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Routine not found</p>
            <Button type="button" variant="outline" onClick={() => navigate("/routines")}>
              Back to routines
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading routine">
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : routine ? (
          <>
            {editing ? (
              <textarea
                aria-label="Routine notes"
                rows={3}
                value={notesDraft}
                placeholder="Notes for this routine (e.g. progression scheme, rest rules)…"
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={() => void saveNotes()}
                className="flex-none w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring/40"
              />
            ) : notesOpen && routine.notes ? (
              <p className="line-clamp-3 flex-none px-1 text-sm leading-relaxed text-muted-foreground">
                {routine.notes}
              </p>
            ) : null}

            {days.map((day, index) => (
              <DaySection key={day.id} open={effectiveOpen(day.id)} header={renderDayHeader(day, index)}>
                {renderDayBody(day)}
              </DaySection>
            ))}

            {days.length === 0 ? (
              <div className="flex h-[200px] flex-none flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
                <p className="text-sm font-semibold">No days yet</p>
                <p className="max-w-[280px] text-center text-xs text-muted-foreground">
                  Split this routine into training days, then log a whole day in one tap.
                </p>
                {editing ? (
                  <Button type="button" className="gap-1.5" onClick={() => void addDay()}>
                    <Plus className="h-4 w-4" aria-hidden /> Add first day
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      setEditing(true);
                      toast.info("Edit mode on — add your first day");
                    }}
                  >
                    <Pencil className="h-4 w-4" aria-hidden /> Edit routine
                  </Button>
                )}
              </div>
            ) : null}

            {editing ? (
              <button
                type="button"
                data-row
                className="flex h-12 w-full items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40"
                onClick={() => void addDay()}
              >
                <Plus className="h-4 w-4 flex-none" aria-hidden />
                Add day
              </button>
            ) : null}

            <div className="h-4 flex-none" aria-hidden />
          </>
        ) : null}
      </ScrollBody>

      {/* confirm-destructive: routine delete */}
      <AlertDialog open={deleteRoutineOpen} onOpenChange={(o) => !o && setDeleteRoutineOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete routine?</AlertDialogTitle>
            <AlertDialogDescription>
              “{routine?.name}” and its {days.length} day{days.length === 1 ? "" : "s"} will be removed. Logged
              workouts stay untouched. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setDeleteRoutineOpen(false);
                void removeRoutine();
              }}
            >
              Delete routine
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* confirm-destructive: day delete */}
      <AlertDialog open={deleteDay != null} onOpenChange={(o) => !o && setDeleteDay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete day?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteDay?.name}” and its {deleteDay?.exercises.length ?? 0} exercise
              {(deleteDay?.exercises.length ?? 0) === 1 ? "" : "s"} will be removed from this routine. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                const day = deleteDay;
                setDeleteDay(null);
                if (day) void removeDay(day);
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
