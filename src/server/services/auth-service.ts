// Signup / login / logout / session / password-reset service.
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import {
  hashPassword,
  verifyPassword,
  isLegacyHash,
  createSession,
  destroySession,
  normaliseEmail,
  hashToken,
} from "../auth";
import { buildPerUserSeed } from "../seed";
import { conflict, unauthorized, badRequest } from "../http";
import { getEnv } from "../env";

export async function signup(input: { email: string; password: string; name?: string; timezone?: string }) {
  const email = normaliseEmail(input.email);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw conflict("An account with this email already exists");

  const userId = uuid7();
  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        id: userId,
        email,
        name: input.name?.trim() || null,
        passwordHash: await hashPassword(input.password),
      },
    });
    const seed = await buildPerUserSeed(userId, input.timezone);
    await tx.userSettings.create({ data: seed.settings });
    await tx.category.createMany({ data: seed.categories });
    await tx.exercise.createMany({ data: seed.exercises });
    await tx.plate.createMany({ data: seed.plates });
    await tx.measurement.createMany({ data: seed.measurements });
    // Part 5: seeded program/session templates
    for (const r of seed.programs) {
      await tx.routine.create({ data: { id: r.id, userId, name: r.name, notes: r.notes ?? null, kind: r.kind, sortOrder: r.sortOrder } });
      for (const d of r.days) {
        await tx.routineDay.create({
          data: { id: d.id, userId, routineId: r.id, name: d.name, dayType: d.dayType, sortOrder: d.sortOrder },
        });
        for (const re of d.exercises) {
          await tx.routineExercise.create({
            data: { id: re.id, userId, dayId: d.id, exerciseId: re.exerciseId, sortOrder: re.sortOrder },
          });
          if (re.sets.length > 0) {
            await tx.predefinedSet.createMany({
              data: re.sets.map((ps, i) => ({
                id: ps.id,
                routineExerciseId: re.id,
                weight: ps.weight ?? null,
                reps: ps.reps ?? null,
                distance: ps.distance ?? null,
                timeSec: ps.timeSec ?? null,
                setType: ps.setType ?? null,
                rpe: ps.rpe ?? null,
                tempo: ps.tempo ?? null,
                restPlannedSec: ps.restPlannedSec ?? null,
                sortOrder: i,
              })),
            });
          }
        }
      }
    }

    return user;
  });
  console.log(`[auth] signup: ${email}`);
  return result;
}

export async function login(input: { email: string; password: string }) {
  const email = normaliseEmail(input.email);
  const user = await db.user.findUnique({ where: { email } });
  const verdict = user ? await verifyPassword(input.password, user.passwordHash) : { ok: false, needsUpgrade: false };
  if (!user || !verdict.ok) {
    console.warn(`[auth] failed login: ${email}`);
    throw unauthorized("Invalid email or password");
  }
  // Transparent upgrade: legacy scrypt digests are re-hashed with Argon2id on login.
  if (verdict.needsUpgrade && isLegacyHash(user.passwordHash)) {
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password) },
    });
    console.log(`[auth] password hash upgraded to Argon2id for ${email}`);
  }
  console.log(`[auth] login: ${email}`);
  return user;
}

// ----- password reset (audit B8) -----
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Always resolves { ok: true } — never reveals whether the account exists. */
export async function requestPasswordReset(input: { email: string }) {
  const email = normaliseEmail(input.email);
  const env = getEnv();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`[auth] reset requested for unknown email: ${email}`);
    return { ok: true as const, emailConfigured: isEmailConfigured(env) };
  }
  const token = (await import("node:crypto")).randomBytes(32).toString("hex");
  await db.passwordResetToken.create({
    data: {
      id: uuid7(),
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  const link = `${env.AUTH_URL || env.APP_URL || ""}/#/auth?reset=${token}`;
  console.log(`[auth] password reset requested: ${email}`);
  if (isEmailConfigured(env)) {
    try {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport(JSON.parse(env.EMAIL_SERVER!));
      await transport.sendMail({
        from: env.EMAIL_FROM || email,
        to: email,
        subject: `${env.APP_NAME} password reset`,
        text: `Reset your password (valid 1 hour):\n${link}\n\nIf you did not request this, ignore this email.`,
      });
      console.log(`[auth] reset email sent: ${email}`);
    } catch (e) {
      console.error(`[auth] reset email failed: ${email}`, e);
    }
  } else {
    // No SMTP configured — the link is logged server-side so operators can hand it over.
    console.log(`[auth] EMAIL_SERVER not set — reset link for ${email}: ${link}`);
  }
  return { ok: true as const, emailConfigured: isEmailConfigured(env) };
}

export async function confirmPasswordReset(input: { token: string; newPassword: string }) {
  const tokenHash = hashToken(input.token);
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    console.warn("[auth] reset confirm failed: invalid or expired token");
    throw badRequest("This reset link is invalid or has expired. Request a new one.");
  }
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(input.newPassword) } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  console.log(`[auth] password reset completed: user ${record.userId}`);
  return { ok: true as const };
}

function isEmailConfigured(env: { EMAIL_SERVER?: string; EMAIL_FROM?: string }) {
  return !!env.EMAIL_SERVER;
}

export { createSession, destroySession };

export async function getUserWithSettings(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { settings: true },
  });
  if (!user) throw unauthorized();
  return {
    user: { id: user.id, email: user.email, name: user.name },
    settings: user.settings!,
  };
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  const verdict = await verifyPassword(current, user.passwordHash);
  if (!verdict.ok) {
    console.warn(`[auth] password change failed (wrong current password): user ${userId}`);
    throw unauthorized("Current password is incorrect");
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  // invalidate all sessions (forces re-login)
  await db.session.deleteMany({ where: { userId } });
  console.log(`[auth] password changed: user ${userId}`);
}

export async function deleteAccount(userId: string) {
  await db.session.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } }); // cascades everywhere
  console.log(`[auth] account deleted: ${userId}`);
}
