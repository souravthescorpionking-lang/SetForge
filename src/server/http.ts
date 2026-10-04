// HTTP helpers: uniform error shape, Zod parsing, auth guard, in-memory rate limiting.
// Every route handler wraps its logic with `handler()` and returns plain objects.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, type SessionUser } from "./auth";
import { getEnv } from "./env";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message = "Invalid request", details?: unknown) =>
  new HttpError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required") =>
  new HttpError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "Not allowed") => new HttpError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found") => new HttpError(404, "NOT_FOUND", message);
export const conflict = (message = "Conflict", details?: unknown) => new HttpError(409, "CONFLICT", message, details);

export function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

type HandlerCtx = { params: Promise<Record<string, string>> };

/** Map a thrown error to the standard JSON error response (HttpError → status, Zod → 400). */
export function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    return NextResponse.json(errorBody(e.code, e.message, e.details), { status: e.status });
  }
  if (e instanceof z.ZodError) {
    return NextResponse.json(
      errorBody("VALIDATION_ERROR", "Validation failed", e.issues.map((i) => ({ path: i.path.join("."), message: i.message }))),
      { status: 400 },
    );
  }
  console.error("[api] unhandled error:", e);
  const msg = e instanceof Error ? e.message : "Something went wrong";
  return NextResponse.json(errorBody("INTERNAL", msg), { status: 500 });
}

/** Wraps a route handler: JSON envelope, error mapping, Zod → 400. */
export function handler<Ctx extends HandlerCtx = HandlerCtx>(
  fn: (req: NextRequest, ctx: Ctx) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: Ctx): Promise<NextResponse> => {
    try {
      const result = await fn(req, ctx);
      if (result instanceof NextResponse) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Parse a JSON body against a Zod schema. Size-limited (default 1 MB; import allows 50 MB). */
export async function parseBody<T>(req: NextRequest, schema: z.ZodType<T>, maxBytes = 1024 * 1024): Promise<T> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Body must be valid JSON");
  }
  // Re-check actual size (content-length can be absent or spoofed by proxies).
  const actual = Buffer.byteLength(JSON.stringify(raw ?? null), "utf8");
  if (actual > maxBytes) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
  }
  return schema.parse(raw);
}

/** Require an authenticated user for this request. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}

/** Ownership assertion — throws 404 (not 403) to avoid resource existence leaks. */
export function assertOwned(userId: string, resourceUserId: string | null | undefined): void {
  if (!resourceUserId || resourceUserId !== userId) {
    throw notFound("Resource not found");
  }
}

// ----- in-memory rate limiter (token bucket per key; swap for Redis later via env) -----
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string): void {
  const env = getEnv();
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + env.RATE_LIMIT_WINDOW_MS });
    return;
  }
  bucket.count += 1;
  if (bucket.count > env.RATE_LIMIT_MAX) {
    throw new HttpError(429, "RATE_LIMITED", "Too many attempts — try again shortly");
  }
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}
