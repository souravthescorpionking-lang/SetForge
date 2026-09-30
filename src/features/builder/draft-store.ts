"use client";

// ─────────────────────────────────────────────────────────────────────────────
// builder-draft-store — the §4.2 "new workout" draft (Zustand).
//
// #/builder/session/new builds a CLIENT-side draft: nothing hits the server
// until Save (§4.9 creates the Routine + day + series + sets through the
// existing routines APIs). The draft lives here (not in the screen) because
// the add-exercise flow (§4.3) navigates to sibling hash routes — the build
// screen unmounts and remounts, and the draft must survive.
//
// One draft at a time; `reset()` runs on entry (Cancel/discard + post-save).
// Persisted sessions (#/builder/session/{id}) never touch this store — their
// edits go straight through the existing routine APIs.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { uuid7 } from "@/lib/uuid7";
import type { Difficulty } from "@/lib/constants";
import type { ExerciseDTO } from "@/lib/types";

/** One prescribed set of the draft (§4.5 set table row). */
export type DraftSet = {
  /** uuid7 minted client-side; becomes the API-created set after Save. */
  id: string;
  reps: number | null;
  /** NORMAL | WARMUP | DROP | FAILURE | AMRAP (isAmrap mirrors AMRAP). */
  setType: string | null;
  restPlannedSec: number | null;
  tempo: string | null;
};

/** One exercise of the draft; exercises with a shared groupId form a series. */
export type DraftExercise = {
  id: string; // uuid7 client-side
  exerciseId: string;
  /** Catalog row snapshot (name/modality/muscles/equipment for chips + save). */
  exercise: ExerciseDTO;
  groupId: string | null; // shared client uuid when part of a multi-member series
  tip: string | null;
  restNone: boolean;
  sets: DraftSet[];
};

export type BuilderDraft = {
  name: string;
  difficulty: Difficulty;
  minutes: number | null;
  exercises: DraftExercise[];
};

export type BuilderDraftStore = {
  draft: BuilderDraft | null;
  /** Start a fresh draft (called on entering #/builder/session/new). */
  begin: (seed: { difficulty: Difficulty }) => void;
  /** Drop the draft entirely (Cancel/discard/after save). */
  reset: () => void;
  setName: (name: string) => void;
  setDifficulty: (difficulty: Difficulty) => void;
  setMinutes: (minutes: number | null) => void;
  /** Append a new series: one member per picked exercise (§4.3 ≥5 rule) or a
   *  single grouped series for k≤4 picks. Returns nothing — callers re-render
   *  off the store subscription. */
  addSeries: (picks: ExerciseDTO[]) => void;
  /** Append picks to an existing series (§4.3 series param; cap enforced upstream). */
  addToSeries: (seriesGroupId: string, picks: ExerciseDTO[]) => void;
  removeExercise: (id: string) => void;
  /** Restore a removed exercise at its original index (Undo toast, §4.7). */
  restoreExercise: (entry: DraftExercise, index: number) => void;
  patchExercise: (id: string, patch: Partial<Pick<DraftExercise, "tip" | "restNone" | "groupId">>) => void;
  /** Flat reorder of the draft's exercises (drag handles, §4.7 rearrange). */
  reorder: (orderedIds: string[]) => void;
  patchSet: (exerciseId: string, setId: string, patch: Partial<DraftSet>) => void;
  addSet: (exerciseId: string) => void; // duplicates the last set (§4.5)
  removeSet: (exerciseId: string, setId: string) => void;
};

const freshSet = (from?: DraftSet): DraftSet => ({
  id: uuid7(),
  reps: from?.reps ?? null,
  setType: from?.setType ?? null,
  restPlannedSec: from?.restPlannedSec ?? null,
  tempo: from?.tempo ?? null,
});

const exerciseFromPick = (pick: ExerciseDTO, groupId: string | null): DraftExercise => ({
  id: uuid7(),
  exerciseId: pick.id,
  exercise: pick,
  groupId,
  tip: null,
  restNone: false,
  // §4.5: every exercise starts with one set — validation §4.8 relies on it.
  sets: [freshSet()],
});

export const useBuilderDraft = create<BuilderDraftStore>((set) => ({
  draft: null,

  begin: ({ difficulty }) =>
    set({
      draft: {
        name: "",
        difficulty,
        minutes: null,
        exercises: [],
      },
    }),

  reset: () => set({ draft: null }),

  setName: (name) =>
    set((s) => (s.draft ? { draft: { ...s.draft, name } } : s)),

  setDifficulty: (difficulty) =>
    set((s) => (s.draft ? { draft: { ...s.draft, difficulty } } : s)),

  setMinutes: (minutes) =>
    set((s) => (s.draft ? { draft: { ...s.draft, minutes } } : s)),

  addSeries: (picks) =>
    set((s) => {
      if (!s.draft || picks.length === 0) return s;
      // §4.3: k=1..4 → ONE series (Superset/Triset/Giant set); k≥5 → each
      // pick becomes its own single-member series.
      if (picks.length >= 5) {
        return {
          draft: {
            ...s.draft,
            exercises: [...s.draft.exercises, ...picks.map((p) => exerciseFromPick(p, null))],
          },
        };
      }
      const groupId = uuid7();
      return {
        draft: {
          ...s.draft,
          exercises: [...s.draft.exercises, ...picks.map((p) => exerciseFromPick(p, groupId))],
        },
      };
    }),

  addToSeries: (seriesGroupId, picks) =>
    set((s) => {
      if (!s.draft || picks.length === 0) return s;
      const exists = s.draft.exercises.some((e) => e.groupId === seriesGroupId);
      if (!exists) return s;
      return {
        draft: {
          ...s.draft,
          exercises: [...s.draft.exercises, ...picks.map((p) => exerciseFromPick(p, seriesGroupId))],
        },
      };
    }),

  removeExercise: (id) =>
    set((s) => {
      if (!s.draft) return s;
      const target = s.draft.exercises.find((e) => e.id === id);
      const rest = s.draft.exercises.filter((e) => e.id !== id);
      // Removing the last member of a series dissolves it (group simply
      // vanishes with its final member).
      if (target?.groupId != null && rest.every((e) => e.groupId !== target.groupId)) {
        return { draft: { ...s.draft, exercises: rest } };
      }
      return { draft: { ...s.draft, exercises: rest } };
    }),

  restoreExercise: (entry, index) =>
    set((s) => {
      if (!s.draft) return s;
      const exercises = [...s.draft.exercises];
      exercises.splice(Math.min(Math.max(index, 0), exercises.length), 0, entry);
      return { draft: { ...s.draft, exercises } };
    }),

  patchExercise: (id, patch) =>
    set((s) => {
      if (!s.draft) return s;
      return {
        draft: {
          ...s.draft,
          exercises: s.draft.exercises.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        },
      };
    }),

  reorder: (orderedIds) =>
    set((s) => {
      if (!s.draft) return s;
      const byId = new Map(s.draft.exercises.map((e) => [e.id, e]));
      const next = orderedIds.map((id) => byId.get(id)).filter((e): e is DraftExercise => e != null);
      // Unknown/missing ids append in their current order (defensive).
      for (const e of s.draft.exercises) if (!orderedIds.includes(e.id)) next.push(e);
      return { draft: { ...s.draft, exercises: next } };
    }),

  patchSet: (exerciseId, setId, patch) =>
    set((s) => {
      if (!s.draft) return s;
      return {
        draft: {
          ...s.draft,
          exercises: s.draft.exercises.map((e) =>
            e.id === exerciseId
              ? { ...e, sets: e.sets.map((x) => (x.id === setId ? { ...x, ...patch } : x)) }
              : e,
          ),
        },
      };
    }),

  addSet: (exerciseId) =>
    set((s) => {
      if (!s.draft) return s;
      return {
        draft: {
          ...s.draft,
          exercises: s.draft.exercises.map((e) =>
            e.id === exerciseId
              ? { ...e, sets: [...e.sets, freshSet(e.sets[e.sets.length - 1])] }
              : e,
          ),
        },
      };
    }),

  removeSet: (exerciseId, setId) =>
    set((s) => {
      if (!s.draft) return s;
      return {
        draft: {
          ...s.draft,
          exercises: s.draft.exercises.map((e) =>
            e.id === exerciseId ? { ...e, sets: e.sets.filter((x) => x.id !== setId) } : e,
          ),
        },
      };
    }),
}));
