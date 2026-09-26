/**
 * db:copy — one-time data copy between databases (audit A8). Copies every table
 * in FK order from --from into --to, only when the target is empty and unmarked;
 * writes a `db_copied_from` marker into the target's system_meta. Usage:
 *   bun scripts/db-copy.ts --from file:./db/source.db --to file:./db/target.db
 * (or rely on DB_MIGRATE_FROM_URL + DATABASE_URL env when flags are omitted)
 */
import { PrismaClient } from "@prisma/client";
import { copyDatabase } from "../src/server/db-portability";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const from = flag("from") || process.env.DB_MIGRATE_FROM_URL;
const to = flag("to") || process.env.DATABASE_URL;
if (!from || !to) {
  console.error("[db-copy] usage: bun scripts/db-copy.ts --from <url> --to <url>  (or DB_MIGRATE_FROM_URL + DATABASE_URL env)");
  process.exit(1);
}

const target = new PrismaClient({ datasources: { db: { url: to } } });
try {
  const result = await copyDatabase(from, target);
  if (result.skipped) {
    console.log(`[db-copy] skipped: ${result.reason}`);
    process.exit(0);
  }
  console.log(`[db-copy] copied ${result.copied} rows`);
} finally {
  await target.$disconnect().catch(() => undefined);
}
