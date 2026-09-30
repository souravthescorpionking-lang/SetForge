// ─────────────────────────────────────────────────────────────────────────────
// program-catalog.ts — Part 9 §3/§4 server: variant-aware programs catalog +
// program detail + per-user phase day-order overrides.
//
//   getProgramCatalog(userId, difficulty?, kind?)    GET /api/programs
//   getProgramDetail(userId, routineId, difficulty?) GET /api/programs/:id
//   putPhaseOrder(userId, phaseId, dayOrder)         PUT   /api/phases/:id/order
//   resetPhaseOrder(userId, phaseId)                 DELETE /api/phases/:id/order
//
// Vocabulary (spec §0 → repo): Program = Routine(kind=ROUTINE) · Variant =
// ProgramVariant (routineId+difficulty unique) · Phase = ProgramPhase · Day =
// RoutineDay (phaseId, dayType WORKOUT|REST, estMinutes). Effective day order
// (template order + per-user PhaseOverride) comes from program-service's
// effectiveVariantDays — the SAME domain the cursor and schedule generation
// use, so the §4 Program tab previews exactly what the engine will run.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { dayKey } from "@/lib/dates";
import { badRequest, notFound } from "../http";
import { jsonStringArray } from "@/server/media";
import { DIFFICULTIES, type Difficulty } from "@/lib/constants";
import type {
  ProgramDetailDTO,
  ProgramDetailDayDTO,
  ProgramDetailPhaseDTO,
  ProgramSummaryDTO,
} from "@/lib/types";
import type { Prisma } from "@prisma/client";
import {
  applyProgramRules,
  effectiveVariantDays,
  getUserDifficulty,
  variantForDifficulty,
} from "./program-service";

// ---------- includes ----------

/** Lean catalog include: variant shells (phase ids only) + day phase links + exercise counts. */
const catalogInclude = {
  variants: { include: { phases: { select: { id: true } } } },
  days: { select: { id: true, phaseId: true, dayType: true, _count: { select: { exercises: true } } } },
} satisfies Prisma.RoutineInclude;

type CatalogRoutine = Prisma.RoutineGetPayload<{ include: typeof catalogInclude }>;

/** Full routine tree — structurally identical to program-service's RoutineFull
 *  (variants with phases + days with exercises), so effectiveVariantDays
 *  accepts it without a cast. */
const dayInclude = {
  exercises: {
    orderBy: { sortOrder: "asc" as const },
    include: { exercise: { include: { category: true } }, sets: { orderBy: { sortOrder: "asc" as const } } },
  },
} satisfies Prisma.RoutineDayInclude;

const routineInclude = {
  days: { orderBy: { sortOrder: "asc" as const }, include: dayInclude },
  variants: { include: { phases: { orderBy: { idx: "asc" as const } } } },
} satisfies Prisma.RoutineInclude;

type DetailRoutine = Prisma.RoutineGetPayload<{ include: typeof routineInclude }>;

// ---------- helpers ----------

/** Defensive difficulty guard (routes Zod-validate; direct callers get the same safety). */
function normalizeDifficulty(difficulty?: string | null): Difficulty | undefined {
  return (DIFFICULTIES as readonly string[]).includes(difficulty ?? "")
    ? (difficulty as Difficulty)
    : undefined;
}

/** Stable variant order: Beginner → Intermediate → Advanced. */
const difficultyRank = (d: string) => {
  const i = (DIFFICULTIES as readonly string[]).indexOf(d);
  return i < 0 ? DIFFICULTIES.length : i;
};

function toDetailDay(d: { id: string; name: string; dayType: string | null; estMinutes: number | null }): ProgramDetailDayDTO {
  return { id: d.id, name: d.name, dayType: d.dayType ?? "WORKOUT", estMinutes: d.estMinutes ?? null };
}

/** Distinct completed days for a followed routine (§3 "{daysDone} Days" pill):
 *  ActiveRoutine.completedDayIds ∪ dayIds with a finished Workout. */
async function completedDayIds(userId: string, routineId: string, completedJson: unknown): Promise<Set<string>> {
  const ids = new Set<string>(jsonStringArray(completedJson));
  const done = await db.workout.findMany({
    where: {
      userId,
      sourceRoutineId: routineId,
      finishedAt: { not: null },
      removedAt: null,
      sourceDayId: { not: null },
    },
    select: { sourceDayId: true },
  });
  for (const w of done) if (w.sourceDayId) ids.add(w.sourceDayId);
  return ids;
}

// ---------- §3: catalog ----------

/**
 * GET /api/programs?kind=&difficulty= — routines (kind filters ROUTINE |
 * SESSION; omit = all) with per-program catalog fields at the requested
 * difficulty (default = the user's difficulty): variantExists, phaseCount,
 * daysPerWeek, dayCount. Superset of the legacy ProgramSummaryDTO so existing
 * callers keep working. Owner-scoped by userId.
 */
export async function getProgramCatalog(
  userId: string,
  difficulty?: string,
  kind?: "ROUTINE" | "SESSION",
): Promise<ProgramSummaryDTO[]> {
  await applyProgramRules(userId); // keep the lazy cursor/status rules convergent on every list read
  const resolved = normalizeDifficulty(difficulty) ?? (await getUserDifficulty(userId));

  const routines = await db.routine.findMany({
    where: { userId, deletedAt: null, ...(kind ? { kind } : {}) },
    include: catalogInclude,
    orderBy: { sortOrder: "asc" },
  });
  const active = await db.activeRoutine.findUnique({ where: { userId } });

  const lastUsed = await db.workout.groupBy({
    by: ["sourceRoutineId"],
    where: { userId, sourceRoutineId: { not: null } },
    _max: { date: true },
  });
  const lastUsedMap = new Map(lastUsed.map((r) => [r.sourceRoutineId!, r._max.date ?? null]));

  // daysDone only exists for the currently followed program (§3 pill).
  const currentDoneIds = active
    ? await completedDayIds(userId, active.routineId, active.completedDayIds)
    : new Set<string>();

  return routines.map((r): ProgramSummaryDTO => {
    const isFollowed = active?.routineId === r.id;
    const isSession = (r.kind ?? "ROUTINE") === "SESSION";
    // SESSIONs and variant-less custom programs carry no variant tree — the
    // routine itself is the unit (implicit single phase, §4 detail parity), so
    // they are always "available" and never dim. Template programs dim only
    // when they have variants but none at the requested difficulty.
    const variant = isSession ? null : (r.variants.find((v) => v.difficulty === resolved) ?? null);
    const noTree = isSession || r.variants.length === 0;
    const variantExists = noTree ? true : !!variant;

    let dayCount: number;
    let restCount: number;
    let exerciseCount: number;
    if (variant) {
      const phaseIds = new Set(variant.phases.map((p) => p.id));
      const days = r.days.filter((d) => d.phaseId != null && phaseIds.has(d.phaseId));
      dayCount = days.length;
      restCount = days.filter((d) => (d.dayType ?? "WORKOUT") === "REST").length;
      exerciseCount = days.reduce((acc, d) => acc + ((d.dayType ?? "WORKOUT") === "REST" ? 0 : d._count.exercises), 0);
    } else {
      dayCount = r.days.length;
      restCount = r.days.filter((d) => (d.dayType ?? "WORKOUT") === "REST").length;
      exerciseCount = r.days.reduce((acc, d) => acc + ((d.dayType ?? "WORKOUT") === "REST" ? 0 : d._count.exercises), 0);
    }

    const last = lastUsedMap.get(r.id) ?? null;
    return {
      id: r.id,
      name: r.name,
      notes: r.notes ?? null,
      kind: r.kind ?? "ROUTINE",
      dayCount,
      restCount,
      exerciseCount,
      lastUsedAt: last ? dayKey(last) : null,
      isFollowed,
      cursor: isFollowed
        ? {
            dayIndex: Math.max(0, active?.cursorDayIndex ?? 0),
            // cursor indexes the ACTIVE variant's day domain (legacy follows: whole routine)
            dayCount: Math.max(1, activeVariantDayCount(r, active?.variantId ?? null)),
          }
        : null,
      // ---- Part 9 §3: catalog fields at the requested difficulty ----
      tagline: r.tagline ?? null,
      weeks: r.weeks ?? null,
      daysDone: isFollowed ? currentDoneIds.size : 0,
      variantExists,
      phaseCount: variant ? variant.phases.length : noTree ? 1 : 0,
      daysPerWeek: variant ? (variant.daysPerWeek ?? null) : (r.daysPerWeek ?? null),
    };
  });
}

/** Day count of the ACTIVE variant (the cursor's domain); legacy follows count the whole routine. */
function activeVariantDayCount(r: CatalogRoutine, variantId: string | null): number {
  const v = variantId ? (r.variants.find((x) => x.id === variantId) ?? null) : null;
  if (!v) return r.days.length;
  const phaseIds = new Set(v.phases.map((p) => p.id));
  return r.days.filter((d) => d.phaseId != null && phaseIds.has(d.phaseId)).length;
}

// ---------- §4: program detail ----------

/**
 * GET /api/programs/:id?difficulty= — the whole variant tree with per-phase
 * days in EFFECTIVE order (PhaseOverride applied via effectiveVariantDays),
 * plus tagline/description/weeks/highlights and current-program cursor info.
 * `variant` is the exact match at the difficulty; `fallbackVariant` applies
 * variantForDifficulty semantics (requested → routine difficulty → first
 * variant; variant-less custom programs get an implicit single-phase
 * pseudo-variant).
 */
export async function getProgramDetail(
  userId: string,
  routineId: string,
  difficulty?: string,
): Promise<ProgramDetailDTO> {
  const resolved = normalizeDifficulty(difficulty) ?? (await getUserDifficulty(userId));
  const r = await db.routine.findFirst({
    where: { id: routineId, userId, deletedAt: null },
    include: routineInclude,
  });
  if (!r) throw notFound("Program not found");

  const active = await db.activeRoutine.findUnique({ where: { userId } });
  const isCurrent = active?.routineId === r.id;
  const doneIds = isCurrent && active ? await completedDayIds(userId, r.id, active.completedDayIds) : new Set<string>();

  const allPhaseIds = r.variants.flatMap((v) => v.phases.map((p) => p.id));
  const overrides =
    allPhaseIds.length > 0
      ? await db.phaseOverride.findMany({ where: { userId, phaseId: { in: allPhaseIds } } })
      : [];
  const overriddenPhaseIds = new Set(overrides.map((o) => o.phaseId));

  // ---- per-variant phase tree (days grouped in effective order) ----
  const sortedVariants = [...r.variants].sort((a, b) => difficultyRank(a.difficulty) - difficultyRank(b.difficulty));
  const pickedFallback = r.variants.length > 0 ? variantForDifficulty(r, resolved) : null;
  const variantDTOs: NonNullable<ProgramDetailDTO["variant"]>[] = [];
  let fallbackDTO: NonNullable<ProgramDetailDTO["variant"]> | null = null;
  for (const v of sortedVariants) {
    const effDays = await effectiveVariantDays(userId, r, v.id);
    const byPhase = new Map<string, typeof effDays>();
    for (const d of effDays) {
      if (!d.phaseId) continue;
      if (!byPhase.has(d.phaseId)) byPhase.set(d.phaseId, []);
      byPhase.get(d.phaseId)!.push(d);
    }
    const dto = {
      id: v.id,
      difficulty: v.difficulty,
      daysPerWeek: v.daysPerWeek ?? null,
      equipment: jsonStringArray(v.equipment),
      phases: v.phases.map(
        (p): ProgramDetailPhaseDTO => ({
          id: p.id,
          idx: p.idx,
          name: p.name,
          overview: p.overview ?? null,
          minutesMin: p.minutesMin ?? null,
          minutesMax: p.minutesMax ?? null,
          hasPhaseOverride: overriddenPhaseIds.has(p.id),
          isImplicit: false,
          days: (byPhase.get(p.id) ?? []).map(toDetailDay),
        }),
      ),
    };
    if (pickedFallback?.id === v.id) fallbackDTO = dto;
    variantDTOs.push(dto);
  }

  // ---- variant-less custom program: one implicit phase with every day ----
  let implicitVariant: ProgramDetailDTO["fallbackVariant"] = null;
  if (r.variants.length === 0) {
    const effDays = await effectiveVariantDays(userId, r, null);
    implicitVariant = {
      id: `${r.id}:implicit`,
      difficulty: r.difficulty ?? resolved,
      daysPerWeek: r.daysPerWeek ?? null,
      equipment: [],
      phases: [
        {
          id: `${r.id}:implicit`,
          idx: 0,
          name: "Main",
          overview: null,
          minutesMin: null,
          minutesMax: null,
          hasPhaseOverride: false,
          isImplicit: true,
          days: effDays.map(toDetailDay),
        },
      ],
    };
  }

  const exact = variantDTOs.find((v) => v.difficulty === resolved) ?? null;
  const fallback = implicitVariant ?? fallbackDTO;

  // ---- current-program cursor (phase derived from the ACTIVE variant's day domain) ----
  let cursorPhaseIdx: number | null = null;
  let cursorDayIndex: number | null = null;
  if (isCurrent && active) {
    const activeVariantDTO = active.variantId != null ? (variantDTOs.find((v) => v.id === active.variantId) ?? null) : null;
    const activeDays = await effectiveVariantDays(userId, r, active.variantId ?? null);
    cursorDayIndex = activeDays.length > 0 ? Math.min(active.cursorDayIndex, activeDays.length - 1) : 0;
    const cursorDay = activeDays[cursorDayIndex] ?? null;
    const activePhases =
      activeVariantDTO?.phases ??
      (active.variantId == null ? (implicitVariant?.phases ?? null) : null);
    cursorPhaseIdx =
      cursorDay?.phaseId && activePhases && activePhases.some((p) => p.id === cursorDay.phaseId)
        ? activePhases.findIndex((p) => p.id === cursorDay.phaseId)
        : (active.cursorPhaseIdx ?? 0);
  }

  return {
    id: r.id,
    name: r.name,
    notes: r.notes ?? null,
    kind: r.kind ?? "ROUTINE",
    tagline: r.tagline ?? null,
    description: r.description ?? null,
    weeks: r.weeks ?? null,
    highlights: jsonStringArray(r.highlights),
    userDifficulty: resolved,
    routineDifficulty: r.difficulty ?? null,
    variants: variantDTOs,
    variant: exact,
    fallbackVariant: fallback,
    isCurrent,
    cursorPhaseIdx,
    cursorDayIndex,
    daysDone: isCurrent ? doneIds.size : 0,
  };
}

// ---------- §4: per-user phase day-order overrides ----------

/** Phase + owner check: 404 unless the phase belongs to one of the user's routines. */
async function loadOwnedPhase(userId: string, phaseId: string) {
  const phase = await db.programPhase.findUnique({
    where: { id: phaseId },
    include: {
      variant: { include: { routine: { select: { userId: true } } } },
      days: { select: { id: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!phase || phase.variant.routine.userId !== userId) throw notFound("Phase not found");
  return phase;
}

/**
 * PUT /api/phases/:id/order { dayOrder } (§4 Program tab drag). Persists the
 * per-user PhaseOverride (unknown day ids are dropped; days missing from the
 * order append at the end — see effectiveVariantDays).
 */
export async function putPhaseOrder(userId: string, phaseId: string, dayOrder: string[]) {
  const phase = await loadOwnedPhase(userId, phaseId);
  const known = new Set(phase.days.map((d) => d.id));
  const filtered = dayOrder.filter((id) => known.has(id));
  if (filtered.length === 0) throw badRequest("dayOrder must list this phase's days");
  await db.phaseOverride.upsert({
    where: { userId_phaseId: { userId, phaseId } },
    create: { id: uuid7(), userId, phaseId, dayOrder: JSON.stringify(filtered) },
    update: { dayOrder: JSON.stringify(filtered) },
  });
  return { phaseId, dayOrder: filtered };
}

/** DELETE /api/phases/:id/order — Reset Order (§4): drop the override, template order wins again. */
export async function resetPhaseOrder(userId: string, phaseId: string) {
  await loadOwnedPhase(userId, phaseId);
  await db.phaseOverride.deleteMany({ where: { userId, phaseId } });
  return { ok: true as const };
}
