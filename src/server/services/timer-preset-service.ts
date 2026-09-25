// Interval timer preset service — user-owned saved HIIT configs.
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { notFound, conflict } from "../http";
import type { TimerPresetDTO } from "@/lib/types";

type PresetInput = {
  name: string;
  prepareSec?: number;
  workSec?: number;
  restSec?: number;
  rounds?: number;
};

function mapPreset(p: {
  id: string;
  name: string;
  prepareSec: number;
  workSec: number;
  restSec: number;
  rounds: number;
  sortOrder: number;
}): TimerPresetDTO {
  return {
    id: p.id,
    name: p.name,
    prepareSec: p.prepareSec,
    workSec: p.workSec,
    restSec: p.restSec,
    rounds: p.rounds,
    sortOrder: p.sortOrder,
  };
}

export async function listTimerPresets(userId: string) {
  const rows = await db.timerPreset.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } });
  return rows.map(mapPreset);
}

export async function createTimerPreset(userId: string, input: PresetInput) {
  const name = input.name.trim();
  const clash = await db.timerPreset.findFirst({ where: { userId, name } });
  if (clash) throw conflict("A preset with this name already exists");
  const count = await db.timerPreset.count({ where: { userId } });
  const created = await db.timerPreset.create({
    data: {
      id: uuid7(),
      userId,
      name,
      prepareSec: input.prepareSec ?? 10,
      workSec: input.workSec ?? 30,
      restSec: input.restSec ?? 0,
      rounds: input.rounds ?? 8,
      sortOrder: count,
    },
  });
  return mapPreset(created);
}

export async function updateTimerPreset(userId: string, id: string, patch: PresetInput) {
  const preset = await db.timerPreset.findFirst({ where: { id, userId } });
  if (!preset) throw notFound("Preset not found");
  if (patch.name && patch.name.trim() !== preset.name) {
    const clash = await db.timerPreset.findFirst({ where: { userId, name: patch.name.trim(), NOT: { id } } });
    if (clash) throw conflict("A preset with this name already exists");
  }
  const updated = await db.timerPreset.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.prepareSec !== undefined ? { prepareSec: patch.prepareSec } : {}),
      ...(patch.workSec !== undefined ? { workSec: patch.workSec } : {}),
      ...(patch.restSec !== undefined ? { restSec: patch.restSec } : {}),
      ...(patch.rounds !== undefined ? { rounds: patch.rounds } : {}),
    },
  });
  return mapPreset(updated);
}

export async function deleteTimerPreset(userId: string, id: string) {
  const preset = await db.timerPreset.findFirst({ where: { id, userId } });
  if (!preset) throw notFound("Preset not found");
  await db.timerPreset.delete({ where: { id } });
  return { ok: true };
}
