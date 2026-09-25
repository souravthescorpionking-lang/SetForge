// Auth: scrypt password hashing + opaque database sessions.
// No vendor SDKs — auth lives in the same database as all other data.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/constants";
import { uuid7 } from "@/lib/uuid7";

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p }).toString("hex");
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts;
  try {
    const derived = scryptSync(password, salt, Buffer.from(hash, "hex").length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    const expected = Buffer.from(hash, "hex");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
};

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: { id: uuid7(), userId, token, expiresAt },
  });
  return { token, expiresAt };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { token } }).catch(() => undefined);
  }
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
