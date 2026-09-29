// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — Profile service (§4.16). 1:1 UserProfile per user, created on read.
// Onboarding completion writes profile + unit setting + first weigh-in record.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { startOnboardingTemplate } from "./onboarding-template";
import type { UserProfileDTO } from "@/lib/types";

function toDTO(row: {
  age: number | null; heightCm: number | null; weightKg: number | null;
  level: string | null; goal: string | null; daysPerWeekTarget: number | null;
  onboardingCompletedAt: Date | null;
}): UserProfileDTO {
  return {
    age: row.age ?? null,
    heightCm: row.heightCm ?? null,
    weightKg: row.weightKg ?? null,
    level: row.level ?? null,
    goal: row.goal ?? null,
    daysPerWeekTarget: row.daysPerWeekTarget ?? null,
    onboardingCompletedAt: row.onboardingCompletedAt ? row.onboardingCompletedAt.toISOString() : null,
  };
}

export async function getProfile(userId: string): Promise<UserProfileDTO> {
  const row = await db.userProfile.upsert({
    where: { userId },
    create: { id: uuid7(), userId },
    update: {},
  });
  return toDTO(row);
}

export interface ProfilePatch {
  age?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  level?: string | null;
  goal?: string | null;
  daysPerWeekTarget?: number | null;
}

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<UserProfileDTO> {
  await getProfile(userId); // ensure row exists
  const row = await db.userProfile.update({ where: { userId }, data: patch });
  return toDTO(row);
}

export interface OnboardingPayload {
  unitSystem?: "metric" | "imperial";
  goal?: string | null;
  level?: string | null;
  daysPerWeekTarget?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  age?: number | null;
  skipped?: boolean;
}

/**
 * POST /api/onboarding/complete — writes UserProfile, UserSettings.unitSystem and
 * (when a weight is given) the first Body-Weight MeasurementRecord. Sets
 * onboardingCompletedAt so the app-shell gate stops redirecting.
 */
export async function completeOnboarding(userId: string, payload: OnboardingPayload): Promise<UserProfileDTO> {
  // Unit conversion for onboarding-entered values: imperial input arrives as
  // inches/pounds (client converts live); here we store metric canonically.
  const settings = await db.userSettings.findUnique({ where: { userId } });
  const metric = settings?.unitSystem !== "imperial";

  const heightCm = payload.heightCm != null ? Math.round(payload.heightCm * 10) / 10 : undefined;
  const weightKg = payload.weightKg != null ? Math.round(payload.weightKg * 10) / 10 : undefined;

  await getProfile(userId);
  const row = await db.userProfile.update({
    where: { userId },
    data: {
      ...(payload.age != null ? { age: payload.age } : {}),
      ...(heightCm != null ? { heightCm } : {}),
      ...(weightKg != null ? { weightKg } : {}),
      ...(payload.goal != null ? { goal: payload.goal } : {}),
      ...(payload.level != null ? { level: payload.level } : {}),
      ...(payload.daysPerWeekTarget != null ? { daysPerWeekTarget: payload.daysPerWeekTarget } : {}),
      onboardingCompletedAt: new Date(),
    },
  });

  if (payload.unitSystem) {
    await db.userSettings.updateMany({ where: { userId }, data: { unitSystem: payload.unitSystem } });
  }

  if (weightKg != null) {
    const measurement = await db.measurement.findFirst({
      where: { userId, name: { in: ["Body Weight", "Body weight", "Weight"] } },
      orderBy: { sortOrder: "asc" },
    });
    if (measurement) {
      const today = new Date();
      const recordedAt = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      await db.measurementRecord.create({
        data: { id: uuid7(), userId, measurementId: measurement.id, value: weightKg, recordedAt },
      });
    }
  }

  void metric; // imperial inputs are converted client-side before submit (live-convert step)

  // Part 8 §6.11: auto-create + follow the best-matching template (level ×
  // days/week). Failures never break onboarding — the toast just won't show.
  let startedTemplate: { id: string; name: string; dayCount: number } | null = null;
  try {
    startedTemplate = await startOnboardingTemplate(userId, payload.level, payload.daysPerWeekTarget);
  } catch {
    startedTemplate = null;
  }
  void startedTemplate; // callers read it via completeOnboardingWithTemplate
  return toDTO(row);
}

/** completeOnboarding + §6.11 template result (used by the route). */
export async function completeOnboardingWithTemplate(
  userId: string,
  payload: OnboardingPayload,
): Promise<{ profile: UserProfileDTO; startedTemplate: { id: string; name: string; dayCount: number } | null }> {
  const profile = await completeOnboarding(userId, payload);
  // completeOnboarding swallowed template errors internally; re-check the
  // follow state cheaply so the client toast is accurate.
  const active = await db.activeRoutine.findUnique({
    where: { userId },
    include: { routine: { select: { id: true, name: true } } },
  });
  const dayCount = active ? await db.routineDay.count({ where: { routineId: active.routineId } }) : 0;
  const startedTemplate =
    active && profile.onboardingCompletedAt && Date.now() - new Date(profile.onboardingCompletedAt).getTime() < 10_000
      ? { id: active.routine.id, name: active.routine.name, dayCount }
      : null;
  return { profile, startedTemplate };
}

/**
 * One-time boot backfill: existing users (pre-Part 6) get a UserProfile with
 * onboardingCompletedAt preset — the onboarding gate must only fire for users
 * who signed up after Part 6. Guarded by SystemMeta flag.
 */
export async function backfillExistingProfiles(): Promise<number> {
  const done = await db.systemMeta.findUnique({ where: { key: "profile_backfill_v1" } });
  if (done) return 0;
  const users = await db.user.findMany({ select: { id: true } });
  const now = new Date();
  let created = 0;
  for (const u of users) {
    const existing = await db.userProfile.findUnique({ where: { userId: u.id } });
    if (!existing) {
      await db.userProfile.create({ data: { id: uuid7(), userId: u.id, onboardingCompletedAt: now } });
      created += 1;
    } else if (existing.onboardingCompletedAt == null) {
      await db.userProfile.update({ where: { userId: u.id }, data: { onboardingCompletedAt: now } });
      created += 1;
    }
  }
  await db.systemMeta.upsert({
    where: { key: "profile_backfill_v1" },
    create: { key: "profile_backfill_v1", value: now.toISOString() },
    update: { value: now.toISOString() },
  });
  if (created > 0) console.log(`[profile] backfilled ${created} existing profiles (onboarding pre-completed)`);
  return created;
}
