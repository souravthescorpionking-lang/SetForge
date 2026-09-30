import { NextRequest } from "next/server";
import { handler, parseBody, requireUser, HttpError } from "@/server/http";
import { passwordChangeSchema } from "@/lib/schemas";
import { changePasswordKeepSession } from "@/server/services/auth-service";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/user/password (Part 10 §9) — the profile Change-password flow.
// Verifies the current password (argon2/scrypt via auth-service), requires a
// NEW value different from the old one, keeps the CURRENT session alive and
// signs out every other device. Rate-limited to 5 changes per rolling 24h per
// user (in-memory bucket, same discipline as the http.ts limiter).
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

const buckets = new Map<string, { count: number; resetAt: number }>();

function checkDailyLimit(userId: string): void {
  const now = Date.now();
  const bucket = buckets.get(userId);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
  if (bucket.count > MAX_PER_WINDOW) {
    throw new HttpError(429, "RATE_LIMITED", "Too many password changes — try again tomorrow");
  }
}

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  checkDailyLimit(user.id);
  const body = await parseBody(req, passwordChangeSchema);
  return changePasswordKeepSession(user.id, body.currentPassword, body.newPassword);
});
