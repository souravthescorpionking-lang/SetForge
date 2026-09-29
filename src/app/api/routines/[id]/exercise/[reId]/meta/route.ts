// GET/PUT /api/routines/:id/exercise/:reId/meta — Part 8 §6.2 warm-up scheme +
// §6.3 progression rule editor (the sets editor's Warm-up › / Progression › rows).
import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { badRequest, notFound } from "@/server/http";
import { z } from "zod";

const metaPutSchema = z.object({
  warmupScheme: z.enum(["NONE", "STANDARD", "LIGHT", "CUSTOM"]).optional(),
  warmupCustom: z.array(z.object({ pct: z.number().min(1).max(100), reps: z.number().int().min(1).max(50) })).nullish(),
  progression: z
    .object({
      type: z.enum(["LINEAR", "DOUBLE", "NONE"]),
      increment: z.number().min(0).max(100),
      unit: z.enum(["kg", "lbs", "%"]),
      condition: z.enum(["ALL_SETS_HIT", "LAST_SET_HIT"]),
      failStreakForDeload: z.number().int().min(1).max(10),
      deloadPct: z.number().int().min(1).max(50),
    })
    .nullish(),
});

async function load(userId: string, routineId: string, reId: string) {
  const re = await db.routineExercise.findFirst({
    where: { id: reId, userId, day: { routineId } },
    include: { progressionRule: true, progressionState: true },
  });
  if (!re) throw notFound("Exercise not found in routine");
  return re;
}

export const GET = handler(async (_req: NextRequest, ctx: { params: Promise<{ id: string; reId: string }> }) => {
  const user = await requireUser();
  const { id, reId } = await ctx.params;
  const re = await load(user.id, id, reId);
  return {
    warmupScheme: re.warmupScheme ?? "NONE",
    warmupCustom: re.warmupCustom ?? null,
    progression: re.progressionRule
      ? {
          type: re.progressionRule.type,
          increment: re.progressionRule.increment,
          unit: re.progressionRule.unit,
          condition: re.progressionRule.condition,
          failStreakForDeload: re.progressionRule.failStreakForDeload,
          deloadPct: re.progressionRule.deloadPct,
        }
      : null,
    state: re.progressionState
      ? { nextWeightDelta: re.progressionState.nextWeightDelta, failStreak: re.progressionState.failStreak }
      : { nextWeightDelta: 0, failStreak: 0 },
  };
});

export const PUT = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string; reId: string }> }) => {
  const user = await requireUser();
  const { id, reId } = await ctx.params;
  const re = await load(user.id, id, reId);
  const parsed = metaPutSchema.safeParse(await req.json());
  if (!parsed.success) throw badRequest("Invalid meta payload", parsed.error.issues.slice(0, 3));
  const input = parsed.data;

  const data: Record<string, unknown> = {};
  if (input.warmupScheme !== undefined) data.warmupScheme = input.warmupScheme;
  if (input.warmupCustom !== undefined) data.warmupCustom = input.warmupCustom ?? undefined;
  if (Object.keys(data).length > 0) {
    await db.routineExercise.update({ where: { id: re.id }, data });
  }

  if (input.progression !== undefined) {
    if (input.progression === null) {
      await db.progressionRule.deleteMany({ where: { routineExerciseId: re.id } });
    } else {
      const p = input.progression;
      await db.progressionRule.upsert({
        where: { routineExerciseId: re.id },
        create: {
          id: uuid7(),
          userId: user.id,
          routineExerciseId: re.id,
          type: p.type,
          increment: p.increment,
          unit: p.unit,
          condition: p.condition,
          failStreakForDeload: p.failStreakForDeload,
          deloadPct: p.deloadPct,
        },
        update: {
          type: p.type,
          increment: p.increment,
          unit: p.unit,
          condition: p.condition,
          failStreakForDeload: p.failStreakForDeload,
          deloadPct: p.deloadPct,
        },
      });
    }
  }
  return { ok: true };
});
