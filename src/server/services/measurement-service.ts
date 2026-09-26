// Body measurements + records + custom units.
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { mapMeasurement, mapMeasurementRecord } from "../mappers";
import { badRequest, notFound, conflict } from "../http";
import { SEED_MEASUREMENTS } from "../seed";

const SEED_NAMES = SEED_MEASUREMENTS.map((m) => m.name);

export async function listMeasurements(userId: string) {
  const rows = await db.measurement.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
    include: { unit: true },
  });
  const ids = rows.map((m) => m.id);
  const records = ids.length ? await db.measurementRecord.findMany({ where: { measurementId: { in: ids } } }) : [];
  const byMeasurement = new Map<string, typeof records>();
  for (const r of records) {
    if (!byMeasurement.has(r.measurementId)) byMeasurement.set(r.measurementId, []);
    byMeasurement.get(r.measurementId)!.push(r);
  }
  return rows.map((m) => mapMeasurement(m, byMeasurement.get(m.id) ?? []));
}

export async function createMeasurement(
  userId: string,
  input: { name: string; unitId: string; goalType?: string; targetValue?: number | null; isEnabled?: boolean; sortOrder?: number },
) {
  const unit = await db.measurementUnit.findFirst({ where: { id: input.unitId, OR: [{ userId }, { userId: null }] } });
  if (!unit) throw badRequest("Unit not found");
  const name = input.name.trim();
  const clash = await db.measurement.findFirst({ where: { userId, name } });
  if (clash) throw conflict("A measurement with this name already exists");
  const count = await db.measurement.count({ where: { userId } });
  const created = await db.measurement.create({
    data: {
      id: uuid7(),
      userId,
      unitId: input.unitId,
      name,
      goalType: input.goalType ?? "NONE",
      targetValue: input.targetValue ?? null,
      isEnabled: input.isEnabled ?? true,
      sortOrder: input.sortOrder ?? count,
    },
    include: { unit: true },
  });
  return mapMeasurement(created);
}

export async function updateMeasurement(
  userId: string,
  id: string,
  patch: { goalType?: string; targetValue?: number | null; isEnabled?: boolean; unitId?: string; sortOrder?: number },
) {
  const m = await db.measurement.findFirst({ where: { id, userId } });
  if (!m) throw notFound("Measurement not found");
  if (patch.unitId) {
    const unit = await db.measurementUnit.findFirst({ where: { id: patch.unitId, OR: [{ userId }, { userId: null }] } });
    if (!unit) throw badRequest("Unit not found");
  }
  const updated = await db.measurement.update({
    where: { id },
    data: {
      ...(patch.goalType !== undefined ? { goalType: patch.goalType } : {}),
      ...(patch.targetValue !== undefined ? { targetValue: patch.targetValue } : {}),
      ...(patch.isEnabled !== undefined ? { isEnabled: patch.isEnabled } : {}),
      ...(patch.unitId !== undefined ? { unitId: patch.unitId } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
    include: { unit: true },
  });
  return mapMeasurement(updated);
}

export async function deleteMeasurement(userId: string, id: string) {
  const m = await db.measurement.findFirst({ where: { id, userId } });
  if (!m) throw notFound("Measurement not found");
  if (SEED_NAMES.includes(m.name)) {
    throw badRequest("Built-in measurements can be disabled but not deleted");
  }
  await db.measurement.delete({ where: { id } });
  return { ok: true };
}

export async function reorderMeasurements(userId: string, ids: string[]) {
  await db.$transaction(ids.map((id, i) => db.measurement.updateMany({ where: { id, userId }, data: { sortOrder: i } })));
  return { ok: true };
}

// ---------- records ----------

export async function listRecords(userId: string, measurementId: string) {
  const m = await db.measurement.findFirst({ where: { id: measurementId, userId } });
  if (!m) throw notFound("Measurement not found");
  const records = await db.measurementRecord.findMany({
    where: { measurementId },
    orderBy: { recordedAt: "desc" },
  });
  return records.map(mapMeasurementRecord);
}

export async function createRecord(
  userId: string,
  measurementId: string,
  input: { value: number; recordedAt?: string; comment?: string | null },
) {
  const m = await db.measurement.findFirst({ where: { id: measurementId, userId } });
  if (!m) throw notFound("Measurement not found");
  const created = await db.measurementRecord.create({
    data: {
      id: uuid7(),
      userId,
      measurementId,
      value: input.value,
      recordedAt: input.recordedAt ? new Date(input.recordedAt) : new Date(),
      comment: input.comment ?? null,
    },
  });
  return mapMeasurementRecord(created);
}

export async function updateRecord(
  userId: string,
  measurementId: string,
  recordId: string,
  patch: { value?: number; recordedAt?: string; comment?: string | null },
) {
  const r = await db.measurementRecord.findFirst({ where: { id: recordId, userId, measurementId } });
  if (!r) throw notFound("Record not found");
  const updated = await db.measurementRecord.update({
    where: { id: recordId },
    data: {
      ...(patch.value !== undefined ? { value: patch.value } : {}),
      ...(patch.recordedAt !== undefined ? { recordedAt: new Date(patch.recordedAt) } : {}),
      ...(patch.comment !== undefined ? { comment: patch.comment } : {}),
    },
  });
  return mapMeasurementRecord(updated);
}

export async function deleteRecord(userId: string, measurementId: string, recordId: string) {
  const r = await db.measurementRecord.findFirst({ where: { id: recordId, userId, measurementId } });
  if (!r) throw notFound("Record not found");
  await db.measurementRecord.delete({ where: { id: recordId } });
  return { ok: true };
}

// ---------- units ----------

export async function listUnits(userId: string) {
  const rows = await db.measurementUnit.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    orderBy: [{ userId: "desc" }, { name: "asc" }],
  });
  return rows.map((u) => ({ id: u.id, name: u.name, isCustom: u.userId != null }));
}

export async function createUnit(userId: string, input: { name: string }) {
  const name = input.name.trim();
  const existing = await db.measurementUnit.findFirst({ where: { OR: [{ userId: null, name }, { userId, name }] } });
  if (existing) throw conflict("This unit already exists");
  const created = await db.measurementUnit.create({ data: { id: uuid7(), userId, name } });
  return { id: created.id, name: created.name, isCustom: true };
}
