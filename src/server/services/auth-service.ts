// Signup / login / logout / session / password-reset service.
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { SESSION_COOKIE } from "@/lib/constants";
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
import { jsonStringArray } from "@/server/media";
import { DEFAULT_TEMPO_PRESETS } from "@/lib/constants";
import { softDeleteAccount } from "./account-service";

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
    // Part 5: seeded program/session templates (+ Part 6 §3 metadata, Part 9 §1 variants)
    for (const r of seed.programs) {
      await tx.routine.create({
        data: {
          id: r.id,
          userId,
          name: r.name,
          notes: r.notes ?? null,
          kind: r.kind,
          sortOrder: r.sortOrder,
          difficulty: r.difficulty ?? undefined,
          daysPerWeek: r.daysPerWeek ?? undefined,
          estMinutes: r.estMinutes ?? undefined,
          highlights: r.highlights ? JSON.stringify(r.highlights) : undefined,
          // Part 9 §1 template fields
          tagline: r.tagline ?? undefined,
          description: r.description ?? undefined,
          weeks: r.weeks ?? undefined,
          // Part 9 §7 on-demand metadata
          intensity: r.intensity ?? undefined,
          equipmentLevel: r.equipmentLevel ?? undefined,
          categories: r.categories ? JSON.stringify(r.categories) : undefined,
          isFeatured: r.isFeatured ?? undefined,
          durationBand: r.durationBand ?? undefined,
        },
      });
      const dayIds: string[] = [];
      // SESSION templates: flat days (on-demand workouts are never followed).
      for (const d of r.days) {
        dayIds.push(d.id);
        await tx.routineDay.create({
          data: { id: d.id, userId, routineId: r.id, name: d.name, dayType: d.dayType, sortOrder: dayIds.length - 1 },
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
      if (r.days.length > 0) {
        await tx.routine.update({
          where: { id: r.id },
          data: { phases: JSON.stringify([{ name: "Main", dayIds }]) },
        });
      }
      // Part 9 §1: ROUTINE templates get the full variant → phase → day tree.
      // Day sortOrder is a running index within the variant so cursor indexing
      // (variant days ordered by sortOrder) stays stable.
      for (const v of r.variants) {
        await tx.programVariant.create({
          data: {
            id: v.id,
            routineId: r.id,
            difficulty: v.difficulty,
            daysPerWeek: v.daysPerWeek,
            equipment: v.equipment ? JSON.stringify(v.equipment) : undefined,
          },
        });
        let running = 0;
        for (const ph of v.phases) {
          await tx.programPhase.create({
            data: {
              id: ph.id,
              variantId: v.id,
              idx: ph.idx,
              name: ph.name,
              overview: ph.overview ?? undefined,
              minutesMin: ph.minutesMin ?? undefined,
              minutesMax: ph.minutesMax ?? undefined,
            },
          });
          for (const d of ph.days) {
            await tx.routineDay.create({
              data: { id: d.id, userId, routineId: r.id, name: d.name, dayType: d.dayType, sortOrder: running, phaseId: ph.id },
            });
            running += 1;
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
      }
    }

    return user;
  });
  console.log(`[auth] signup: ${email}`);
  // Part 6 (§4.16): issue the confirmation token when email confirmation is on.
  if (getEnv().AUTH_EMAIL_CONFIRM) {
    await sendEmailConfirmationToken(email);
  }
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
  // Part 9 §9: soft-deleted accounts can never sign back in — the anonymized
  // email already misses this lookup; this covers the anonymized address too.
  if (user.deletedAt) {
    console.warn(`[auth] login blocked for deleted account: ${email}`);
    throw unauthorized("Account deleted");
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
  // Part 6 (§4.16): AUTH_EMAIL_CONFIRM=true blocks login until confirmed.
  if (!(await isEmailConfirmed(email))) {
    throw unauthorized("Confirm your email before signing in — check your inbox for the link");
  }
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
    return { ...noEmailResult(env), ok: true as const };
  }
  const token = randomBytes(32).toString("hex");
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
    // Email delivered — the link goes ONLY to the inbox, never the response.
    return { ok: true as const, emailConfigured: true };
  }
  // No SMTP configured — the link is logged server-side so operators can hand
  // it over. Dev/sandbox mode: also return it in the response so the user is
  // not stranded (an account-existence leak is avoided below via a decoy).
  console.log(`[auth] EMAIL_SERVER not set — reset link for ${email}: ${link}`);
  return { ok: true as const, emailConfigured: false, resetLink: link };
}

/**
 * No-email-mode result for UNKNOWN accounts: a decoy link with a random token
 * that was never stored — using it yields the same "invalid or expired" error
 * as a real spent token, so the response shape can't reveal whether the email
 * has an account.
 */
function noEmailResult(env: { EMAIL_SERVER?: string; EMAIL_FROM?: string; AUTH_URL?: string; APP_URL?: string }) {
  if (isEmailConfigured(env)) return { emailConfigured: true };
  const decoy = randomBytes(32).toString("hex");
  return { emailConfigured: false, resetLink: `${env.AUTH_URL || env.APP_URL || ""}/#/auth?reset=${decoy}` };
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
  // Part 9 §9: a soft-deleted account must not hydrate a session (defence in
  // depth — softDeleteAccount already destroyed every Session row).
  if (user.deletedAt) throw unauthorized("Account deleted");
  // Part 6: normalise Json columns so the wire type matches SettingsDTO.
  const raw = user.settings!;
  return {
    user: { id: user.id, email: user.email, name: user.name, difficulty: user.difficulty ?? "INTERMEDIATE" },
    settings: {
      ...raw,
      tempoPresets: jsonStringArray(raw.tempoPresets).length > 0 ? jsonStringArray(raw.tempoPresets) : [...DEFAULT_TEMPO_PRESETS],
    },
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

/**
 * Part 10 §9 — POST /api/user/password: same verification as changePassword,
 * but the CURRENT session survives (other devices are signed out). The new
 * password must differ from the current one.
 */
export async function changePasswordKeepSession(userId: string, current: string, next: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  const verdict = await verifyPassword(current, user.passwordHash);
  if (!verdict.ok) {
    console.warn(`[auth] password change failed (wrong current password): user ${userId}`);
    throw unauthorized("Current password is incorrect");
  }
  const same = await verifyPassword(next, user.passwordHash);
  if (same.ok) throw badRequest("New password must be different from the current one");
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  // sign out every OTHER session — the current cookie keeps working
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  await db.session.deleteMany({ where: { userId, ...(token ? { token: { not: token } } : {}) } });
  console.log(`[auth] password changed (session kept): user ${userId}`);
  return { ok: true as const };
}

export async function deleteAccount(userId: string) {
  // Part 9 §9: deletion is a SOFT delete now (anonymize + sessions destroyed);
  // the boot-time purge job hard-deletes after 30 days. One semantics for every
  // caller — the legacy hard delete is retired.
  await softDeleteAccount(userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — email confirmation (§4.16, AUTH_EMAIL_CONFIRM=true). Reuses the
// VerificationToken model (identifier + token + expiry, single-use) with the
// same hashed-token discipline as PasswordResetToken.
// ─────────────────────────────────────────────────────────────────────────────

const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 min

/**
 * Signup flow when AUTH_EMAIL_CONFIRM=true: creates the account (unconfirmed)
 * and emails (or console-logs) the confirmation link `#/auth?confirm=<token>`.
 */
export async function sendEmailConfirmationToken(emailInput: string): Promise<{ ok: true; emailConfigured: boolean }> {
  const email = normaliseEmail(emailInput);
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return { ok: true, emailConfigured: Boolean(getEnv().EMAIL_SERVER) }; // do not leak existence

  // Recent token issued less than RESEND_COOLDOWN_MS ago → silent cooldown.
  const recent = await db.verificationToken.findFirst({
    where: { identifier: email, expiresAt: { gt: new Date(Date.now() + CONFIRM_TTL_MS - RESEND_COOLDOWN_MS) } },
    orderBy: { expiresAt: "desc" },
  });
  if (recent) return { ok: true, emailConfigured: Boolean(getEnv().EMAIL_SERVER) };

  const token = randomBytes(32).toString("hex");
  await db.verificationToken.create({
    data: { identifier: email, token: hashToken(token), expiresAt: new Date(Date.now() + CONFIRM_TTL_MS) },
  });

  const env = getEnv();
  const link = `${env.APP_URL ?? ""}/#/auth?confirm=${token}`;
  if (env.EMAIL_SERVER) {
    const nodemailer = await import("nodemailer").then((m) => m.default);
    const transport = nodemailer.createTransport(env.EMAIL_SERVER);
    await transport.sendMail({
      from: env.EMAIL_FROM ?? "SetForge <no-reply@setforge.app>",
      to: email,
      subject: "Confirm your SetForge account",
      text: `Welcome to SetForge!\n\nConfirm your email to activate your account:\n${link}\n\nThe link expires in 24 hours.`,
    }).catch(() => undefined);
  } else {
    console.info(`[auth] email-confirmation link for ${email}: ${link}`);
  }
  return { ok: true, emailConfigured: Boolean(env.EMAIL_SERVER) };
}

/** POST /api/auth/confirm {token} — marks the account confirmed (single-use). */
export async function confirmEmail(input: { token: string }): Promise<{ ok: true }> {
  const hashed = hashToken(input.token);
  const row = await db.verificationToken.findUnique({ where: { token: hashed } });
  if (!row || row.expiresAt.getTime() < Date.now()) throw badRequest("Confirmation link is invalid or expired");
  await db.verificationToken.delete({ where: { token: hashed } });
  return { ok: true };
}

/** Login gate helper: is this email confirmed (or not requiring confirmation)? */
export async function isEmailConfirmed(emailInput: string): Promise<boolean> {
  if (!getEnv().AUTH_EMAIL_CONFIRM) return true;
  // No outstanding valid token for this account → confirmed (or never created).
  const outstanding = await db.verificationToken.findFirst({
    where: { identifier: normaliseEmail(emailInput), expiresAt: { gt: new Date() } },
  });
  return !outstanding;
}
