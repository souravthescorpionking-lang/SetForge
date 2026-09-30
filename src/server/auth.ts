// Auth: Argon2id password hashing (hash-wasm, pure WASM — no native deps) with
// transparent migration of legacy scrypt hashes on successful login.
// Sessions are opaque tokens in the same database as all other data — no vendor SDKs.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/constants";
import { uuid7 } from "@/lib/uuid7";
import { argon2id, argon2Verify } from "hash-wasm";

// OWASP-recommended Argon2id parameters for web applications.
const ARGON2_PARAMS = { parallelism: 1, iterations: 3, memorySize: 19456, hashLength: 32, outputType: "encoded" } as const;

// Legacy scrypt parameters (kept only for verification + migration).
const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Hash a password with Argon2id → `$argon2id$v=19$m=19456,t=3,p=1$...` */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return argon2id({ password, salt, ...ARGON2_PARAMS });
}

/** True when the stored hash is a legacy scrypt digest that should be upgraded. */
export function isLegacyHash(stored: string | null): boolean {
  return !!stored && stored.startsWith("scrypt$");
}

/** Verify against Argon2id or legacy scrypt; returns [ok, needsUpgrade]. */
export async function verifyPassword(password: string, stored: string | null): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  if (!stored) return { ok: false, needsUpgrade: false };
  if (stored.startsWith("$argon2")) {
    try {
      return { ok: await argon2Verify({ password, hash: stored }), needsUpgrade: false };
    } catch {
      return { ok: false, needsUpgrade: false };
    }
  }
  if (stored.startsWith("scrypt$")) {
    return { ok: verifyScrypt(password, stored), needsUpgrade: true };
  }
  return { ok: false, needsUpgrade: false };
}

function verifyScrypt(password: string, stored: string): boolean {
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

/** Hash a token for storage (reset tokens are stored hashed, never plaintext). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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
  // Part 9 §9: a soft-deleted account never hydrates a session (defence in
  // depth — softDeleteAccount already destroyed every Session row). Kill any
  // straggler token so the cookie cannot resurrect it.
  if (session.user.deletedAt) {
    await db.session.deleteMany({ where: { userId: session.user.id } }).catch(() => undefined);
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
