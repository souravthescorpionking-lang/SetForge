// Environment contract — every config value is env-driven (nothing hardcoded).
// Server-only. Parsed once, memoized, fail-fast with readable errors.
import { z } from "zod";

const boolish = z.preprocess(
  (v) => v === true || v === "true" || v === "1" || v === "yes",
  z.boolean(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // ----- database portability contract -----
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_DATABASE_URL: z.string().optional(),
  DATABASE_SSL: z.enum(["auto", "require", "disable"]).default("auto"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),
  DATABASE_CONNECT_RETRIES: z.coerce.number().int().min(0).max(100).default(10),
  DATABASE_CONNECT_BACKOFF_MS: z.coerce.number().int().min(100).default(2000),
  DB_AUTO_MIGRATE: boolish.default(true),
  DB_AUTO_SEED: boolish.default(true),
  DB_MIGRATE_FROM_URL: z.string().optional(),

  // ----- auth -----
  AUTH_SECRET: z.string().min(16).optional(),
  AUTH_URL: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  // ----- app -----
  APP_NAME: z.string().default("SetForge"),
  APP_URL: z.string().optional(),

  // ----- email (optional: enables password reset) -----
  EMAIL_SERVER: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // ----- rate limiting (in-memory token bucket) -----
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
});

export type Env = z.infer<typeof envSchema> & { AUTH_SECRET: string };

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const value = { ...parsed.data } as Env;
  if (!value.AUTH_SECRET) {
    if (value.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production (min 16 chars).");
    }
    value.AUTH_SECRET = "setforge-dev-secret-change-me";
    console.warn("[env] AUTH_SECRET not set — using insecure dev fallback.");
  }
  cached = value;
  return value;
}

/**
 * Normalise a Postgres connection URL for Prisma:
 * - accepts postgres:// and postgresql://
 * - injects sslmode according to DATABASE_SSL (auto = require for non-localhost unless sslmode present)
 * SQLite `file:` URLs pass through untouched.
 */
export function normaliseDatabaseUrl(rawUrl: string, sslMode: "auto" | "require" | "disable"): string {
  if (!/^postgres(ql)?:\/\//i.test(rawUrl)) return rawUrl; // sqlite file: passthrough
  try {
    const url = new URL(rawUrl);
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(url.hostname);
    let mode = url.searchParams.get("sslmode");
    if (sslMode === "require") mode = "require";
    else if (sslMode === "disable") mode = "disable";
    else if (!mode) mode = isLocal ? "disable" : "require";
    url.searchParams.set("sslmode", mode);
    return url.toString();
  } catch {
    return rawUrl;
  }
}
