// TanStack Query provider + shared query keys.
"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "./store";
import { authApi, categoriesApi, exercisesApi, workoutsApi, measurementsApi, timerPresetsApi, dashboardApi, programsApi, scheduleApi } from "./api";
import type { Difficulty } from "@/lib/constants";

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
  timerPresets: ["timer-presets"] as const,
  // ---- Part 5: programs / sessions / schedule / dashboard ----
  dashboard: ["dashboard"] as const,
  /** "user" = resolved server-side from the session's difficulty. */
  programs: (kind?: string, difficulty?: string) => ["programs", kind ?? "all", difficulty ?? "user"] as const,
  schedule: (from: string, to: string) => ["schedule", from, to] as const,
  // ---- Part 9 §2/§4: session payload (user.difficulty) + program detail ----
  session: ["session"] as const,
  programDetail: (id: string, difficulty?: string) => ["program-detail", id, difficulty ?? "user"] as const,
  // ---- Part 9 §5: day overview (override-merged) + replace suggestions ----
  day: (dayId: string) => ["day", dayId] as const,
  exerciseSuggestions: (exerciseId: string) => ["exercise-suggestions", exerciseId] as const,
  // ---- Part 9 §7: on-demand catalog (server-filtered by the URL state) ----
  onDemand: (params?: Record<string, unknown>) => ["on-demand", params ?? {}] as const,
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

export function useTimerPresets() {
  return useQuery({ queryKey: qk.timerPresets, queryFn: () => timerPresetsApi.list() });
}

// ---------- Part 5 shared hooks ----------

/** Home dashboard payload (15s staleTime — cheap enough to revalidate often). */
export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: () => dashboardApi.get(), staleTime: 15_000 });
}

/** Programs list with follow/usage metadata. kind filters ROUTINE | SESSION;
 * difficulty scopes the Part 9 §3 variant info (omit = the user's difficulty). */
export function usePrograms(kind?: "ROUTINE" | "SESSION", difficulty?: Difficulty) {
  return useQuery({
    queryKey: qk.programs(kind, difficulty),
    queryFn: () => programsApi.list({ ...(kind ? { kind } : {}), ...(difficulty ? { difficulty } : {}) }),
  });
}

/** Part 9 §2: session payload query — user.difficulty is the source of truth
 *  for the global difficulty. PATCH /api/user/difficulty invalidates ["session"]
 *  and every difficulty-derived view re-renders. */
export function useSession() {
  return useQuery({ queryKey: qk.session, queryFn: () => authApi.session(), staleTime: 30_000 });
}

/** Schedule entries + projected ghosts for a [from, to] window. */
export function useSchedule(from: string, to: string) {
  return useQuery({
    queryKey: qk.schedule(from, to),
    queryFn: () => scheduleApi.list({ from, to }),
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return {
    workout: (dateKey?: string) => {
      if (dateKey) qc.invalidateQueries({ queryKey: qk.workoutByDate(dateKey) });
      // NB: ["workout", date] (by-date queries) is a DIFFERENT key family from
      // ["workouts", params] (list queries) — invalidate both prefixes so
      // mutations refresh the open day view even when the date isn't known.
      qc.invalidateQueries({ queryKey: ["workout"] });
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
    timerPresets: () => qc.invalidateQueries({ queryKey: ["timer-presets"] }),
    // ---- Part 5 ----
    dashboard: () => qc.invalidateQueries({ queryKey: qk.dashboard }),
    programs: () => {
      qc.invalidateQueries({ queryKey: ["programs"] });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
    schedule: () => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
    // ---- Part 9 §2/§4 ----
    session: () => qc.invalidateQueries({ queryKey: qk.session }),
    /** Program detail queries (all difficulties; scope to one id when given). */
    programDetail: (id?: string) =>
      qc.invalidateQueries({ queryKey: id ? ["program-detail", id] : ["program-detail"] }),
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
