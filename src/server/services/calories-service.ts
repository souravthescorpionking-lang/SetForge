// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — Calories (§4.15 CaloriesCard). Manual-only daily kcal log with note.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import type { CaloriesDTO } from "@/lib/types";

function utcMidnight(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export async function getCalories(userId: string, dateKey: string): Promise<CaloriesDTO> {
  const row = await db.dailyCalories.findUnique({ where: { userId_date: { userId, date: utcMidnight(dateKey) } } });
  return { date: dateKey, kcal: row?.kcal ?? null, note: row?.note ?? null };
}

export async function putCalories(userId: string, dateKey: string, kcal: number | null, note?: string | null): Promise<CaloriesDTO> {
  const date = utcMidnight(dateKey);
  if (kcal == null) {
    await db.dailyCalories.deleteMany({ where: { userId, date } });
    return { date: dateKey, kcal: null, note: null };
  }
  const row = await db.dailyCalories.upsert({
    where: { userId_date: { userId, date } },
    create: { id: uuid7(), userId, date, kcal, note: note ?? null },
    update: { kcal, note: note ?? null },
  });
  return { date: dateKey, kcal: row.kcal, note: row.note };
}

export async function listCalories(userId: string, fromKey: string, toKey: string): Promise<CaloriesDTO[]> {
  const rows = await db.dailyCalories.findMany({
    where: { userId, date: { gte: utcMidnight(fromKey), lte: utcMidnight(toKey) } },
    orderBy: { date: "asc" },
  });
  return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), kcal: r.kcal, note: r.note }));
}
