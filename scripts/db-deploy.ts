/**
 * db:deploy — `prisma migrate deploy` with DIRECT_DATABASE_URL fallback and an
 * advisory lock on Postgres (prevents concurrent runners during multi-replica
 * boots). Safe no-op when already current. Usage:
 *   bun scripts/db-deploy.ts                 → uses DIRECT_DATABASE_URL ?? DATABASE_URL
 *   DATABASE_URL=file:./db/x.db bun scripts/db-deploy.ts
 */
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("[db-deploy] DATABASE_URL is required (or DIRECT_DATABASE_URL)");
  process.exit(1);
}
const isPostgres = /^postgres(ql)?:\/\//i.test(rawUrl);
const masked = rawUrl.replace(/:[^:@/]*(?=@)/, ":***@");

const db = new PrismaClient({ datasources: { db: { url: rawUrl } } });
let lockAcquired = false;

try {
  if (isPostgres) {
    await db.$queryRawUnsafe("SELECT pg_advisory_lock(hashtext('setforge-migrate'))");
    lockAcquired = true;
    console.log("[db-deploy] advisory lock acquired");
  }
  console.log(`[db-deploy] prisma migrate deploy → ${masked}`);
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn("bunx", ["prisma", "migrate", "deploy", "--schema=prisma/schema.prisma"], {
      env: { ...process.env, DATABASE_URL: rawUrl },
      stdio: "inherit",
    });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 0));
  });
  process.exitCode = exitCode;
  if (exitCode === 0) console.log("[db-deploy] done");
} finally {
  if (lockAcquired) {
    await db.$queryRawUnsafe("SELECT pg_advisory_unlock(hashtext('setforge-migrate'))").catch(() => undefined);
  }
  await db.$disconnect().catch(() => undefined);
}
