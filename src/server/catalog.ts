// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — Exercise catalog (§3). Loads catalog/exercises.v1.json (builtin) or
// CATALOG_URL (cached to disk with ETag) into the SystemCatalog table on boot.
// Upsert by key; user exercises are never overwritten — a one-time idempotent
// backfill fills muscles/equipment/notes for exact-name matches (nulls only).
// ─────────────────────────────────────────────────────────────────────────────
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEnv } from "@/server/env";
import { MUSCLES, EQUIPMENT } from "@/lib/constants";
import { jsonStringArray } from "@/server/media";

const muscleSchema = z.string(); // validated against MUSCLES below (lenient: unknown values dropped)
const equipmentSchema = z.string();

export const catalogEntrySchema = z.object({
  key: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  type: z.string().min(1).max(40).default("WEIGHT_REPS"),
  primaryMuscles: z.array(muscleSchema).default([]),
  secondaryMuscles: z.array(muscleSchema).default([]),
  equipment: z.array(equipmentSchema).default([]),
  setupNotes: z.string().max(600).nullable().optional(),
  targetNotes: z.string().max(600).nullable().optional(),
  trainerTip: z.string().max(600).nullable().optional(),
  thumbnail: z.string().max(500).nullable().optional(),
  video: z.string().max(500).nullable().optional(),
});

export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

const muscleSet = new Set<string>(MUSCLES);
const equipmentSet = new Set<string>(EQUIPMENT);

function filterMuscles(values: string[]): string[] {
  return [...new Set(values.filter((v) => muscleSet.has(v)))];
}
function filterEquipment(values: string[]): string[] {
  return [...new Set(values.filter((v) => equipmentSet.has(v)))];
}

function resolveMediaUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const env = getEnv();
  const base = env.CATALOG_MEDIA_BASE_URL?.replace(/\/$/, "");
  if (!base) return null; // relative URL with no base → treat as absent (media optional)
  return `${base}/${raw.replace(/^\//, "")}`;
}

const BUILTIN_PATH = path.resolve(process.cwd(), "catalog/exercises.v1.json");
const URL_CACHE_PATH = path.resolve(process.cwd(), ".data/catalog-cache.json");

async function readBuiltin(): Promise<string | null> {
  try {
    return await readFile(BUILTIN_PATH, "utf8");
  } catch {
    return null; // catalog not authored yet — degrade gracefully
  }
}

async function readFromUrl(): Promise<string | null> {
  const env = getEnv();
  if (!env.CATALOG_URL) return null;
  let etag: string | undefined;
  try {
    const cached = JSON.parse(await readFile(URL_CACHE_PATH, "utf8")) as { etag?: string; body?: string };
    etag = cached.etag;
  } catch {
    /* no cache */
  }
  const res = await fetch(env.CATALOG_URL, {
    headers: etag ? { "if-none-match": etag } : {},
  }).catch(() => null);
  if (!res) {
    try {
      return (JSON.parse(await readFile(URL_CACHE_PATH, "utf8")) as { body?: string }).body ?? null;
    } catch {
      return null;
    }
  }
  if (res.status === 304 && etag) {
    try {
      return (JSON.parse(await readFile(URL_CACHE_PATH, "utf8")) as { body?: string }).body ?? null;
    } catch {
      return null;
    }
  }
  if (!res.ok) return null;
  const body = await res.text();
  const newEtag = res.headers.get("etag") ?? undefined;
  try {
    await mkdir(path.dirname(URL_CACHE_PATH), { recursive: true });
    await writeFile(URL_CACHE_PATH, JSON.stringify({ etag: newEtag, body }), "utf8");
  } catch {
    /* cache write best-effort */
  }
  return body;
}

export interface CatalogLoadResult {
  entries: number;
  source: "builtin" | "url" | "skipped";
}

/** Load + upsert the catalog into SystemCatalog. Safe to call on every boot. */
export async function loadSystemCatalog(): Promise<CatalogLoadResult> {
  const env = getEnv();
  const raw = env.CATALOG_SOURCE === "url" ? await readFromUrl() : await readBuiltin();
  if (!raw) {
    console.warn("[catalog] no catalog content available (builtin file missing or URL unreachable) — skipping");
    return { entries: 0, source: "skipped" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("[catalog] catalog JSON is malformed — skipping");
    return { entries: 0, source: "skipped" };
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { exercises?: unknown }).exercises;
  if (!Array.isArray(list)) {
    console.error("[catalog] catalog JSON is not an array (or {exercises:[]}) — skipping");
    return { entries: 0, source: "skipped" };
  }

  const existingCount = await db.systemCatalog.count().catch(() => 0);
  if (existingCount >= list.length) {
    return { entries: existingCount, source: "builtin" };
  }

  let count = 0;
  for (const item of list) {
    const entry = catalogEntrySchema.safeParse(item);
    if (!entry.success) continue; // skip invalid entries silently (logged count only)
    const e = entry.data;
    await db.systemCatalog.upsert({
      where: { key: e.key },
      create: {
        key: e.key,
        name: e.name,
        category: e.category,
        type: e.type,
        primaryMuscles: filterMuscles(e.primaryMuscles),
        secondaryMuscles: filterMuscles(e.secondaryMuscles),
        equipment: filterEquipment(e.equipment),
        setupNotes: e.setupNotes ?? null,
        targetNotes: e.targetNotes ?? null,
        trainerTip: e.trainerTip ?? null,
        thumbnailUrl: resolveMediaUrl(e.thumbnail),
        videoUrl: resolveMediaUrl(e.video),
      },
      update: {
        name: e.name,
        category: e.category,
        type: e.type,
        primaryMuscles: filterMuscles(e.primaryMuscles),
        secondaryMuscles: filterMuscles(e.secondaryMuscles),
        equipment: filterEquipment(e.equipment),
        setupNotes: e.setupNotes ?? null,
        targetNotes: e.targetNotes ?? null,
        trainerTip: e.trainerTip ?? null,
        thumbnailUrl: resolveMediaUrl(e.thumbnail),
        videoUrl: resolveMediaUrl(e.video),
      },
    });
    count += 1;
  }
  console.log(`[catalog] loaded ${count} entries (source: ${env.CATALOG_SOURCE === "url" ? "url" : "builtin"})`);
  return { entries: count, source: env.CATALOG_SOURCE === "url" ? "url" : "builtin" };
}

const BACKFILL_FLAG = "catalog_backfill_v1";

/**
 * One-time (idempotent, logged) backfill: user exercises whose exact name matches
 * a catalog entry gain muscles/equipment/notes — only where the user's values are
 * null/empty. Never overwrites user edits.
 */
export async function backfillUserExercises(): Promise<number> {
  const done = await db.systemMeta.findUnique({ where: { key: BACKFILL_FLAG } });
  if (done) return 0;

  const catalog = await db.systemCatalog.findMany();
  const byName = new Map(catalog.map((c) => [c.name.toLowerCase(), c]));

  const users = await db.user.findMany({ select: { id: true } });
  let filled = 0;
  for (const u of users) {
    const exercises = await db.exercise.findMany({ where: { userId: u.id, deletedAt: null } });
    for (const ex of exercises) {
      const match = byName.get(ex.name.toLowerCase());
      if (!match) continue;
      const patch: Record<string, unknown> = {};
      const primary = jsonStringArray(ex.primaryMuscles);
      const secondary = jsonStringArray(ex.secondaryMuscles);
      const equipment = jsonStringArray(ex.equipment);
      if (primary.length === 0 && match.primaryMuscles) patch.primaryMuscles = match.primaryMuscles;
      if (secondary.length === 0 && match.secondaryMuscles) patch.secondaryMuscles = match.secondaryMuscles;
      if (equipment.length === 0 && match.equipment) patch.equipment = match.equipment;
      if (!ex.setupNotes && match.setupNotes) patch.setupNotes = match.setupNotes;
      if (!ex.targetNotes && match.targetNotes) patch.targetNotes = match.targetNotes;
      if (!ex.trainerTip && match.trainerTip) patch.trainerTip = match.trainerTip;
      if (!ex.catalogKey) patch.catalogKey = match.key;
      if (Object.keys(patch).length > 0) {
        await db.exercise.update({ where: { id: ex.id }, data: patch });
        filled += 1;
      }
    }
  }

  await db.systemMeta.upsert({
    where: { key: BACKFILL_FLAG },
    create: { key: BACKFILL_FLAG, value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });
  console.log(`[catalog] backfilled ${filled} user exercise rows (idempotent, once)`);
  return filled;
}
