// Typed API client — THE contract between UI features and the backend.
// All feature components use these functions (never raw fetch).
"use client";

import type {
  BackupDTO,
  CategoryDTO,
  DashboardDTO,
  ExerciseDTO,
  GoalDTO,
  GraphDTO,
  MeasurementDTO,
  MeasurementRecordDTO,
  PlateDTO,
  ProgramSummaryDTO,
  ProjectedDayDTO,
  RecordsDTO,
  RoutineDTO,
  ScheduleEntryDTO,
  SessionDTO,
  SetDTO,
  SettingsDTO,
  StatsDTO,
  TimerPresetDTO,
  UnitDTO,
  WorkoutDTO,
  WorkoutSummaryDTO,
  ProgramDetailDTO,
  DayDetailDTO,
  ExerciseSuggestionDTO,
} from "@/lib/types";
import type { Difficulty } from "@/lib/constants";

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
  signup: (data: { email: string; password: string; name?: string; timezone?: string }) =>
    request<SessionDTO>("/api/auth/signup", { method: "POST", body: body(data) }),
  login: (data: { email: string; password: string }) =>
    request<SessionDTO>("/api/auth/login", { method: "POST", body: body(data) }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  session: () => request<SessionDTO | { user: null; settings: null }>("/api/auth/session"),
  requestReset: (data: { email: string }) =>
    request<{ ok: true; emailConfigured: boolean }>("/api/auth/reset", { method: "POST", body: body(data) }),
  confirmReset: (data: { token: string; newPassword: string }) =>
    request<{ ok: true }>("/api/auth/reset/confirm", { method: "POST", body: body(data) }),
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
  isWarmup?: boolean;
  // ---- Part 2 ----
  setType?: string;
  rpe?: number | null;
  tempo?: string | null;
  restPlannedSec?: number | null;
  restActualSec?: number | null;
  completedAt?: string | null;
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
  autoWarmup?: boolean;
  isFavorite?: boolean;
  unitChangeMode?: "convert" | "change";
  // ---- Part 2 ----
  defaultSetType?: string | null;
  defaultRpeTarget?: number | null;
  defaultTempo?: string | null;
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
  /** Part 8 §3.10: the in-progress session (null → redirect to #/workout). */
  active: () => request<{ workout: WorkoutDTO | null }>("/api/workouts/active"),
  list: (params?: { from?: string; to?: string; search?: string; dayId?: string }) =>
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

  // ---- Part 5: finish / undo-finish ----
  finish: (id: string) =>
    request<{ workoutId: string; finishedAt: string; advanced: boolean; nextDay: { id: string; name: string; dayType: string } | null }>(
      `/api/workouts/${id}/finish`,
      { method: "POST" },
    ),
  undoFinish: (id: string) =>
    request<{ ok: true }>(`/api/workouts/${id}/finish`, { method: "DELETE" }),

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
  // ---- Part 2 ----
  setType?: string | null;
  rpe?: number | null;
  tempo?: string | null;
  restPlannedSec?: number | null;
  // ---- Part 8 §6.4 weight prescription ----
  weightKind?: "FIXED" | "COPY_LAST" | "PERCENT_1RM" | null;
  pct?: number | null;
};

export const routinesApi = {
  list: () => request<{ routines: RoutineDTO[] }>("/api/routines"),
  get: (id: string) => request<RoutineDTO>(`/api/routines/${id}`),
  create: (data: { name: string; notes?: string | null; kind?: "ROUTINE" | "SESSION" }) =>
    request<RoutineDTO>("/api/routines", { method: "POST", body: body(data) }),
  update: (
    id: string,
    data: {
      name?: string;
      notes?: string | null;
      sortOrder?: number;
      difficulty?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
      kind?: "ROUTINE" | "SESSION";
    },
  ) => request<RoutineDTO>(`/api/routines/${id}`, { method: "PATCH", body: body(data) }),
  remove: (id: string) => request<{ ok: true }>(`/api/routines/${id}`, { method: "DELETE" }),
  copy: (id: string) => request<RoutineDTO>(`/api/routines/${id}/copy`, { method: "POST" }),
  logDay: (id: string, data: { dayId: string; date: string }) =>
    request<WorkoutDTO>(`/api/routines/${id}/log`, { method: "POST", body: body(data) }),

  addDay: (routineId: string, name: string, dayType?: "WORKOUT" | "REST") =>
    request<RoutineDTO>(`/api/routines/${routineId}/days`, {
      method: "POST",
      body: body({ name, ...(dayType ? { dayType } : {}) }),
    }),
  updateDay: (
    routineId: string,
    dayId: string,
    data: { name?: string; sortOrder?: number; dayType?: "WORKOUT" | "REST" },
  ) =>
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
  // ---- Part 8 §3.8 builder groups (additive) ----
  addGroup: (routineId: string, data: { name?: string; assignReId?: string }) =>
    request<{ groupId: string }>(`/api/routines/${routineId}/groups`, {
      method: "POST",
      body: body(data),
    }),
  removeGroup: (routineId: string, groupId: string) =>
    request<{ ok: true }>(`/api/routines/${routineId}/groups/${groupId}`, { method: "DELETE" }),
};

// ===================== Part 5: Programs / Sessions / Schedule / Dashboard =====================

/** Cursor ops return the new cursor position + day shape. */
export type CursorResult = { dayIndex: number; day: { id: string; name: string; dayType: string } };

export const programsApi = {
  /** Programs list (Part 9 §3 catalog DTOs — superset of the legacy summary).
   *  Accepts the legacy positional kind OR a params object: difficulty scopes
   *  the variant info (omit = the user's difficulty); kind filters
   *  ROUTINE | SESSION (omit = all). */
  list: (kindOrParams?: "ROUTINE" | "SESSION" | { kind?: "ROUTINE" | "SESSION"; difficulty?: Difficulty }) => {
    const params = typeof kindOrParams === "string" ? { kind: kindOrParams } : (kindOrParams ?? {});
    return request<ProgramSummaryDTO[]>(`/api/programs${qs(params)}`);
  },
  /** GET /api/programs/:id?difficulty= (§4) — variant-aware program detail. */
  detail: (routineId: string, difficulty?: Difficulty) =>
    request<ProgramDetailDTO>(`/api/programs/${routineId}${qs({ difficulty })}`),
  follow: (routineId: string, startDayIndex?: number) =>
    request<{ routineId: string; dayIndex: number; day: { id: string; name: string; dayType: string } }>(
      `/api/programs/${routineId}/follow`,
      { method: "POST", body: body({ ...(startDayIndex != null ? { startDayIndex } : {}) }) },
    ),
  unfollow: () => request<{ ok: true }>("/api/programs/follow", { method: "DELETE" }),
  advanceCursor: (n = 1) =>
    request<CursorResult>("/api/programs/cursor/advance", { method: "POST", body: body({ n }) }),
  skipCursorDay: () =>
    request<{ skipped: { id: string; name: string; dayType: string }; dayIndex: number; day: { id: string; name: string; dayType: string } }>(
      "/api/programs/cursor/skip",
      { method: "POST" },
    ),
  jumpCursor: (dayIndex: number) =>
    request<CursorResult>("/api/programs/cursor/jump", {
      method: "POST",
      body: body({ dayIndex }),
    }),
  markRestDone: () =>
    request<CursorResult>("/api/programs/cursor/rest-done", { method: "POST" }),
  /** Atomic day start: workout + predefined sets + provenance + schedule DONE entry. */
  startDay: (routineId: string, data: { dayId?: string; date?: string } = {}) =>
    request<WorkoutDTO>(`/api/programs/${routineId}/start-day`, {
      method: "POST",
      body: body(data),
    }),
};

export const dashboardApi = {
  get: () => request<DashboardDTO>("/api/dashboard"),
};

export const sessionsApi = {
  /** Promote a logged workout into a reusable SESSION-kind routine. */
  fromWorkout: (workoutId: string, name?: string) =>
    request<RoutineDTO>("/api/sessions/from-workout", {
      method: "POST",
      body: body({ workoutId, ...(name ? { name } : {}) }),
    }),
};

export type ScheduleCreateInput = {
  date: string; // YYYY-MM-DD
  routineId: string;
  dayId?: string;
  note?: string | null;
  replace?: boolean;
};

export type ScheduleListResult = {
  entries: ScheduleEntryDTO[];
  projected: ProjectedDayDTO[];
};

export const scheduleApi = {
  list: (params?: { from?: string; to?: string }) =>
    request<ScheduleListResult>(`/api/schedule${qs(params ?? {})}`),
  create: (data: ScheduleCreateInput) =>
    request<ScheduleEntryDTO>("/api/schedule", { method: "POST", body: body(data) }),
  update: (id: string, data: { date?: string; status?: "PLANNED" | "SKIPPED"; note?: string | null }) =>
    request<ScheduleEntryDTO>(`/api/schedule/${id}`, { method: "PUT", body: body(data) }),
  remove: (id: string) => request<{ ok: true }>(`/api/schedule/${id}`, { method: "DELETE" }),
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

export type TimerPresetInput = {
  name?: string;
  prepareSec?: number;
  workSec?: number;
  restSec?: number;
  rounds?: number;
};

export const timerPresetsApi = {
  list: () => request<{ presets: TimerPresetDTO[] }>("/api/timer-presets"),
  create: (data: TimerPresetInput) =>
    request<TimerPresetDTO>("/api/timer-presets", { method: "POST", body: body(data) }),
  update: (id: string, data: TimerPresetInput) =>
    request<TimerPresetDTO>(`/api/timer-presets/${id}`, { method: "PATCH", body: body(data) }),
  remove: (id: string) => request<{ ok: true }>(`/api/timer-presets/${id}`, { method: "DELETE" }),
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

// ===================== Part 6: library / profile / media / programs meta =====================

import type {
  DictionaryTermDTO,
  RemovedWorkoutDTO,
  LibraryEntryDTO,
  MediaUploadResultDTO,
  ProgramMetaDTO,
  ProgramTotalsDTO,
  ProgressPhotoDTO,
  UserProfileDTO,
  WeightTableDTO,
} from "@/lib/types";

export type BuilderSetInput = { weight?: number | null; reps?: number | null; restPlannedSec?: number | null; setType?: string | null };
export type BuilderProgramInput = {
  name: string;
  difficulty?: string | null;
  daysPerWeek?: number | null;
  estMinutes?: number | null;
  labels?: string[];
  phases: Array<{ name: string; weeks: number }>;
  weekly: Array<{ weekday: number; type: string; name?: string | null }>;
  exercises?: Record<string, Array<{ exerciseId: string; sets?: BuilderSetInput[] }>>;
};

export const libraryApi = {
  list: (params: { search?: string; muscle?: string[]; equipment?: string[]; fav?: boolean; mine?: boolean } = {}) => {
    const sp = new URLSearchParams();
    if (params.search) sp.set("search", params.search);
    for (const m of params.muscle ?? []) sp.append("muscle", m);
    for (const e of params.equipment ?? []) sp.append("equipment", e);
    if (params.fav) sp.set("fav", "1");
    if (params.mine) sp.set("mine", "1");
    const query = sp.toString();
    return request<LibraryEntryDTO[]>(`/api/library${query ? `?${query}` : ""}`);
  },
  get: (key: string) => request<LibraryEntryDTO>(`/api/library/${encodeURIComponent(key)}`),
  adopt: (key: string, favourite?: boolean) =>
    request<{ exerciseId: string; created: boolean; favourite: boolean }>(
      `/api/library/${encodeURIComponent(key)}/adopt`,
      { method: "POST", body: body({ ...(favourite != null ? { favourite } : {}) }) },
    ),
  adoptMany: (keys: string[]) =>
    request<{ adopted: number }>("/api/library/adopt-many", { method: "POST", body: body({ keys }) }),
};

export const profileApi = {
  get: () => request<UserProfileDTO>("/api/profile"),
  update: (patch: Partial<{ age: number | null; heightCm: number | null; weightKg: number | null; level: string | null; goal: string | null; daysPerWeekTarget: number | null }>) =>
    request<UserProfileDTO>("/api/profile", { method: "PUT", body: body(patch) }),
  completeOnboarding: (payload: {
    unitSystem?: string; goal?: string | null; level?: string | null; daysPerWeekTarget?: number | null;
    heightCm?: number | null; weightKg?: number | null; age?: number | null; skipped?: boolean;
  }) => request<{ profile: UserProfileDTO; startedTemplate: { id: string; name: string; dayCount: number } | null }>(
      "/api/onboarding/complete",
      { method: "POST", body: body(payload) },
    ),
};


export const dictionaryApi = {
  get: () => request<{ terms: DictionaryTermDTO[] }>("/api/dictionary"),
};

export const mediaApi = {
  upload: async (file: File): Promise<MediaUploadResultDTO> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/media/upload", { method: "POST", body: form, credentials: "same-origin" });
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const err = json as { error?: { message?: string; code?: string } } | null;
      throw new ApiError(res.status, err?.error?.code ?? "REQUEST_FAILED", err?.error?.message ?? "Upload failed");
    }
    return json as MediaUploadResultDTO;
  },
  /** Resolve a media key to a servable URL (auth-scoped API path or direct public URL). */
  url: (key: string) => `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`,
};

export const photosApi = {
  list: (params: { measurementId?: string; recordId?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.measurementId) sp.set("measurementId", params.measurementId);
    if (params.recordId) sp.set("recordId", params.recordId);
    const query = sp.toString();
    return request<{ photos: ProgressPhotoDTO[] }>(`/api/photos${query ? `?${query}` : ""}`);
  },
  attach: (measurementId: string, recordId: string, data: { slot: string; mediaKey: string; width: number; height: number }) =>
    request<ProgressPhotoDTO>(`/api/measurements/${measurementId}/records/${recordId}/photos`, { method: "POST", body: body(data) }),
  remove: (id: string) => request<{ ok: true }>(`/api/photos/${id}`, { method: "DELETE" }),
};

export const programsMetaApi = {
  get: (routineId: string) => request<ProgramMetaDTO>(`/api/programs/${routineId}/meta`),
  update: (routineId: string, patch: Record<string, unknown>) =>
    request<ProgramMetaDTO>(`/api/programs/${routineId}/meta`, { method: "PUT", body: body(patch) }),
  markOff: (routineId: string, dayId: string) =>
    request<{ completedDayIds: string[]; advanced: boolean }>(`/api/programs/${routineId}/days/${dayId}/mark-off`, { method: "POST" }),
  unmarkOff: (routineId: string, dayId: string) =>
    request<{ completedDayIds: string[] }>(`/api/programs/${routineId}/days/${dayId}/mark-off`, { method: "DELETE" }),
  favouriteDay: (routineId: string, dayId: string) =>
    request<{ isFavorite: boolean }>(`/api/programs/${routineId}/days/${dayId}/favourite`, { method: "POST" }),
  totals: (routineId: string) => request<ProgramTotalsDTO>(`/api/programs/${routineId}/totals`),
  build: (input: BuilderProgramInput) =>
    request<{ id: string; dayCount: number }>("/api/programs/builder", { method: "POST", body: body(input) }),
};

export const historyApi = {
  search: (search: string) =>
    request<{ workouts: WorkoutSummaryDTO[] }>(`/api/history${qs({ search })}`),
};

export const exercisesWeightTableApi = {
  get: (exerciseId: string, opts: { limit?: number; before?: string } = {}) =>
    request<WeightTableDTO>(`/api/exercises/${exerciseId}/weight-table${qs({ limit: opts.limit, before: opts.before })}`),
};

export const workoutLifecycleApi = {
  discard: (id: string) => request<{ ok: true; discardedAt: string }>(`/api/workouts/${id}/discard`, { method: "POST" }),
  restore: (id: string) => request<{ ok: true }>(`/api/workouts/${id}/restore`, { method: "POST" }),
  /** Part 8 §6.9: delete a removed workout permanently. */
  purge: (id: string) => request<{ ok: true }>(`/api/workouts/${id}/purge`, { method: "POST" }),
  hidden: () => request<{ workouts: RemovedWorkoutDTO[] }>("/api/workouts/hidden"),
};

export const scheduleTimeApi = {
  set: (id: string, time: string | null) =>
    request<ScheduleEntryDTO>(`/api/schedule/${id}/time`, { method: "POST", body: body({ time }) }),
};

export const authConfirmApi = {
  confirm: (token: string) =>
    request<{ ok: true }>("/api/auth/confirm", { method: "POST", body: body({ token }) }),
  resend: (email: string) =>
    request<{ ok: true; emailConfigured: boolean }>("/api/auth/resend-confirmation", { method: "POST", body: body({ email }) }),
};

export const clientErrorsApi = {
  report: (payload: { message: string; stack?: string; route?: string; url?: string }) => {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload).slice(0, 2048),
    }).catch(() => undefined);
  },
};

// ===================== Part 7: tour system =====================

import type { TourStateDTO, TourStatus, ToursStateResponseDTO } from "@/lib/types";

export const toursApi = {
  /** Full tour + hint state for the signed-in user. */
  getState: () => request<ToursStateResponseDTO>("/api/tours/state"),
  /** Upsert the outcome of one screen's tour (screenId = route name or "__welcome"). */
  putState: (screenId: string, data: { version: string; status: TourStatus; stepReached: number }) =>
    request<TourStateDTO>(`/api/tours/state/${encodeURIComponent(screenId)}`, {
      method: "PUT",
      body: body(data),
    }),
  /** Mark a contextual hint as seen (idempotent). */
  markHint: (hintId: string) =>
    request<{ hintId: string; seenAt: string }>(`/api/tours/hints/${encodeURIComponent(hintId)}`, {
      method: "PUT",
      body: body({}),
    }),
  /** Wipe tour state (all, or one screen's tour). */
  reset: (scope: { scope: "all" } | { scope: "screen"; screenId: string }) =>
    request<{ ok: true; scope: "all" | "screen"; deleted?: number }>("/api/tours/reset", {
      method: "POST",
      body: body(scope),
    }),
};

// ---------- Part 8: exercise meta (warm-up + progression) & backups ----------

export type ExerciseMetaProgression = {
  type: "LINEAR" | "DOUBLE" | "NONE";
  increment: number;
  unit: "kg" | "lbs" | "%";
  condition: "ALL_SETS_HIT" | "LAST_SET_HIT";
  failStreakForDeload: number;
  deloadPct: number;
};

export type ExerciseMetaDTO = {
  warmupScheme: "NONE" | "STANDARD" | "LIGHT" | "CUSTOM";
  warmupCustom: Array<{ pct: number; reps: number }> | null;
  progression: ExerciseMetaProgression | null;
  state: { nextWeightDelta: number; failStreak: number };
};

export const exerciseMetaApi = {
  get: (routineId: string, reId: string) =>
    request<ExerciseMetaDTO>(`/api/routines/${routineId}/exercise/${reId}/meta`),
  put: (
    routineId: string,
    reId: string,
    data: {
      warmupScheme?: "NONE" | "STANDARD" | "LIGHT" | "CUSTOM";
      warmupCustom?: Array<{ pct: number; reps: number }> | null;
      progression?: ExerciseMetaProgression | null;
    },
  ) =>
    request<{ ok: true }>(`/api/routines/${routineId}/exercise/${reId}/meta`, {
      method: "PUT",
      body: body(data),
    }),
};

export type BackupRunDTO = {
  id: string;
  target: string;
  status: string;
  bytes: number | null;
  at: string;
};

export const backupApi = {
  runs: () => request<{ runs: BackupRunDTO[] }>("/api/backup/runs"),
  runNow: () => request<{ ok: true; run: BackupRunDTO }>("/api/backup/run-now", { method: "POST" }),
};

// ---------- Part 9: difficulty, variants, days, on-demand, challenges, account ----------

export const userApi = {
  /** PATCH /api/user/difficulty (§2) — global difficulty switch. */
  setDifficulty: (difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED") =>
    request<{ difficulty: string; oldDifficulty: string; switched: boolean; variantKept: string | null }>(
      "/api/user/difficulty",
      { method: "PATCH", body: body({ difficulty }) },
    ),
};

export const programStartApi = {
  /** POST /api/programs/:id/start { phaseIdx } (§4). */
  start: (routineId: string, phaseIdx?: number) =>
    request<{ routineId: string; variantId: string | null; difficulty: string; phaseIdx: number; dayIndex: number }>(
      `/api/programs/${routineId}/start`,
      { method: "POST", body: body({ ...(phaseIdx != null ? { phaseIdx } : {}) }) },
    ),
};

export const phaseOrderApi = {
  /** PUT /api/phases/:id/order { dayOrder } (§4) — PhaseOverride save. */
  put: (phaseId: string, dayOrder: string[]) =>
    request<{ phaseId: string; dayOrder: string[] }>(`/api/phases/${phaseId}/order`, {
      method: "PUT",
      body: body({ dayOrder }),
    }),
  /** DELETE /api/phases/:id/order — Reset Order (§4). */
  reset: (phaseId: string) =>
    request<{ ok: true }>(`/api/phases/${phaseId}/order`, { method: "DELETE" }),
};

export type DayOverridePatch = {
  seriesOrder?: string[][] | null;
  replacements?: Record<string, string> | null;
  notes?: Record<string, string> | null;
};

export const dayApi = {
  /** GET /api/days/:id (§5) — override-merged day detail. */
  get: (dayId: string) => request<DayDetailDTO>(`/api/days/${dayId}`),
  /** PUT /api/days/:id/override (§5.1/5.2/5.4). */
  putOverride: (dayId: string, patch: DayOverridePatch) =>
    request<{ ok: true }>(`/api/days/${dayId}/override`, { method: "PUT", body: body(patch) }),
  /** POST /api/days/:id/favorite (§5) — toggle DayFavorite. */
  favourite: (dayId: string) =>
    request<{ isFavorite: boolean }>(`/api/days/${dayId}/favorite`, { method: "POST" }),
  /** DELETE /api/days/:id/favorite. */
  unfavourite: (dayId: string) =>
    request<{ isFavorite: boolean }>(`/api/days/${dayId}/favorite`, { method: "DELETE" }),
  /** POST /api/days/:id/mark-off (§5) — workoutId feeds the client Undo. */
  markOff: (dayId: string) =>
    request<{ completedDayIds: string[]; advanced: boolean; workoutId: string | null }>(
      `/api/days/${dayId}/mark-off`,
      { method: "POST" },
    ),
  /** DELETE /api/days/:id/mark-off — Undo (marker + mark-off Log removed). */
  unmarkOff: (dayId: string) =>
    request<{ completedDayIds: string[]; removedWorkouts: number }>(
      `/api/days/${dayId}/mark-off`,
      { method: "DELETE" },
    ),
};

export const exerciseSuggestionsApi = {
  /** GET /api/exercises/:id/suggestions (§5.2). */
  list: (exerciseId: string) =>
    request<{ suggestions: ExerciseSuggestionDTO[] }>(`/api/exercises/${exerciseId}/suggestions`),
};

export type OnDemandQuery = {
  q?: string;
  category?: string;
  intensity?: string[];
  muscles?: string[];
  duration?: string;
  equipment?: string[];
};

export const onDemandApi = {
  /** GET /api/on-demand (§7) — server-side filtered sessions. */
  list: (params: OnDemandQuery = {}) => {
    const flat: Record<string, string | number | boolean | undefined> = {
      q: params.q,
      category: params.category,
      duration: params.duration,
      intensity: params.intensity?.join(","),
      muscles: params.muscles?.join(","),
      equipment: params.equipment?.join(","),
    };
    return request<unknown[]>(`/api/on-demand${qs(flat)}`);
  },
};

export const scheduleReconcileApi = {
  /** POST /api/schedule/reconcile-missed (§6) — idempotent MISSED sweep. */
  run: () =>
    request<{ missed: number; completed: number; checked: number }>("/api/schedule/reconcile-missed", {
      method: "POST",
    }),
};

export type ChallengeDTO = {
  id: string;
  name: string;
  startsOn: string;
  weeks: number;
  isActive: boolean;
  variantId: string;
  programName: string;
  userVariantId: string | null;
  joined: boolean;
};

export const challengesApi = {
  /** GET /api/challenges/active (§10). */
  active: () => request<{ challenge: ChallengeDTO | null }>("/api/challenges/active"),
  /** POST /api/challenges/:id/join (§10). */
  join: (challengeId: string) =>
    request<{ routineId: string; variantId: string | null; startsOn: string; weeks: number }>(
      `/api/challenges/${challengeId}/join`,
      { method: "POST" },
    ),
  /** DELETE /api/challenges/:id/dismiss (§10). */
  dismiss: (challengeId: string) =>
    request<{ ok: true }>(`/api/challenges/${challengeId}/dismiss`, { method: "DELETE" }),
};

export const supportApi = {
  /** POST /api/support (§9) — rate limit 5/day/user. */
  create: (data: { subject: string; body: string }) =>
    request<{ ok: true }>("/api/support", { method: "POST", body: body(data) }),
};

export const socialApi = {
  /** GET /api/account/social (§9). */
  list: () => request<{ providers: Array<{ id: string; label: string; linked: boolean }> }>("/api/account/social"),
  /** POST /api/account/social (§9) — link (env-gated in sandbox). */
  link: (providerId: string) =>
    request<{ ok: boolean; redirectUrl?: string }>("/api/account/social", {
      method: "POST",
      body: body({ provider: providerId, action: "link" }),
    }),
  /** DELETE /api/account/social (§9) — unlink. */
  unlink: (providerId: string) =>
    request<{ ok: boolean }>("/api/account/social", {
      method: "DELETE",
      body: body({ provider: providerId, action: "unlink" }),
    }),
};

export const accountDeleteApi = {
  /** POST /api/account/delete (§9) — soft delete + anonymize + sign out. */
  delete: () => request<{ ok: true }>("/api/account/delete", { method: "POST", body: body({ confirm: "DELETE" }) }),
};
