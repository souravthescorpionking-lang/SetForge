// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — Library service (§4.1/§4.2). Merges the SystemCatalog with the user's
// adopted exercises into one filterable list; "adopt" copies a catalog row into
// the user's Exercise table (catalogKey link, muscles/equipment/notes carried).
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

function toJson(v: unknown): Prisma.InputJsonValue {
  return (v == null ? [] : v) as Prisma.InputJsonValue;
}
import { notFound, conflict } from "@/server/http";
import { uuid7 } from "@/lib/uuid7";
import { jsonStringArray } from "@/server/media";
import type { LibraryEntryDTO } from "@/lib/types";

export interface LibraryQuery {
  search?: string;
  muscle?: string[];
  equipment?: string[];
  fav?: boolean;
  mine?: boolean;
}

function entryFromCatalog(row: {
  key: string; name: string; category: string; type: string;
  primaryMuscles: unknown; secondaryMuscles: unknown; equipment: unknown;
  setupNotes: string | null; targetNotes: string | null; trainerTip: string | null;
  thumbnailUrl: string | null; videoUrl: string | null;
}, adopted?: { exerciseId: string; isFavorite: boolean }): LibraryEntryDTO {
  return {
    key: row.key,
    name: row.name,
    category: row.category,
    type: row.type,
    primaryMuscles: jsonStringArray(row.primaryMuscles),
    secondaryMuscles: jsonStringArray(row.secondaryMuscles),
    equipment: jsonStringArray(row.equipment),
    setupNotes: row.setupNotes,
    targetNotes: row.targetNotes,
    trainerTip: row.trainerTip,
    thumbnailUrl: row.thumbnailUrl,
    videoUrl: row.videoUrl,
    adopted: Boolean(adopted),
    exerciseId: adopted?.exerciseId ?? null,
    isFavorite: adopted?.isFavorite ?? false,
  };
}

/** GET /api/library — merged catalog + user list, filterable. */
export async function listLibrary(userId: string, query: LibraryQuery): Promise<LibraryEntryDTO[]> {
  const [catalog, userExercises] = await Promise.all([
    db.systemCatalog.findMany({ orderBy: { name: "asc" } }),
    db.exercise.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, name: true, isFavorite: true, catalogKey: true, categoryId: true, category: { select: { name: true } } },
    }),
  ]);

  const adoptedByKey = new Map<string, { exerciseId: string; isFavorite: boolean; name: string; category: string }>();
  for (const ex of userExercises) {
    if (ex.catalogKey) adoptedByKey.set(ex.catalogKey, { exerciseId: ex.id, isFavorite: ex.isFavorite, name: ex.name, category: ex.category?.name ?? "" });
  }

  let entries: LibraryEntryDTO[] = catalog.map((row) =>
    entryFromCatalog(row, adoptedByKey.get(row.key) ? { exerciseId: adoptedByKey.get(row.key)!.exerciseId, isFavorite: adoptedByKey.get(row.key)!.isFavorite } : undefined),
  );

  // User-custom exercises that are not catalog rows still surface under "Mine"/"Favourites"
  // (catalogKey null or unknown): rendered with their own key `custom:{id}`.
  const catalogKeys = new Set(catalog.map((c) => c.key));
  const customs: LibraryEntryDTO[] = userExercises
    .filter((ex) => !ex.catalogKey || !catalogKeys.has(ex.catalogKey))
    .map((ex) => ({
      key: `custom:${ex.id}`,
      name: ex.name,
      category: ex.category?.name ?? "",
      type: "WEIGHT_REPS",
      primaryMuscles: [],
      secondaryMuscles: [],
      equipment: [],
      setupNotes: null,
      targetNotes: null,
      trainerTip: null,
      thumbnailUrl: null,
      videoUrl: null,
      adopted: true,
      exerciseId: ex.id,
      isFavorite: ex.isFavorite,
    }));
  entries = [...entries, ...customs];

  if (query.fav) entries = entries.filter((e) => e.adopted && e.isFavorite);
  if (query.mine) entries = entries.filter((e) => e.adopted);
  if (query.muscle && query.muscle.length > 0) {
    const wanted = new Set(query.muscle);
    entries = entries.filter((e) => [...e.primaryMuscles, ...e.secondaryMuscles].some((m) => wanted.has(m)));
  }
  if (query.equipment && query.equipment.length > 0) {
    const wanted = new Set(query.equipment);
    entries = entries.filter((e) => e.equipment.some((eq) => wanted.has(eq)));
  }
  if (query.search) {
    const needle = query.search.trim().toLowerCase();
    if (needle) entries = entries.filter((e) => e.name.toLowerCase().includes(needle));
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

/** GET /api/library/:key — single catalog entry (+ adoption state). */
export async function getLibraryEntry(userId: string, key: string): Promise<LibraryEntryDTO> {
  const row = await db.systemCatalog.findUnique({ where: { key } });
  if (!row) throw notFound("Catalog entry not found");
  const adopted = row.key.startsWith("custom:")
    ? null
    : await db.exercise.findFirst({ where: { userId, catalogKey: key, deletedAt: null }, select: { id: true, isFavorite: true } });
  return entryFromCatalog(row, adopted ? { exerciseId: adopted.id, isFavorite: adopted.isFavorite } : undefined);
}

/** Resolve (or create) the user category matching a catalog category name. */
async function resolveCategoryId(userId: string, name: string): Promise<string> {
  const existing = await db.category.findFirst({ where: { userId, name }, select: { id: true } });
  if (existing) return existing.id;
  const count = await db.category.count({ where: { userId } });
  return db.category
    .create({ data: { id: uuid7(), userId, name, sortOrder: count } })
    .then((c) => c.id);
}

export interface AdoptResult {
  exerciseId: string;
  created: boolean;
  favourite: boolean;
}

/**
 * POST /api/library/:key/adopt — copy a catalog row into the user's exercises.
 * Exact-name collisions attach the catalogKey + backfill nulls instead of failing.
 * `favourite: true` also stars it (catalog star = adopt-as-favourite).
 */
export async function adoptExercise(userId: string, key: string, opts?: { favourite?: boolean }): Promise<AdoptResult> {
  const row = await db.systemCatalog.findUnique({ where: { key } });
  if (!row) throw notFound("Catalog entry not found");

  const already = await db.exercise.findFirst({ where: { userId, catalogKey: key, deletedAt: null } });
  if (already) {
    if (opts?.favourite && !already.isFavorite) {
      await db.exercise.update({ where: { id: already.id }, data: { isFavorite: true } });
      return { exerciseId: already.id, created: false, favourite: true };
    }
    return { exerciseId: already.id, created: false, favourite: already.isFavorite };
  }

  const categoryId = await resolveCategoryId(userId, row.category);

  // Same-name user exercise → attach + backfill instead of violating (userId, name).
  const sameName = await db.exercise.findFirst({ where: { userId, name: row.name, deletedAt: null } });
  if (sameName) {
    await db.exercise.update({
      where: { id: sameName.id },
      data: {
        catalogKey: key,
        ...(jsonStringArray(sameName.primaryMuscles).length === 0 ? { primaryMuscles: toJson(row.primaryMuscles) } : {}),
        ...(jsonStringArray(sameName.secondaryMuscles).length === 0 ? { secondaryMuscles: toJson(row.secondaryMuscles) } : {}),
        ...(jsonStringArray(sameName.equipment).length === 0 ? { equipment: toJson(row.equipment) } : {}),
        ...(!sameName.setupNotes && row.setupNotes ? { setupNotes: row.setupNotes } : {}),
        ...(!sameName.targetNotes && row.targetNotes ? { targetNotes: row.targetNotes } : {}),
        ...(!sameName.trainerTip && row.trainerTip ? { trainerTip: row.trainerTip } : {}),
        ...(opts?.favourite ? { isFavorite: true } : {}),
      },
    });
    return { exerciseId: sameName.id, created: false, favourite: opts?.favourite ?? sameName.isFavorite };
  }

  const id = uuid7();
  await db.exercise.create({
    data: {
      id,
      userId,
      categoryId,
      name: row.name,
      type: row.type,
      primaryMuscles: row.primaryMuscles ?? [],
      secondaryMuscles: row.secondaryMuscles ?? [],
      equipment: row.equipment ?? [],
      setupNotes: row.setupNotes,
      targetNotes: row.targetNotes,
      trainerTip: row.trainerTip,
      catalogKey: key,
      isFavorite: opts?.favourite ?? false,
    },
  });
  return { exerciseId: id, created: true, favourite: opts?.favourite ?? false };
}

/** POST /api/library/adopt-many {keys} — bulk adopt (used by "Add all favourites…"). */
export async function adoptMany(userId: string, keys: string[]): Promise<{ adopted: number }> {
  let adopted = 0;
  for (const key of keys.slice(0, 500)) {
    const res = await adoptExercise(userId, key).catch(() => null);
    if (res) adopted += 1;
  }
  if (adopted === 0) throw conflict("No catalog entries were adopted");
  return { adopted };
}
