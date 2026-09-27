// User settings + plate inventory.
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { mapPlate } from "../mappers";
import { notFound } from "../http";
import { DEFAULT_TEMPO_PRESETS } from "@/lib/constants";
import { jsonStringArray } from "@/server/media";

export async function getSettings(userId: string) {
  const s = await db.userSettings.findUnique({ where: { userId } });
  if (!s) throw notFound("Settings not found");
  const { id: _id, userId: _userId, createdAt: _c, updatedAt: _u, ...rest } = s;
  return {
    ...rest,
    tempoPresets: jsonStringArray(s.tempoPresets).length > 0 ? jsonStringArray(s.tempoPresets) : [...DEFAULT_TEMPO_PRESETS],
  };
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
    // ---- Part 2: set-row columns & behaviour ----
    showSetType: boolean;
    showRpe: boolean;
    showTempo: boolean;
    showRest: boolean;
    autoRestFromRow: boolean;
    restEndBehaviour: string;
    e1rmMethod: string;
    // ---- Part 6: feature expansion ----
    guidedMode: boolean;
    restDisplay: string;
    autoMoveNextSet: boolean;
    hapticsEnabled: boolean;
    showVideoPanel: boolean;
    showMuscleChips: boolean;
    showEquipmentChips: boolean;
    finishBehaviour: string;
    showSetsProgressBar: boolean;
    showMaxWeightBar: boolean;
    calendarStyle: string;
    tempoPresets: string[];
    showCaloriesCard: boolean;
    showThumbnails: boolean;
  }>,
) {
  const existing = await db.userSettings.findUnique({ where: { userId } });
  if (!existing) throw notFound("Settings not found");
  // Json columns arrive/leave as string[] — normalise null to the documented default.
  const data: Record<string, unknown> = { ...patch };
  if (patch.tempoPresets !== undefined) data.tempoPresets = patch.tempoPresets ?? [...DEFAULT_TEMPO_PRESETS];
  const updated = await db.userSettings.update({ where: { userId }, data });
  const { id: _id, userId: _uid, createdAt: _c, updatedAt: _u, ...rest } = updated;
  return {
    ...rest,
    tempoPresets: jsonStringArray(updated.tempoPresets).length > 0 ? jsonStringArray(updated.tempoPresets) : [...DEFAULT_TEMPO_PRESETS],
  };
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
