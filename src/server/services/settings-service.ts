// User settings + plate inventory.
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { mapPlate } from "../mappers";
import { notFound } from "../http";

export async function getSettings(userId: string) {
  const s = await db.userSettings.findUnique({ where: { userId } });
  if (!s) throw notFound("Settings not found");
  const { id: _id, userId: _userId, createdAt: _c, updatedAt: _u, ...rest } = s;
  return rest;
}

export async function updateSettings(
  userId: string,
  patch: Partial<{
    theme: string;
    unitSystem: string;
    weekStart: number;
    defaultWeightIncrement: number;
    homeSetsShown: number;
    showCategory: boolean;
    trackPR: boolean;
    markSetsComplete: boolean;
    autoSelectNextSet: boolean;
    keepScreenOn: boolean;
    estOneRmRepLimit: number;
    weeklyWorkoutTarget: number;
  }>,
) {
  const existing = await db.userSettings.findUnique({ where: { userId } });
  if (!existing) throw notFound("Settings not found");
  const updated = await db.userSettings.update({ where: { userId }, data: patch });
  const { id: _id, userId: _uid, createdAt: _c, updatedAt: _u, ...rest } = updated;
  return rest;
}

// ---------- plates ----------

export async function listPlates(userId: string, unitSystem?: string) {
  const rows = await db.plate.findMany({
    where: { userId, ...(unitSystem ? { unitSystem } : {}) },
    orderBy: [{ unitSystem: "asc" }, { weight: "desc" }],
  });
  return rows.map(mapPlate);
}

export async function replacePlates(
  userId: string,
  input: { unitSystem: string; plates: Array<{ id?: string; weight: number; colour: string; count: number; isAvailable: boolean }> },
) {
  await db.$transaction(async (tx) => {
    await tx.plate.deleteMany({ where: { userId, unitSystem: input.unitSystem } });
    await tx.plate.createMany({
      data: input.plates.map((p, i) => ({
        id: uuid7(),
        userId,
        weight: p.weight,
        colour: p.colour,
        count: p.count,
        isAvailable: p.isAvailable,
        unitSystem: input.unitSystem,
        sortOrder: i,
      })),
    });
  });
  return listPlates(userId, input.unitSystem);
}
