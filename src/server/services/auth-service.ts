// Signup / login / logout / session service.
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { hashPassword, verifyPassword, createSession, destroySession, normaliseEmail } from "../auth";
import { buildPerUserSeed } from "../seed";
import { conflict, unauthorized } from "../http";

export async function signup(input: { email: string; password: string; name?: string }) {
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
        passwordHash: hashPassword(input.password),
      },
    });
    const seed = await buildPerUserSeed(userId);
    await tx.userSettings.create({ data: seed.settings });
    await tx.category.createMany({ data: seed.categories });
    await tx.exercise.createMany({ data: seed.exercises });
    await tx.plate.createMany({ data: seed.plates });
    await tx.measurement.createMany({ data: seed.measurements });
    return user;
  });
  console.log(`[auth] signup: ${email}`);
  return result;
}

export async function login(input: { email: string; password: string }) {
  const email = normaliseEmail(input.email);
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw unauthorized("Invalid email or password");
  }
  console.log(`[auth] login: ${email}`);
  return user;
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
  if (!verifyPassword(current, user.passwordHash)) {
    throw unauthorized("Current password is incorrect");
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(next) } });
  // invalidate all other sessions
  await db.session.deleteMany({ where: { userId } });
}

export async function deleteAccount(userId: string) {
  await db.session.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } }); // cascades everywhere
  console.log(`[auth] account deleted: ${userId}`);
}
