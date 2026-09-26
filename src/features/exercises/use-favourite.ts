"use client";

// Optimistic favourite toggle shared by the exercises list and overview header.
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/client/query";
import { exercisesApi } from "@/lib/client/api";
import type { ExerciseDTO } from "@/lib/types";
import { useOfflineRun } from "./offline-run";

export function useToggleFavourite() {
  const qc = useQueryClient();
  const run = useOfflineRun();

  return async (exercise: Pick<ExerciseDTO, "id" | "isFavorite" | "name">) => {
    const next = !exercise.isFavorite;

    // optimistic flip in every cached exercise list + the single-exercise entry
    qc.setQueriesData<ExerciseDTO[]>({ queryKey: ["exercises"] }, (old) =>
      old ? old.map((x) => (x.id === exercise.id ? { ...x, isFavorite: next } : x)) : old,
    );
    qc.setQueryData<ExerciseDTO>(qk.exercise(exercise.id), (old) =>
      old && old.id === exercise.id ? { ...old, isFavorite: next } : old,
    );

    const ok = await run({
      label: next ? "Favourite" : "Unfavourite",
      path: `/api/exercises/${exercise.id}`,
      method: "PATCH",
      body: { isFavorite: next },
      run: () => exercisesApi.update(exercise.id, { isFavorite: next }),
    });

    // failed online → roll the optimistic flip back
    if (!ok) {
      qc.invalidateQueries({ queryKey: ["exercises"] });
      qc.invalidateQueries({ queryKey: qk.exercise(exercise.id) });
    }
  };
}
