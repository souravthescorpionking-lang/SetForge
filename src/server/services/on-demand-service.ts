// ─────────────────────────────────────────────────────────────────────────────
// on-demand-service.ts — Part 9 §7 server: the On Demand catalog.
//
//   listOnDemand(userId, params)   GET /api/on-demand
//     ?q=&category=&intensity=A,B&musc=A,B&duration=LE20&equipment=A,B
//
// Vocabulary (spec §0/§1 → repo): OnDemandWorkout = Routine kind=SESSION with
// intensity/durationBand (LE20|20_45|GE45)/equipmentLevel (NONE|MINIMAL|GYM)/
// categories Json (WARMUP_REHAB|SPECIALIZATION|LIMITED_EQUIPMENT|LIMITED_TIME|
// COACH_FAVORITE)/isFeatured; its single RoutineDay holds the exercises.
// Favorites = DayFavorite rows (userId, dayId) — NOT Routine.isFavorite.
//
// All filtering runs SERVER-side per §7 ("State in URL. Server filtering.").
// Favorites/Coach picks chips are flags derived from the returned DTO fields
// (isFavorite/isFeatured) so the client applies them locally without a second
// round-trip. Owner-scoped by userId; deletedAt-null only.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { jsonStringArray } from "@/server/media";
import { deriveGroups } from "@/lib/grouping";
import type { Prisma } from "@prisma/client";
import type { OnDemandSessionDTO } from "@/lib/client/api";

/** §7 filter params (enum-validated by the route's Zod schema). */
export type OnDemandParams = {
  q?: string;
  category?: string;
  intensity?: string[];
  muscles?: string[];
  duration?: string;
  equipment?: string[];
};

// ---------- includes ----------

/** SESSION routines with their single day: exercises + exercise relation. */
const sessionInclude = {
  days: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      exercises: {
        orderBy: { sortOrder: "asc" as const },
        include: {
          exercise: { select: { id: true, name: true, primaryMuscles: true, deletedAt: true } },
          sets: { select: { sortOrder: true } },
        },
      },
    },
  },
} satisfies Prisma.RoutineInclude;

type SessionRoutine = Prisma.RoutineGetPayload<{ include: typeof sessionInclude }>;

// ---------- helpers ----------

const CATEGORIES = [
  "WARMUP_REHAB",
  "SPECIALIZATION",
  "LIMITED_EQUIPMENT",
  "LIMITED_TIME",
  "COACH_FAVORITE",
] as const;

/** Sets-based minute estimate (≈2.5 min per set incl. rest), rounded to 5. */
function estimateMinutes(totalSets: number): number | null {
  if (totalSets === 0) return null;
  return Math.max(5, Math.round((totalSets * 2.5) / 5) * 5);
}

/** The session's single WORKOUT day (kind=SESSION routines carry exactly one). */
function sessionDay(r: SessionRoutine) {
  return r.days.find((d) => (d.dayType ?? "WORKOUT") === "WORKOUT") ?? r.days[0] ?? null;
}

/** Muscles touched by the day's exercises: primaryMuscles union, de-duplicated. */
function dayMuscles(exercises: SessionRoutine["days"][number]["exercises"]): string[] {
  const s = new Set<string>();
  for (const re of exercises) {
    for (const m of jsonStringArray(re.exercise.primaryMuscles)) s.add(m);
  }
  return [...s];
}

// ---------- §7: the catalog ----------

/**
 * GET /api/on-demand — the user's SESSION-kind routines with §7 metadata,
 * server-filtered by q (routine name or any exercise name, case-insensitive),
 * category (any overlap with the routine's categories), intensity (any match),
 * duration (durationBand match), muscles (any overlap with the day's
 * exercises' primary muscles) and equipment (equipmentLevel match).
 */
export async function listOnDemand(userId: string, params: OnDemandParams = {}): Promise<OnDemandSessionDTO[]> {
  const routines = await db.routine.findMany({
    where: { userId, deletedAt: null, kind: "SESSION" },
    include: sessionInclude,
    orderBy: { sortOrder: "asc" },
  });

  // DayFavorite rows → per-day favourite lookup (§7 Favorites chip source).
  const dayIds = routines.map((r) => sessionDay(r)?.id).filter((id): id is string => !!id);
  const favourites = await db.dayFavorite.findMany({ where: { userId, dayId: { in: dayIds } } });
  const favouriteDayIds = new Set(favourites.map((f) => f.dayId));

  const q = params.q?.trim().toLowerCase() ?? "";
  const category = CATEGORIES.includes(params.category as (typeof CATEGORIES)[number]) ? params.category : undefined;
  const intensities = new Set((params.intensity ?? []).filter(Boolean));
  const muscles = new Set((params.muscles ?? []).filter(Boolean));
  const duration = params.duration;
  const equipment = new Set((params.equipment ?? []).filter(Boolean));

  const out: OnDemandSessionDTO[] = [];
  for (const r of routines) {
    const day = sessionDay(r);
    const categories = jsonStringArray(r.categories).filter((c) =>
      (CATEGORIES as readonly string[]).includes(c),
    );

    // ---- server-side filters ----
    if (q) {
      const inName = r.name.toLowerCase().includes(q);
      const inExercises = (day?.exercises ?? []).some((re) =>
        re.exercise.name.toLowerCase().includes(q),
      );
      if (!inName && !inExercises) continue;
    }
    if (category && !categories.includes(category)) continue;
    if (intensities.size > 0 && !intensities.has(r.intensity ?? "")) continue;
    if (duration && r.durationBand !== duration) continue;
    if (equipment.size > 0 && !equipment.has(r.equipmentLevel ?? "")) continue;
    if (muscles.size > 0) {
      const touched = dayMuscles(day?.exercises ?? []);
      if (!touched.some((m) => muscles.has(m))) continue;
    }

    const exercises = day?.exercises ?? [];
    const totalSets = exercises.reduce((n, re) => n + re.sets.length, 0);
    const minutes = day?.estMinutes ?? r.estMinutes ?? estimateMinutes(totalSets);
    const dayId = day?.id ?? null;
    const seriesCount = deriveGroups(exercises).length;

    out.push({
      id: r.id,
      dayId,
      name: r.name,
      minutes,
      intensity: r.intensity ?? null,
      durationBand: r.durationBand ?? null,
      equipmentLevel: r.equipmentLevel ?? null,
      categories,
      isFeatured: r.isFeatured,
      seriesCount,
      isFavorite: dayId != null && favouriteDayIds.has(dayId),
      exerciseNames: exercises
        .map((re) => re.exercise.name)
        .filter((name, i, all) => all.indexOf(name) === i)
        .slice(0, 3),
    });
  }

  // Stable, useful default order: coach picks first, then name.
  out.sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}
