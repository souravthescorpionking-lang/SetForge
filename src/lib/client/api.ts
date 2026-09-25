// Typed API client — THE contract between UI features and the backend.
// All feature components use these functions (never raw fetch).
"use client";

import type {
  BackupDTO,
  CategoryDTO,
  ExerciseDTO,
  GoalDTO,
  GraphDTO,
  MeasurementDTO,
  MeasurementRecordDTO,
  PlateDTO,
  RecordsDTO,
  RoutineDTO,
  SessionDTO,
  SetDTO,
  SettingsDTO,
  StatsDTO,
  UnitDTO,
  WorkoutDTO,
  WorkoutSummaryDTO,
} from "@/lib/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  if (!res.ok) {
    let code = "INTERNAL";
    let message = res.statusText || "Request failed";
    let details: unknown;
    try {
      const json = await res.json();
      if (json?.error) {
        code = json.error.code ?? code;
        message = json.error.message ?? message;
        details = json.error.details;
      }
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, code, message, details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const body = (data: unknown) => JSON.stringify(data);
const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

// ===================== Auth =====================

export const authApi = {
  signup: (data: { email: string; password: string; name?: string }) =>
    request<SessionDTO>("/api/auth/signup", { method: "POST", body: body(data) }),
  login: (data: { email: string; password: string }) =>
    request<SessionDTO>("/api/auth/login", { method: "POST", body: body(data) }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  session: () => request<SessionDTO | { user: null; settings: null }>("/api/auth/session"),
};

// ===================== Categories =====================

export const categoriesApi = {
  list: () => request<CategoryDTO[]>("/api/categories"),
  create: (data: { name: string; colour?: string }) =>
    request<CategoryDTO>("/api/categories", { method: "POST", body: body(data) }),
  update: (id: string, data: { name?: string; colour?: string }) =>
    request<CategoryDTO>(`/api/categories/${id}`, { method: "PATCH", body: body(data) }),
  remove: (id: string) => request<{ ok: true }>(`/api/categories/${id}`, { method: "DELETE" }),
  reorder: (ids: string[]) =>
    request<{ ok: true }>("/api/categories/reorder", { method: "POST", body: body({ ids }) }),
};

// ===================== Exercises =====================

export type SetInput = {
  weight?: number | null;
  reps?: number | null;
  distance?: number | null;
  timeSec?: number | null;
  comment?: string | null;
  isComplete?: boolean;
};

export type ExerciseInput = {
  name?: string;
  categoryId?: string;
  type?: string;
  notes?: string | null;
  weightUnit?: string | null;
  weightIncrement?: number | null;
  restSec?: number | null;
  defaultGraph?: string | null;
  barWeight?: number | null;
  isFavorite?: boolean;
  unitChangeMode?: "convert" | "change";
};

export const exercisesApi = {
  list: (params?: { search?: string; categoryId?: string; favoritesOnly?: boolean }) =>
    request<ExerciseDTO[]>(`/api/exercises${qs(params ?? {})}`),
  get: (id: string) => request<ExerciseDTO>(`/api/exercises/${id}`),
  create: (data: ExerciseInput) =>
    request<ExerciseDTO>("/api/exercises", { method: "POST", body: body(data) }),
  update: (id: string, data: ExerciseInput) =>
    request<ExerciseDTO>(`/api/exercises/${id}`, { method: "PATCH", body: body(data) }),
  remove: (id: string) => request<{ ok: true }>(`/api/exercises/${id}`, { method: "DELETE" }),
  history: (id: string, limit = 100) =>
    request<
      Array<{
        workoutId: string;
        date: string;
        workoutExerciseId: string;
        sets: SetDTO[];
      }>
    >(`/api/exercises/${id}/history${qs({ limit })}`),
  records: (id: string) => request<RecordsDTO>(`/api/exercises/${id}/records`),
  graph: (
    id: string,
    params: { metric: string; reps?: number; rm?: number; from?: string; to?: string },
  ) => request<GraphDTO>(`/api/exercises/${id}/graph${qs(params)}`),
  lastSets: (id: string, before?: string) =>
    request<{ date: string | null; sets: SetDTO[] }>(`/api/exercises/${id}/lastsets${qs({ before })}`),
};

// ===================== Workouts =====================

export const workoutsApi = {
  byDate: (dateKey: string) =>
    request<{ workout: WorkoutDTO | null }>(`/api/workouts${qs({ date: dateKey })}`),
  list: (params?: { from?: string; to?: string }) =>
    request<{ workouts: WorkoutSummaryDTO[] }>(`/api/workouts${qs(params ?? {})}`),
  get: (id: string) => request<WorkoutDTO>(`/api/workouts/${id}`),
  createOrGet: (date: string) =>
    request<WorkoutDTO>("/api/workouts", { method: "POST", body: body({ date }) }),
  update: (id: string, data: { date?: string; comment?: string | null; startAt?: string | null; endAt?: string | null }) =>
    request<WorkoutDTO>(`/api/workouts/${id}`, { method: "PATCH", body: body(data) }),
  remove: (id: string) => request<{ ok: true }>(`/api/workouts/${id}`, { method: "DELETE" }),
  copy: (id: string, data: { fromDate?: string; setIds?: string[] }) =>
    request<WorkoutDTO>(`/api/workouts/${id}/copy`, { method: "POST", body: body(data) }),
  move: (id: string, data: { toDate: string; workoutExerciseIds?: string[] }) =>
    request<WorkoutDTO>(`/api/workouts/${id}/move`, { method: "POST", body: body(data) }),

  addExercise: (workoutId: string, exerciseId: string) =>
    request<{ workoutExerciseId: string; exerciseId: string; sets: SetDTO[] }>(
      `/api/workouts/${workoutId}/exercises`,
      { method: "POST", body: body({ exerciseId }) },
    ),
  updateExercise: (workoutId: string, weId: string, data: { sortOrder?: number; groupId?: string | null }) =>
    request<{ ok: true }>(`/api/workouts/${workoutId}/exercises/${weId}`, {
      method: "PATCH",
      body: body(data),
    }),
  removeExercise: (workoutId: string, weId: string) =>
    request<{ ok: true }>(`/api/workouts/${workoutId}/exercises/${weId}`, { method: "DELETE" }),
  reorderExercises: (workoutId: string, ids: string[]) =>
    request<{ ok: true }>(`/api/workouts/${workoutId}/exercises/order`, {
      method: "PUT",
      body: body({ ids }),
    }),

  addSet: (workoutId: string, weId: string, data: SetInput) =>
    request<SetDTO>(`/api/workouts/${workoutId}/exercises/${weId}/sets`, {
      method: "POST",
      body: body(data),
    }),
  updateSet: (workoutId: string, weId: string, setId: string, data: SetInput) =>
    request<SetDTO>(`/api/workouts/${workoutId}/exercises/${weId}/sets/${setId}`, {
      method: "PATCH",
      body: body(data),
    }),
  removeSet: (workoutId: string, weId: string, setId: string) =>
    request<{ ok: true }>(`/api/workouts/${workoutId}/exercises/${weId}/sets/${setId}`, {
      method: "DELETE",
    }),
  reorderSets: (workoutId: string, weId: string, ids: string[]) =>
    request<{ ok: true }>(`/api/workouts/${workoutId}/exercises/${weId}/sets/order`, {
      method: "PUT",
      body: body({ ids }),
    }),

  createGroup: (workoutId: string, data: { name: string; colour?: string; exerciseIds?: string[] }) =>
    request<WorkoutDTO["groups"][number]>(`/api/workouts/${workoutId}/groups`, {
      method: "POST",
      body: body(data),
    }),
  updateGroup: (workoutId: string, groupId: string, data: { name?: string; colour?: string }) =>
    request<WorkoutDTO["groups"][number]>(`/api/workouts/${workoutId}/groups/${groupId}`, {
      method: "PATCH",
      body: body(data),
    }),
  removeGroup: (workoutId: string, groupId: string) =>
    request<{ ok: true }>(`/api/workouts/${workoutId}/groups/${groupId}`, { method: "DELETE" }),
};

// ===================== Records / Stats / Goals =====================

export type AllRecordsRow = {
  exerciseId: string;
  exerciseName: string;
  categoryColour: string | null;
  setCount: number;
  bestWeight: number | null;
  bestWeightReps: number | null;
  bestWeightDate: string | null;
  estimatedOneRm: number | null;
  volume: number;
};

export const recordsApi = {
  all: () => request<{ records: AllRecordsRow[] }>("/api/records"),
  forExercise: (exerciseId: string) => exercisesApi.records(exerciseId),
  recalculate: (exerciseId?: string) =>
    request<{ ok: true; recalculated: number }>("/api/records/recalculate", {
      method: "POST",
      body: body({ ...(exerciseId ? { exerciseId } : {}) }),
    }),
};

export const statsApi = {
  get: (period: "week" | "month" | "year" | "all" | "custom", from?: string, to?: string) =>
    request<StatsDTO>(`/api/stats${qs({ period, from, to })}`),
};

export type GoalInput = {
  exerciseId?: string;
  type?: string;
  targetWeight?: number | null;
  targetReps?: number | null;
  targetDistance?: number | null;
  targetTimeSec?: number | null;
};

export const goalsApi = {
  list: (exerciseId?: string) => request<{ goals: GoalDTO[] }>(`/api/goals${qs({ exerciseId })}`),
  create: (data: GoalInput & { exerciseId: string }) =>
    request<GoalDTO>("/api/goals", { method: "POST", body: body(data) }),
  update: (id: string, data: GoalInput) =>
    request<GoalDTO>(`/api/goals/${id}`, { method: "PATCH", body: body(data) }),
  remove: (id: string) => request<{ ok: true }>(`/api/goals/${id}`, { method: "DELETE" }),
};

// ===================== Routines =====================

export type PredefinedSetInput = {
  weight?: number | null;
  reps?: number | null;
  distance?: number | null;
  timeSec?: number | null;
};

export const routinesApi = {
  list: () => request<{ routines: RoutineDTO[] }>("/api/routines"),
  get: (id: string) => request<RoutineDTO>(`/api/routines/${id}`),
  create: (data: { name: string; notes?: string | null }) =>
    request<RoutineDTO>("/api/routines", { method: "POST", body: body(data) }),
  update: (id: string, data: { name?: string; notes?: string | null; sortOrder?: number }) =>
    request<RoutineDTO>(`/api/routines/${id}`, { method: "PATCH", body: body(data) }),
  remove: (id: string) => request<{ ok: true }>(`/api/routines/${id}`, { method: "DELETE" }),
  copy: (id: string) => request<RoutineDTO>(`/api/routines/${id}/copy`, { method: "POST" }),
  logDay: (id: string, data: { dayId: string; date: string }) =>
    request<WorkoutDTO>(`/api/routines/${id}/log`, { method: "POST", body: body(data) }),

  addDay: (routineId: string, name: string) =>
    request<RoutineDTO>(`/api/routines/${routineId}/days`, { method: "POST", body: body({ name }) }),
  updateDay: (routineId: string, dayId: string, data: { name?: string; sortOrder?: number }) =>
    request<RoutineDTO>(`/api/routines/${routineId}/days/${dayId}`, { method: "PATCH", body: body(data) }),
  removeDay: (routineId: string, dayId: string) =>
    request<RoutineDTO>(`/api/routines/${routineId}/days/${dayId}`, { method: "DELETE" }),

  addExercise: (routineId: string, dayId: string, exerciseId: string) =>
    request<RoutineDTO>(`/api/routines/${routineId}/days/${dayId}/exercises`, {
      method: "POST",
      body: body({ exerciseId }),
    }),
  updateExercise: (routineId: string, dayId: string, reId: string, data: { sortOrder?: number; groupId?: string | null }) =>
    request<RoutineDTO>(`/api/routines/${routineId}/days/${dayId}/exercises/${reId}`, {
      method: "PATCH",
      body: body(data),
    }),
  removeExercise: (routineId: string, dayId: string, reId: string) =>
    request<RoutineDTO>(`/api/routines/${routineId}/days/${dayId}/exercises/${reId}`, { method: "DELETE" }),
  reorderExercises: (routineId: string, dayId: string, ids: string[]) =>
    request<RoutineDTO>(`/api/routines/${routineId}/days/${dayId}/exercises/order`, {
      method: "PUT",
      body: body({ ids }),
    }),

  addSet: (routineId: string, dayId: string, reId: string, data: PredefinedSetInput) =>
    request<RoutineDTO>(`/api/routines/${routineId}/days/${dayId}/exercises/${reId}/sets`, {
      method: "POST",
      body: body(data),
    }),
  updateSet: (routineId: string, dayId: string, reId: string, setId: string, data: PredefinedSetInput) =>
    request<RoutineDTO>(`/api/routines/${routineId}/days/${dayId}/exercises/${reId}/sets/${setId}`, {
      method: "PATCH",
      body: body(data),
    }),
  removeSet: (routineId: string, dayId: string, reId: string, setId: string) =>
    request<RoutineDTO>(`/api/routines/${routineId}/days/${dayId}/exercises/${reId}/sets/${setId}`, {
      method: "DELETE",
    }),
};

// ===================== Measurements =====================

export const measurementsApi = {
  list: () => request<{ measurements: MeasurementDTO[] }>("/api/measurements"),
  create: (data: { name: string; unitId: string; goalType?: string; targetValue?: number | null; isEnabled?: boolean }) =>
    request<MeasurementDTO>("/api/measurements", { method: "POST", body: body(data) }),
  update: (id: string, data: { goalType?: string; targetValue?: number | null; isEnabled?: boolean; unitId?: string }) =>
    request<MeasurementDTO>(`/api/measurements/${id}`, { method: "PATCH", body: body(data) }),
  remove: (id: string) => request<{ ok: true }>(`/api/measurements/${id}`, { method: "DELETE" }),
  reorder: (ids: string[]) =>
    request<{ ok: true }>("/api/measurements/reorder", { method: "POST", body: body({ ids }) }),
  records: (measurementId: string) =>
    request<{ records: MeasurementRecordDTO[] }>(`/api/measurements/${measurementId}/records`),
  addRecord: (measurementId: string, data: { value: number; recordedAt?: string; comment?: string | null }) =>
    request<MeasurementRecordDTO>(`/api/measurements/${measurementId}/records`, {
      method: "POST",
      body: body(data),
    }),
  updateRecord: (measurementId: string, recordId: string, data: { value?: number; recordedAt?: string; comment?: string | null }) =>
    request<MeasurementRecordDTO>(`/api/measurements/${measurementId}/records/${recordId}`, {
      method: "PATCH",
      body: body(data),
    }),
  removeRecord: (measurementId: string, recordId: string) =>
    request<{ ok: true }>(`/api/measurements/${measurementId}/records/${recordId}`, {
      method: "DELETE",
    }),
};

export const unitsApi = {
  list: () => request<{ units: UnitDTO[] }>("/api/units"),
  create: (name: string) =>
    request<UnitDTO>("/api/units", { method: "POST", body: body({ name }) }),
};

// ===================== Settings / Plates / Account =====================

export const settingsApi = {
  get: () => request<SettingsDTO>("/api/settings"),
  update: (data: Partial<SettingsDTO>) =>
    request<SettingsDTO>("/api/settings", { method: "PATCH", body: body(data) }),
};

export const platesApi = {
  list: (unitSystem?: string) => request<{ plates: PlateDTO[] }>(`/api/plates${qs({ unitSystem })}`),
  replace: (data: {
    unitSystem: string;
    plates: Array<{ weight: number; colour: string; count: number; isAvailable: boolean }>;
  }) => request<{ plates: PlateDTO[] }>("/api/plates", { method: "PUT", body: body(data) }),
};

export const accountApi = {
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    request<{ ok: true }>("/api/account/password", { method: "POST", body: body(data) }),
  delete: () => request<{ ok: true }>("/api/account", { method: "DELETE" }),
  exportBackup: () => request<BackupDTO>("/api/account/export"),
  exportCsv: (type: "workouts" | "body") =>
    fetch(`/api/account/export?format=csv&type=${type}`, { credentials: "same-origin" }).then((r) => {
      if (!r.ok) throw new ApiError(r.status, "EXPORT_FAILED", "Export failed");
      return r.blob();
    }),
  importBackup: (data: unknown, mode: "replace" | "merge") =>
    request<{ ok: true; importedWorkouts: number }>("/api/account/import", {
      method: "POST",
      body: body({ data, mode }),
    }),
  deleteHistory: (data: { mode: "all" | "range" | "exercise"; from?: string; to?: string; exerciseId?: string }) =>
    request<{ ok: true; deletedWorkouts: number }>("/api/account/history", {
      method: "DELETE",
      body: body(data),
    }),
};

// ===================== Sync =====================

export const syncApi = {
  pull: (since?: string) =>
    request<{
      serverTime: string;
      workouts: WorkoutDTO[];
      measurementRecords: MeasurementRecordDTO[];
      exerciseIdsChanged: string[];
    }>(`/api/sync${qs({ since })}`),
};
