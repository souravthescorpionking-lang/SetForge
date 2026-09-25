// TanStack Query provider + shared query keys.
"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "./store";
import { categoriesApi, exercisesApi, workoutsApi, measurementsApi } from "./api";

export const qk = {
  categories: ["categories"] as const,
  exercises: (params?: Record<string, unknown>) => ["exercises", params ?? {}] as const,
  exercise: (id: string) => ["exercise", id] as const,
  exerciseHistory: (id: string) => ["exercise-history", id] as const,
  exerciseRecords: (id: string) => ["exercise-records", id] as const,
  exerciseGraph: (id: string, params: Record<string, unknown>) => ["exercise-graph", id, params] as const,
  workoutByDate: (dateKey: string) => ["workout", dateKey] as const,
  workoutList: (params?: Record<string, unknown>) => ["workouts", params ?? {}] as const,
  workoutDates: (from: string, to: string) => ["workout-dates", from, to] as const,
  records: ["records"] as const,
  stats: (period: string, from?: string, to?: string) => ["stats", period, from, to] as const,
  goals: ["goals"] as const,
  routines: ["routines"] as const,
  routine: (id: string) => ["routine", id] as const,
  measurements: ["measurements"] as const,
  measurementRecords: (id: string) => ["measurement-records", id] as const,
  units: ["units"] as const,
  settings: ["settings"] as const,
  plates: (unitSystem?: string) => ["plates", unitSystem ?? "all"] as const,
  lastSets: (exerciseId: string, before?: string) => ["last-sets", exerciseId, before ?? ""] as const,
};

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// ---------- shared hooks ----------

export function useCategories() {
  return useQuery({ queryKey: qk.categories, queryFn: () => categoriesApi.list() });
}

export function useExercises(params?: { search?: string; categoryId?: string; favoritesOnly?: boolean }) {
  const stableKey = params ? JSON.stringify(params) : "";
  const parsed = stableKey ? (JSON.parse(stableKey) as typeof params) : undefined;
  return useQuery({
    queryKey: qk.exercises(parsed),
    queryFn: () => exercisesApi.list(parsed),
  });
}

export function useWorkoutByDate(dateKey: string | undefined) {
  return useQuery({
    queryKey: qk.workoutByDate(dateKey ?? ""),
    queryFn: () => workoutsApi.byDate(dateKey!),
    enabled: !!dateKey,
  });
}

export function useMeasurements() {
  return useQuery({ queryKey: qk.measurements, queryFn: () => measurementsApi.list() });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return {
    workout: (dateKey?: string) => {
      if (dateKey) qc.invalidateQueries({ queryKey: qk.workoutByDate(dateKey) });
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["workout-dates"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["records"] });
      qc.invalidateQueries({ queryKey: ["exercise-records"] });
      qc.invalidateQueries({ queryKey: ["exercise-graph"] });
      qc.invalidateQueries({ queryKey: ["exercise-history"] });
    },
    exercises: () => {
      qc.invalidateQueries({ queryKey: ["exercises"] });
      qc.invalidateQueries({ queryKey: ["exercise"] });
    },
    categories: () => qc.invalidateQueries({ queryKey: qk.categories }),
    routines: () => {
      qc.invalidateQueries({ queryKey: ["routines"] });
      qc.invalidateQueries({ queryKey: ["routine"] });
    },
    measurements: () => {
      qc.invalidateQueries({ queryKey: ["measurements"] });
      qc.invalidateQueries({ queryKey: ["measurement-records"] });
    },
    goals: () => qc.invalidateQueries({ queryKey: ["goals"] }),
    plates: () => qc.invalidateQueries({ queryKey: ["plates"] }),
    all: () => qc.invalidateQueries(),
  };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export { useApp };
