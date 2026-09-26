/**
 * db:switch-check — validate a candidate database URL BEFORE switching:
 * parses, normalises (sslmode per DATABASE_SSL), connects, counts users.
 * Exit 0 = safe to switch. Usage:
 *   bun scripts/db-switch-check.ts [url]        → default: DATABASE_URL env
 */
import { probeDatabase } from "../src/server/db-portability";

const url = process.argv[2] || process.env.DATABASE_URL;
if (!url) {
  console.error("[db-switch-check] provide a URL argument or set DATABASE_URL");
  process.exit(1);
}

console.log(`[db-switch-check] probing ${url.replace(/:[^:@/]*(?=@)/, ":***@")}`);
const result = await probeDatabase(url);
if (!result.reachable) {
  console.error(`[db-switch-check] UNREACHABLE (${result.engine}) — ${result.error}`);
  process.exit(1);
}
console.log(
  `[db-switch-check] reachable ${result.engine} in ${result.latencyMs}ms — users: ${result.users ?? "?"}`,
);
if ((result.users ?? 0) > 0) {
  console.warn(
    `[db-switch-check] NOTE: target already holds ${result.users} users. Switching will serve existing data; use DB_MIGRATE_FROM_URL only against an EMPTY database.`,
  );
}
console.log("[db-switch-check] OK — safe to switch DATABASE_URL");
process.exit(0);
