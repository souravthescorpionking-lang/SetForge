/**
 * db:export — full JSON snapshot of every table (FK order via Prisma DMMF).
 * Usage: bun scripts/db-export.ts [outPath]
 *   default outPath: db/export-<timestamp>.json
 * Env: DATABASE_URL (or DIRECT_DATABASE_URL fallback).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { exportDatabase, modelOrder } from "../src/server/db-portability";

const rawUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("[db-export] DATABASE_URL is required");
  process.exit(1);
}
const out = process.argv[2] || `db/export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

const db = new PrismaClient({ datasources: { db: { url: rawUrl } } });
try {
  console.log(`[db-export] snapshotting ${modelOrder().length} tables from ${rawUrl.replace(/:[^:@/]*(?=@)/, ":***@")}`);
  const snapshot = await exportDatabase(db, rawUrl);
  const total = Object.values(snapshot.tables).reduce((n, rows) => n + rows.length, 0);
  mkdirSync(resolve(process.cwd(), "db"), { recursive: true });
  writeFileSync(resolve(process.cwd(), out), JSON.stringify(snapshot, null, 2));
  const perTable = Object.entries(snapshot.tables)
    .filter(([, rows]) => rows.length > 0)
    .map(([m, rows]) => `${m}=${rows.length}`)
    .join(" ");
  console.log(`[db-export] wrote ${total} rows → ${out}`);
  console.log(`[db-export] ${perTable}`);
} finally {
  await db.$disconnect().catch(() => undefined);
}
