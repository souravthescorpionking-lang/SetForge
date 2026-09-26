/**
 * db:import — restore a JSON snapshot produced by db:export. Wipes the target
 * (reverse FK order) then inserts every row (FK order). Usage:
 *   bun scripts/db-import.ts <snapshot.json>
 * Env: DATABASE_URL (target).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { importDatabase, type DbSnapshot } from "../src/server/db-portability";

const file = process.argv[2];
const rawUrl = process.env.DATABASE_URL;
if (!file || !existsSync(resolve(file))) {
  console.error("[db-import] usage: bun scripts/db-import.ts <snapshot.json>");
  process.exit(1);
}
if (!rawUrl) {
  console.error("[db-import] DATABASE_URL is required (target)");
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(resolve(file), "utf8")) as DbSnapshot;
if (snapshot.app !== "setforge" || !snapshot.tables) {
  console.error("[db-import] not a SetForge snapshot");
  process.exit(1);
}

const db = new PrismaClient({ datasources: { db: { url: rawUrl } } });
try {
  const { inserted } = await importDatabase(db, snapshot);
  console.log(`[db-import] restored ${inserted} rows from ${file} (snapshot ${snapshot.exportedAt})`);
  // verify integrity: every table's row count must match the snapshot
  let mismatches = 0;
  for (const [model, rows] of Object.entries(snapshot.tables)) {
    const delegate = (db as unknown as Record<string, { count: () => Promise<number> }>[
    ])[model.charAt(0).toLowerCase() + model.slice(1)];
    if (!delegate || typeof delegate.count !== "function") continue;
    const actual = await delegate.count();
    if (actual !== rows.length) {
      console.error(`[db-import] MISMATCH ${model}: expected ${rows.length}, got ${actual}`);
      mismatches += 1;
    }
  }
  if (mismatches > 0) process.exitCode = 1;
  else console.log("[db-import] integrity verified — all table counts match the snapshot");
} finally {
  await db.$disconnect().catch(() => undefined);
}
