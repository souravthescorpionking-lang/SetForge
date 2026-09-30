// ─────────────────────────────────────────────────────────────────────────────
// steps-service — Part 10 §8.3. Manual daily step entries (StepEntry, unique
// userId+date). Dates are UTC-midnight day keys on the wire; the client owns
// the local-day mapping. ADD accumulates onto an existing entry, SET replaces.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { dayKey } from "@/lib/dates";
import { badRequest } from "../http";
import type { StepsResponseDTO } from "@/lib/types";

const MAX_RANGE_DAYS = 400;

/** Parse a yyyy-mm-dd key to its UTC-midnight Date (null when malformed). */
function parseDay(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || dayKey(d) !== key ? null : d;
}

/** GET /api/steps?from=&to= — entries (asc) + the user's daily goal. */
export async function listSteps(
  userId: string,
  range: { from?: string; to?: string },
): Promise<StepsResponseDTO> {
  let from: Date | null = range.from ? parseDay(range.from) : null;
  let to: Date | null = range.to ? parseDay(range.to) : null;
  if (range.from && !from) from = null;
  if (range.to && !to) to = null;
  // keep the window valid + bounded (400 days max) before hitting the DB
  if (from && to && to < from) [from, to] = [to, from];
  if (from && to && (to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
    to = new Date(from.getTime() + MAX_RANGE_DAYS * 86_400_000);
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { stepGoal: true } });
  const entries = await db.stepEntry.findMany({
    where: {
      userId,
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "asc" },
    take: 500,
  });

  return {
    goal: user?.stepGoal ?? 10_000,
    entries: entries.map((e) => ({ date: dayKey(e.date), steps: e.steps, source: e.source })),
  };
}

/** POST /api/steps {date, steps, mode} — upsert by date. Returns the entry + goal. */
export async function logSteps(
  userId: string,
  input: { date: string; steps: number; mode: "ADD" | "SET" },
): Promise<{ date: string; steps: number; goal: number }> {
  const day = parseDay(input.date);
  if (!day) throw badRequest("Invalid date");

  const existing = await db.stepEntry.findUnique({
    where: { userId_date: { userId, date: day } },
  });
  const nextSteps =
    input.mode === "ADD" && existing ? Math.min(200_000, existing.steps + input.steps) : input.steps;

  const saved = existing
    ? await db.stepEntry.update({ where: { id: existing.id }, data: { steps: nextSteps, source: "MANUAL" } })
    : await db.stepEntry.create({
        data: { id: uuid7(), userId, date: day, steps: nextSteps, source: "MANUAL" },
      });

  const user = await db.user.findUnique({ where: { id: userId }, select: { stepGoal: true } });
  return { date: dayKey(saved.date), steps: saved.steps, goal: user?.stepGoal ?? 10_000 };
}

/** PATCH /api/user/step-goal {stepGoal}. */
export async function setStepGoal(userId: string, stepGoal: number): Promise<{ stepGoal: number }> {
  await db.user.update({ where: { id: userId }, data: { stepGoal } });
  return { stepGoal };
}
