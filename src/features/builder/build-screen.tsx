"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildWorkoutScreen — §4.2 "Build workout" (#/builder/session/new AND the
// evolved #/builder/session/{id} edit screen).
//
//   TopBar (56)   : Cancel (leave-guarded) · "Build workout" · Save
//   ScrollBody    : Row 56 name input · Row 48 difficulty segmented
//                   · Row 48 Duration (numeric + "min" + Estimate) · series
//                   list = GroupCards mode="edit" whose entries carry the §4.5
//                   ExerciseEditor block (entry.editor — L2 extension, never a
//                   fork) + drag handles + the §4.7 … menu
//                   · Empty: "Add your first exercise." (96px block)
//   BottomBar (56): "+ Add exercise" → #/builder/session/{id|new}/add?series=new
//
// TWO models, ONE screen (task instruction: match the editor's semantics):
//   · `new`  — a pure client DRAFT (draft-store.ts); nothing persists until
//     Save, Cancel discards through the §4.8 guard.
//   · `{id}` — the existing session editor evolved in place: per-exercise edits
//     persist IMMEDIATELY through the same routines APIs the sets editor uses;
//     the header fields (name/difficulty/duration) save on Save; the guard
//     covers them.
//
// Save (§4.9) creates/updates Routine(kind=SESSION, source=CUSTOM) + its single
// RoutineDay through the EXISTING routine-service paths, derives muscles
// (union of primaryMuscles) + equipment (union) + estMinutes when empty, toasts
// "Saved to your workouts" and navigates → #/days/{dayId}.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Screen, TopBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ArrowDownUp, Check, GripVertical, Info, Loader2, PencilRuler, Plus, Replace, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { routinesApi, type PredefinedSetInput } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { deriveGroups, memberCode, type DerivedGroup } from "@/lib/grouping";
import { GroupCard, GroupCardStack, toCardSet, type CardAction, type GroupCardEntry, type GroupMenuItem } from "@/components/group-card";
import { EST_MINUTES_DEFAULT_REST_SEC, EST_MINUTES_PER_SET_SEC, tempoTotalSec, type Difficulty } from "@/lib/constants";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { errorMessage, useRoutineRun } from "@/features/routines/screen-helpers";
import { ensureSessionDay } from "./editor-shared";
import { ExerciseEditor, type EditorExerciseView, type ExerciseEditorController } from "./exercise-editor";
import { useBuilderDraft, type DraftExercise } from "./draft-store";
import type { RoutineDayDTO, RoutineExerciseDTO } from "@/lib/types";

// ---------- pure helpers ----------

type SetLike = { tempo?: string | null; restPlannedSec?: number | null };
type ExerciseLike = { sets: SetLike[]; restNone?: boolean | null };

/** §4.2 Estimate: Σ per set (tempo total + planned rest) rounded to 5 —
 *  unset tempo falls back to the repo's avg-set constant, unset rest to the
 *  default rest (0 when restNone). */
export function estimateMinutes(exercises: ExerciseLike[]): number {
  let sec = 0;
  for (const ex of exercises) {
    for (const s of ex.sets) {
      sec += tempoTotalSec(s.tempo ?? "") ?? EST_MINUTES_PER_SET_SEC;
      sec += s.restPlannedSec ?? (ex.restNone ? 0 : EST_MINUTES_DEFAULT_REST_SEC);
    }
  }
  return Math.min(300, Math.max(5, Math.round(sec / 60 / 5) * 5));
}

const DIFF_SEGMENTS: Array<{ value: Difficulty; label: string }> = [
  { value: "BEGINNER", label: "Beg" },
  { value: "INTERMEDIATE", label: "Int" },
  { value: "ADVANCED", label: "Adv" },
];

// ---------- §4.5 editor views ----------

/** Persisted RoutineExercise → the editor view shape. */
function viewOfRe(re: RoutineExerciseDTO): EditorExerciseView {
  return {
    id: re.id,
    name: re.exercise.name,
    modality: re.exercise.type,
    unit: re.exercise.weightUnit ?? null,
    categoryLabel: re.exercise.category?.name ?? "Exercise",
    categoryColour: re.exercise.category?.colour ?? "#f97316",
    groupId: re.groupId ?? null,
    tip: re.tip ?? null,
    restNone: re.restNone ?? false,
    sets: [...re.sets]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({
        id: s.id,
        reps: s.reps ?? null,
        setType: s.setType ?? null,
        restPlannedSec: s.restPlannedSec ?? null,
        tempo: s.tempo ?? null,
      })),
  };
}

/** DraftExercise → the editor view shape. */
function viewOfDraft(e: DraftExercise): EditorExerciseView {
  return {
    id: e.id,
    name: e.exercise.name,
    modality: e.exercise.type,
    unit: e.exercise.weightUnit ?? null,
    categoryLabel: e.exercise.category?.name ?? "Exercise",
    categoryColour: e.exercise.category?.colour ?? "#f97316",
    groupId: e.groupId,
    tip: e.tip,
    restNone: e.restNone,
    sets: e.sets.map((s) => ({
      id: s.id,
      reps: s.reps,
      setType: s.setType,
      restPlannedSec: s.restPlannedSec,
      tempo: s.tempo,
    })),
  };
}

/** §4.8: reps are required per set — number ≥ 1, or the set is AMRAP. */
function invalidSetIdsOf(view: EditorExerciseView): Set<string> {
  const out = new Set<string>();
  for (const s of view.sets) {
    if (s.setType !== "AMRAP" && (s.reps == null || s.reps < 1)) out.add(s.id);
  }
  return out;
}

// ---------- one sortable series card (composes THE GroupCard — never forks) ----------

type EditorRefMap = Map<string, React.RefObject<HTMLDivElement | null>>;

function SortableSeriesCard({
  group,
  controllerFor,
  persisted,
  invalidSets,
  editorRefs,
  onMenuAction,
}: {
  group: DerivedGroup<EditorExerciseView>;
  /** Resolves the per-entry controller (each editor owns its exercise). */
  controllerFor: (view: EditorExerciseView) => ExerciseEditorController;
  /** Persisted context (null in draft mode) — drives §4.7 menu items + routes. */
  persisted: { routineId: string; dayId: string } | null;
  invalidSets: Map<string, Set<string>>;
  editorRefs: EditorRefMap;
  onMenuAction: (action: CardAction, entryIndex: number, group: DerivedGroup<EditorExerciseView>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `g:${group.key}`,
  });

  const first = group.members[0];
  const dragHandle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      {...tourAttrs({ id: "build.dragHandle", label: "Drag handle", help: "Drag to move this series.", order: 90 })}
      aria-label={`Reorder ${first?.name ?? "series"}`}
      className="flex h-8 w-11 touch-none items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );

  // §4.7 … menu — screen-provided items REPLACE the GroupCard defaults. The
  // "Add exercise to this series" item is hidden when the series is full (4).
  // (Built with explicit GroupMenuItem typing: spread-of-conditional array
  // literals lose the CardAction discriminant to `string` widening.)
  const menu: GroupMenuItem[] = [
    { icon: PencilRuler, label: "Edit sets", action: { type: "edit-sets", exerciseId: "" } },
    { icon: Info, label: "Exercise info", action: { type: "detail", exerciseId: "" } },
    { icon: Trash2, label: "Remove exercise", action: { type: "remove" }, destructive: true },
    { icon: Trash2, label: "Remove series", action: { type: "remove-series" }, destructive: true },
  ];
  if (persisted) {
    menu.unshift(
      { icon: ArrowDownUp, label: "Rearrange series", action: { type: "rearrange-series" } },
      { icon: Replace, label: "Replace exercise", action: { type: "replace" } },
    );
  }
  if (group.size < 4) {
    menu.unshift({ icon: Plus, label: "Add exercise to this series", action: { type: "add-to-series" } });
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative flex-none", isDragging && "z-20 opacity-80")}
    >
      <GroupCard
        mode="edit"
        group={{ code: group.code, label: group.label }}
        menuItems={menu}
        onAction={(action, entryIndex) => onMenuAction(action, entryIndex, group)}
        entries={group.members.map((view, i): GroupCardEntry => {
          const ref = editorRefs.get(view.id) ?? { current: null };
          return {
            exercise: {
              id: view.id,
              name: view.name,
              categoryLabel: view.categoryLabel,
              categoryColour: view.categoryColour,
              modality: view.modality,
              unit: view.unit,
            },
            sets: view.sets.map((s, idx) => toCardSet(s, idx + 1)),
            code: group.size > 1 ? memberCode(group.code, i) : group.code,
            restNone: view.restNone,
            // L2: the §4.5 editor rides the entry.editor slot (it replaces the
            // default reps/tempo/rest body — tip included — for this entry).
            editor: (
              <ExerciseEditor
                view={view}
                controller={controllerFor(view)}
                routineId={persisted?.routineId ?? null}
                dayId={persisted?.dayId ?? null}
                invalidSetIds={invalidSets.get(view.id) ?? new Set<string>()}
                bodyRef={ref}
              />
            ),
            ...(i === 0 ? { dragHandle } : {}),
          };
        })}
      />
    </div>
  );
}

// ---------- the screen ----------

export default function BuildWorkoutScreen({ routineId }: { routineId: string | "new" }) {
  return <BuildWorkoutInner key={routineId} routineId={routineId} />;
}

function BuildWorkoutInner({ routineId }: { routineId: string | "new" }) {
  const navigate = useApp((s) => s.navigate);
  const user = useApp((s) => s.session?.user ?? null);
  const online = useOnline();
  const invalidate = useInvalidate();
  const { run } = useRoutineRun();
  const draftStore = useBuilderDraft();
  const isDraft = routineId === "new";

  // ---------- data (edit mode) ----------
  const { data: routine, isLoading } = useQuery({
    queryKey: qk.routine(isDraft ? "draft-new" : routineId),
    queryFn: () => routinesApi.get(routineId),
    enabled: !isDraft,
    retry: 1,
  });

  const day: RoutineDayDTO | null = useMemo(() => {
    if (isDraft) return null;
    const days = routine ? [...routine.days].sort((a, b) => a.sortOrder - b.sortOrder) : [];
    return days.find((d) => (d.dayType ?? "WORKOUT") !== "REST") ?? null;
  }, [routine, isDraft]);

  // Auto-create the implicit day for legacy sessions (the existing pattern).
  const [ensuring, setEnsuring] = useState(false);
  useEffect(() => {
    if (isDraft || !routine || day || ensuring || !online) return;
    setEnsuring(true);
    void ensureSessionDay(routineId)
      .then(() => invalidate.routines())
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => setEnsuring(false));
  }, [isDraft, routine, day, ensuring, online, routineId, invalidate]);

  // ---------- draft lifecycle (new mode) ----------
  const defaultDifficulty = (user?.difficulty ?? "INTERMEDIATE") as Difficulty;
  const beginRef = useRef(false);
  useEffect(() => {
    if (isDraft && !beginRef.current && !draftStore.draft) {
      beginRef.current = true;
      draftStore.begin({ difficulty: defaultDifficulty });
    }
  }, [isDraft, draftStore, defaultDifficulty]);
  const draft = draftStore.draft;

  // ---------- header field drafts (both modes) ----------
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [difficultyDraft, setDifficultyDraft] = useState<Difficulty | null>(null);
  const [minutesDraft, setMinutesDraft] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const serverName = isDraft ? "" : (routine?.name ?? "");
  const serverDifficulty = isDraft ? defaultDifficulty : ((routine?.difficulty ?? defaultDifficulty) as Difficulty);
  const serverMinutes = isDraft ? null : (day?.estMinutes ?? routine?.estMinutes ?? null);

  const name = nameDraft ?? (isDraft ? (draft?.name ?? "") : serverName);
  const difficulty = difficultyDraft ?? (isDraft ? (draft?.difficulty ?? defaultDifficulty) : serverDifficulty);
  const minutesRaw = minutesDraft ?? (serverMinutes != null ? String(serverMinutes) : "");
  const minutes = minutesRaw.trim() === "" ? null : Number(minutesRaw);

  // ---------- the active exercise list (draft store | server day) ----------
  const draftExercises = draft?.exercises ?? [];
  const serverExercises = useMemo(
    () => (day ? [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [day],
  );

  const views: EditorExerciseView[] = useMemo(
    () => (isDraft ? draftExercises.map(viewOfDraft) : serverExercises.map(viewOfRe)),
    [isDraft, draftExercises, serverExercises],
  );

  const series = useMemo(
    () => deriveGroups(views.map((v, i) => ({ ...v, sortOrder: i }))),
    [views],
  );

  // ---------- §4.8 validation ----------
  const nameError = name.trim() === "";
  const minutesError = minutes != null && (!Number.isFinite(minutes) || minutes < 5 || minutes > 300);
  const noExercises = views.length === 0;
  const invalidSetsByExercise = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const v of views) {
      const bad = invalidSetIdsOf(v);
      if (bad.size > 0) m.set(v.id, bad);
    }
    return m;
  }, [views]);
  const hasSetErrors = [...invalidSetsByExercise.values()].some((s) => s.size > 0);

  // Refs for the Save-scrolls-to-first-error rule (§4.8) — a STABLE map so the
  // ExerciseEditor roots keep their attachments across re-renders.
  const nameRowRef = useRef<HTMLDivElement>(null);
  const durationRowRef = useRef<HTMLDivElement>(null);
  const editorRefs = useRef<EditorRefMap>(new Map());
  const refFor = (id: string): React.RefObject<HTMLDivElement | null> => {
    let r = editorRefs.current.get(id);
    if (!r) {
      r = { current: null };
      editorRefs.current.set(id, r);
    }
    return r;
  };
  const scrollToEditor = (id: string) => {
    refFor(id).current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // ---------- dirty + leave guard ----------
  const dirty = isDraft
    ? (draft != null &&
        (draft.name !== "" || draft.exercises.length > 0 || draft.difficulty !== defaultDifficulty || draft.minutes != null))
    : (nameDraft != null && nameDraft.trim() !== serverName.trim()) ||
      (difficultyDraft != null && difficultyDraft !== serverDifficulty) ||
      (minutesDraft != null && minutesDraft !== (serverMinutes != null ? String(serverMinutes) : ""));
  const guard = useUnsavedGuard(dirty);

  const cancel = () =>
    guard.requestLeave(() => {
      if (isDraft) draftStore.reset();
      if (window.history.length > 1) window.history.back();
      else navigate("/builder");
    });

  // ---------- §4.7 … menu actions ----------
  const [removeSeries, setRemoveSeries] = useState<DerivedGroup<EditorExerciseView> | null>(null);

  const handleMenuAction = (
    action: CardAction,
    entryIndex: number,
    group: DerivedGroup<EditorExerciseView>,
  ) => {
    const view = group.members[entryIndex];
    if (!view) return;
    switch (action.type) {
      case "rearrange-series":
        if (day) navigate(`/days/${day.id}/rearrange`);
        break;
      case "add-to-series":
        if (group.size < 4) {
          navigate(`/builder/session/${routineId}/add?series=${encodeURIComponent(group.groupId ?? view.id)}`);
        }
        break;
      case "replace":
        if (day) navigate(`/days/${day.id}/replace/${view.id}`);
        break;
      case "edit-sets":
        scrollToEditor(view.id);
        break;
      case "detail": {
        const ex = isDraft
          ? draftExercises.find((e) => e.id === view.id)
          : serverExercises.find((e) => e.id === view.id);
        if (ex) navigate(`/exercise-overview/${ex.exerciseId}`);
        break;
      }
      case "remove":
        if (group.size > 1) void removeExerciseWithUndo(view, group);
        else setRemoveSeries(group);
        break;
      case "remove-series":
        setRemoveSeries(group);
        break;
      default:
        break;
    }
  };

  /** §4.7 Remove exercise — instant + 5s Undo toast (draft revert / re-add API). */
  const removeExerciseWithUndo = async (view: EditorExerciseView, group: DerivedGroup<EditorExerciseView>) => {
    void group;
    if (isDraft) {
      const index = draftExercises.findIndex((e) => e.id === view.id);
      const snapshot = draftExercises[index];
      if (!snapshot) return;
      draftStore.removeExercise(view.id);
      toast.success(`${view.name} removed`, {
        duration: 5000,
        action: { label: "Undo", onClick: () => draftStore.restoreExercise(snapshot, index) },
      });
      return;
    }
    if (!day) return;
    const re = serverExercises.find((e) => e.id === view.id);
    if (!re) return;
    const flatIndex = serverExercises.findIndex((e) => e.id === view.id);
    const ok = await run(
      () => routinesApi.removeExercise(routineId, day.id, view.id),
      {
        path: `/api/routines/${routineId}/days/${day.id}/exercises/${view.id}`,
        method: "DELETE",
        label: `Removed ${view.name}`,
      },
    );
    if (!ok) return;
    toast.success(`${view.name} removed`, {
      duration: 5000,
      action: { label: "Undo", onClick: () => void restoreServerExercise(re, flatIndex) },
    });
  };

  /** Undo path for a persisted removal: re-add + re-create sets + group + order. */
  const restoreServerExercise = async (re: RoutineExerciseDTO, flatIndex: number) => {
    if (!day) return;
    try {
      await routinesApi.addExercise(routineId, day.id, re.exerciseId);
      const fresh = await routinesApi.get(routineId);
      const freshDay = fresh.days.find((d) => d.id === day.id);
      const ordered = [...(freshDay?.exercises ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
      const newRe = ordered[ordered.length - 1];
      if (!newRe) return;
      for (const s of [...re.sets].sort((a, b) => a.sortOrder - b.sortOrder)) {
        const input: PredefinedSetInput = {
          reps: s.reps ?? null,
          setType: s.setType ?? null,
          tempo: s.tempo ?? null,
          restPlannedSec: s.restPlannedSec ?? null,
        };
        await routinesApi.addSet(routineId, day.id, newRe.id, input);
      }
      if (re.groupId != null || re.tip || re.restNone) {
        await routinesApi.updateExercise(routineId, day.id, newRe.id, {
          ...(re.groupId != null ? { groupId: re.groupId } : {}),
          ...(re.tip ? { tip: re.tip } : {}),
          ...(re.restNone != null ? { restNone: re.restNone } : {}),
        });
      }
      // Restore the flat position (the re-add landed at the end).
      const ids = ordered.map((e) => e.id).filter((id) => id !== newRe.id);
      ids.splice(Math.max(0, Math.min(flatIndex, ids.length)), 0, newRe.id);
      await routinesApi.reorderExercises(routineId, day.id, ids);
      invalidate.routines();
      invalidate.customWorkouts();
      toast.success(`${re.exercise.name} restored`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  /** §4.7 Remove series — confirm modal → remove every member. */
  const confirmRemoveSeries = async () => {
    if (!removeSeries) return;
    const group = removeSeries;
    setRemoveSeries(null);
    if (isDraft) {
      for (const m of group.members) draftStore.removeExercise(m.id);
      toast.success(`${group.label || "Series"} removed`);
      return;
    }
    if (!day) return;
    for (const m of group.members) {
      await run(() => routinesApi.removeExercise(routineId, day.id, m.id), {
        path: `/api/routines/${routineId}/days/${day.id}/exercises/${m.id}`,
        method: "DELETE",
        label: `Removed ${m.name}`,
      });
    }
    invalidate.customWorkouts();
    toast.success(`${group.label || "Series"} removed`);
  };

  // ---------- drag reorder (series move as units → flat order) ----------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = series.map((g) => `g:${g.key}`);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const nextGroups = arrayMove(series, oldIndex, newIndex);
    const flatIds = nextGroups.flatMap((g) => g.members.map((m) => m.id));
    if (isDraft) {
      draftStore.reorder(flatIds);
    } else if (day) {
      void run(() => routinesApi.reorderExercises(routineId, day.id, flatIds), {
        path: `/api/routines/${routineId}/days/${day.id}/exercises/order`,
        method: "PUT",
        body: { ids: flatIds },
        label: "Exercise order",
      });
    }
  };

  // ---------- per-exercise controllers (fresh per render; ids are stable) ----------
  const controllerFor = (view: EditorExerciseView): ExerciseEditorController => {
    if (isDraft) {
      return {
        draft: true,
        patchSet: (setId, patch) => draftStore.patchSet(view.id, setId, patch),
        addSet: () => draftStore.addSet(view.id),
        removeSet: (setId) => draftStore.removeSet(view.id, setId),
        patchExercise: (patch) => draftStore.patchExercise(view.id, patch),
        setTempoAll: (tempo) => {
          for (const s of view.sets) draftStore.patchSet(view.id, s.id, { tempo });
        },
        setRestAll: (sec) => {
          for (const s of view.sets) draftStore.patchSet(view.id, s.id, { restPlannedSec: sec });
        },
      };
    }
    return {
      draft: false,
      patchSet: (setId, patch) => {
        if (!day) return;
        void run(
          () => routinesApi.updateSet(routineId, day.id, view.id, setId, patch),
          {
            path: `/api/routines/${routineId}/days/${day.id}/exercises/${view.id}/sets/${setId}`,
            method: "PATCH",
            body: patch,
            label: "Set updated",
          },
        );
      },
      addSet: () => {
        if (!day) return;
        // §4.5 "+ Add set" duplicates the last set.
        const last = view.sets[view.sets.length - 1];
        const input: PredefinedSetInput = last
          ? { reps: last.reps, setType: last.setType, tempo: last.tempo, restPlannedSec: last.restPlannedSec }
          : {};
        void run(() => routinesApi.addSet(routineId, day.id, view.id, input), {
          path: `/api/routines/${routineId}/days/${day.id}/exercises/${view.id}/sets`,
          method: "POST",
          body: input,
          label: "Set added",
        });
      },
      removeSet: (setId) => {
        if (!day) return;
        void run(() => routinesApi.removeSet(routineId, day.id, view.id, setId), {
          path: `/api/routines/${routineId}/days/${day.id}/exercises/${view.id}/sets/${setId}`,
          method: "DELETE",
          label: "Set removed",
        });
      },
      patchExercise: (patch) => {
        if (!day) return;
        void run(() => routinesApi.updateExercise(routineId, day.id, view.id, patch), {
          path: `/api/routines/${routineId}/days/${day.id}/exercises/${view.id}`,
          method: "PATCH",
          body: patch,
          label: "Exercise updated",
        });
      },
      setTempoAll: (tempo) => {
        if (!day) return;
        for (const s of view.sets) {
          void run(() => routinesApi.updateSet(routineId, day.id, view.id, s.id, { tempo }), {
            path: `/api/routines/${routineId}/days/${day.id}/exercises/${view.id}/sets/${s.id}`,
            method: "PATCH",
            body: { tempo },
            label: "Tempo saved",
          });
        }
      },
      setRestAll: (sec) => {
        if (!day) return;
        for (const s of view.sets) {
          void run(() => routinesApi.updateSet(routineId, day.id, view.id, s.id, { restPlannedSec: sec }), {
            path: `/api/routines/${routineId}/days/${day.id}/exercises/${view.id}/sets/${s.id}`,
            method: "PATCH",
            body: { restPlannedSec: sec },
            label: "Rest saved",
          });
        }
      },
    };
  };

  // ---------- Estimate ----------
  const doEstimate = () => {
    const est = estimateMinutes(views.map((v) => ({ sets: v.sets, restNone: v.restNone })));
    setMinutesDraft(String(est));
    toast.info(`Estimated ${est} min`);
  };

  // ---------- Save (§4.9) ----------
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setShowErrors(true);
    // §4.8: validate → scroll to the FIRST error, never save through it.
    if (nameError) {
      nameRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (minutesError) {
      durationRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    for (const v of views) {
      if ((invalidSetsByExercise.get(v.id)?.size ?? 0) > 0) {
        scrollToEditor(v.id);
        return;
      }
    }
    if (noExercises || saving) return;
    if (!online) {
      toast.info("Saving needs a connection");
      return;
    }
    setSaving(true);
    try {
      if (isDraft) {
        await saveDraft();
      } else {
        await savePersisted();
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  /** §4.9 create: Routine(kind→SESSION, source=CUSTOM) + day + series + sets
   *  through the EXISTING routine-service paths, in the editor's own order. */
  const saveDraft = async () => {
    if (!draft) return;
    // create as ROUTINE (the day-create endpoint refuses SESSION kinds — the
    // hub's create-then-edit dance), flip to SESSION after the day exists.
    let current = await routinesApi.create({
      name: draft.name.trim(),
      kind: "ROUTINE",
      source: "CUSTOM",
      difficulty: draft.difficulty,
    });
    const muscles = [...new Set(draft.exercises.flatMap((e) => e.exercise.primaryMuscles ?? []))];
    const equipment = [...new Set(draft.exercises.flatMap((e) => e.exercise.equipment ?? []))];
    const minutesToStore = draft.minutes ?? estimateMinutes(draft.exercises);
    current = await routinesApi.addDay(current.id, "Workout", "WORKOUT", {
      minutes: minutesToStore,
      muscles,
      equipment,
    });
    const dayId = current.days.find((d) => (d.dayType ?? "WORKOUT") !== "REST")?.id;
    if (!dayId) throw new Error("Day creation failed");
    // flat order: exercises in draft order.
    const reIds: string[] = [];
    for (const e of draft.exercises) {
      current = await routinesApi.addExercise(current.id, dayId, e.exerciseId);
      const dayNow = current.days.find((d) => d.id === dayId);
      const ordered = [...(dayNow?.exercises ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
      const newRe = ordered[ordered.length - 1];
      if (newRe) reIds.push(newRe.id);
    }
    // groups: one per multi-member series.
    const groupIds = [...new Set(draft.exercises.map((e) => e.groupId).filter((g): g is string => g != null))];
    for (const gid of groupIds) {
      const members = draft.exercises.filter((e) => e.groupId === gid);
      const firstReId = reIds[draft.exercises.indexOf(members[0])];
      if (!firstReId) continue;
      const res = await routinesApi.addGroup(current.id, { assignReId: firstReId });
      for (const m of members.slice(1)) {
        const reId = reIds[draft.exercises.indexOf(m)];
        if (reId) await routinesApi.updateExercise(current.id, dayId, reId, { groupId: res.groupId });
      }
    }
    // sets + exercise meta.
    for (let i = 0; i < draft.exercises.length; i++) {
      const e = draft.exercises[i];
      const reId = reIds[i];
      if (!reId) continue;
      for (const s of e.sets) {
        await routinesApi.addSet(current.id, dayId, reId, {
          reps: s.reps,
          setType: s.setType,
          tempo: s.tempo,
          restPlannedSec: s.restPlannedSec,
        });
      }
      if (e.tip || e.restNone) {
        await routinesApi.updateExercise(current.id, dayId, reId, {
          ...(e.tip ? { tip: e.tip } : {}),
          ...(e.restNone ? { restNone: e.restNone } : {}),
        });
      }
    }
    // flip to SESSION (validates exactly one workout day server-side).
    await routinesApi.update(current.id, { kind: "SESSION" });
    invalidate.routines();
    invalidate.customWorkouts();
    draftStore.reset();
    toast.success("Saved to your workouts");
    navigate(`/days/${dayId}`);
  };

  /** §4.9 update: header fields + derived muscles/equipment/minutes on the day. */
  const savePersisted = async () => {
    if (!routine || !day) return;
    const patch: { name?: string; difficulty?: Difficulty } = {};
    if (name.trim() !== routine.name) patch.name = name.trim();
    if (difficulty !== (routine.difficulty ?? defaultDifficulty)) patch.difficulty = difficulty;
    if (Object.keys(patch).length > 0) await routinesApi.update(routineId, patch);
    const muscles = [...new Set(serverExercises.flatMap((e) => e.exercise.primaryMuscles ?? []))];
    const equipment = [...new Set(serverExercises.flatMap((e) => e.exercise.equipment ?? []))];
    const minutesToStore = minutes ?? day.estMinutes ?? routine.estMinutes ?? estimateMinutes(serverExercises);
    await routinesApi.updateDay(routineId, day.id, { minutes: minutesToStore, muscles, equipment });
    invalidate.routines();
    invalidate.customWorkouts();
    setNameDraft(null);
    setDifficultyDraft(null);
    setMinutesDraft(null);
    toast.success(routine.source === "CUSTOM" ? "Saved to your workouts" : "Saved");
    navigate(`/days/${day.id}`);
  };

  // ---------- render ----------
  const isLoadingScreen = !isDraft && (isLoading || !routine);

  return (
    <Screen
      topBar={
        <TopBar
          leading={
            <Button
              type="button"
              variant="ghost"
              className="h-11 flex-none px-3 text-sm font-semibold"
              tour={{ id: "build.cancel", label: "Cancel", help: "Leave the builder; unsaved edits ask first.", order: 10 }}
              onClick={cancel}
            >
              Cancel
            </Button>
          }
          title={
            <span {...tourAttrs({ id: "build.title", label: "Build workout", help: "Name it, set a level and duration, then build the exercise series.", order: 20 })}>
              Build workout
            </span>
          }
          actions={
            <>
              <Button
                type="button"
                className="h-11 flex-none gap-1.5 px-4 text-sm font-bold"
                disabled={noExercises || saving || isLoadingScreen}
                aria-label="Save this workout"
                tour={{ id: "build.save", label: "Save", help: "Validate, then save to your workouts.", order: 30 }}
                onClick={() => void save()}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                Save
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            className="h-11 w-full gap-1.5 text-base font-bold"
            tour={{ id: "build.addExercise", label: "Add exercise", help: "Pick exercises from the library — 2+ picked become a superset.", order: 80 }}
            onClick={() => navigate(`/builder/session/${routineId}/add?series=new`)}
          >
            <Plus className="h-5 w-5" aria-hidden />
            Add exercise
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody>
        {isLoadingScreen ? (
          <div className="flex flex-col gap-3 p-2" aria-busy="true" aria-label="Loading session">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        ) : (
          <>
            {/* ---------- name row 56 ---------- */}
            <div
              ref={nameRowRef}
              data-row
              className={cn(
                "flex h-14 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3",
                showErrors && nameError && "border-destructive/60",
              )}
              style={showErrors && nameError ? { boxShadow: "inset 4px 0 0 0 var(--destructive)" } : undefined}
            >
              <Input
                value={name}
                maxLength={80}
                placeholder="Workout name"
                aria-label="Workout name"
                aria-invalid={showErrors && nameError}
                {...tourAttrs({ id: "build.name", label: "Workout name", help: "Name this workout — required before saving.", order: 40 })}
                onChange={(e) => {
                  if (isDraft) draftStore.setName(e.target.value);
                  else setNameDraft(e.target.value);
                }}
                className="h-11 min-w-0 flex-1"
              />
            </div>
            {showErrors && nameError ? (
              <p data-row className="flex h-8 w-full flex-none items-center overflow-hidden whitespace-nowrap px-3 text-xs font-medium text-destructive">
                Name required
              </p>
            ) : null}

            {/* ---------- difficulty row 48 ---------- */}
            <div
              data-row
              role="radiogroup"
              aria-label="Difficulty"
              className="mt-2 flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3"
            >
              <span className="w-14 flex-none text-xs font-semibold text-muted-foreground">Level</span>
              <div className="flex h-9 min-w-0 flex-1 items-center gap-1">
                {DIFF_SEGMENTS.map((seg) => (
                  <Button
                    key={seg.value}
                    type="button"
                    variant={difficulty === seg.value ? "default" : "outline"}
                    size="sm"
                    tour={{ id: "build.difficulty", label: "Level", help: "Label this workout's level.", order: 50 }}
                    className="h-9 min-w-0 flex-1 rounded-lg px-1 text-xs font-bold"
                    onClick={() => {
                      if (isDraft) draftStore.setDifficulty(seg.value);
                      else setDifficultyDraft(seg.value);
                    }}
                  >
                    <span className="truncate">{seg.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* ---------- duration row 48 ---------- */}
            <div
              ref={durationRowRef}
              data-row
              className={cn(
                "mt-2 flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3",
                showErrors && minutesError && "border-destructive/60",
              )}
            >
              <span className="w-14 flex-none text-xs font-semibold text-muted-foreground">Duration</span>
              <Input
                inputMode="numeric"
                value={minutesRaw}
                placeholder="45"
                aria-label="Duration in minutes"
                aria-invalid={showErrors && minutesError}
                {...tourAttrs({ id: "build.duration", label: "Duration", help: "Planned minutes (5–300); Estimate fills it from the sets.", order: 60 })}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, "").slice(0, 3);
                  if (isDraft) draftStore.setMinutes(v === "" ? null : Number(v));
                  else setMinutesDraft(v);
                }}
                className="h-9 w-16 flex-none text-right tabular-nums"
              />
              <span className="flex-none text-xs text-muted-foreground">min</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                tour={{ id: "build.estimate", label: "Estimate", help: "Compute minutes from the sets' tempo and rest.", order: 70 }}
                className="ml-auto h-9 flex-none rounded-lg px-3 text-xs font-bold"
                disabled={views.length === 0}
                onClick={doEstimate}
              >
                Estimate
              </Button>
            </div>
            {showErrors && minutesError ? (
              <p data-row className="flex h-8 w-full flex-none items-center overflow-hidden whitespace-nowrap px-3 text-xs font-medium text-destructive">
                Duration must be 5–300 minutes
              </p>
            ) : null}

            {/* ---------- series list ---------- */}
            <div className="mt-3 flex-none p-1">
              {views.length === 0 ? (
                <div className="flex h-24 w-full flex-none items-center justify-center rounded-lg border border-dashed border-border">
                  <p className="truncate px-3 text-center text-sm text-muted-foreground">Add your first exercise.</p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={series.map((g) => `g:${g.key}`)} strategy={verticalListSortingStrategy}>
                    <GroupCardStack>
                      {series.map((g) => (
                        <SortableSeriesCard
                          key={g.key}
                          group={g}
                          controllerFor={controllerFor}
                          persisted={isDraft || !day ? null : { routineId, dayId: day.id }}
                          invalidSets={invalidSetsByExercise}
                          editorRefs={editorRefs.current}
                          onMenuAction={handleMenuAction}
                        />
                      ))}
                    </GroupCardStack>
                  </SortableContext>
                </DndContext>
              )}
              {noExercises ? (
                <p data-row className="mt-2 flex h-8 w-full flex-none items-center overflow-hidden whitespace-nowrap px-3 text-xs font-medium text-muted-foreground">
                  Add at least one exercise before saving.
                </p>
              ) : null}
              {hasSetErrors ? (
                <p data-row className="mt-2 flex h-8 w-full flex-none items-center overflow-hidden whitespace-nowrap px-3 text-xs font-medium text-destructive">
                  Reps required — enter a number or make the set AMRAP.
                </p>
              ) : null}
            </div>
            <div className="h-2 flex-none" aria-hidden />
          </>
        )}
        {guard.dialog}
      </ScrollBody>

      {/* ---------- §4.7 Remove series confirm ---------- */}
      <AlertDialog open={removeSeries != null} onOpenChange={(o) => !o && setRemoveSeries(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removeSeries?.label || "series"} {removeSeries?.code}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeSeries?.members.length ?? 0} exercise{(removeSeries?.members.length ?? 0) === 1 ? "" : "s"} leave
              this workout. Logged workouts stay untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmRemoveSeries();
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
