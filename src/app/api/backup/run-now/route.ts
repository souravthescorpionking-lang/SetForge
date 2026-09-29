// POST /api/backup/run-now — §6.8 manual "Run now": exports the user's JSON
// backup to the local target (download/backups/) and records a BackupRun.
import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { exportBackup } from "@/server/services/account-service";
import { mkdirSync, writeFileSync } from "node:fs";

export const POST = handler(async (_req: NextRequest) => {
  const user = await requireUser();
  try {
    const backup = await exportBackup(user.id);
    const json = JSON.stringify(backup);
    mkdirSync("download/backups", { recursive: true });
    const file = `download/backups/${user.id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(file, json);
    const run = await db.backupRun.create({
      data: { id: uuid7(), userId: user.id, target: "local", status: "OK", bytes: json.length },
    });
    return { ok: true, run: { id: run.id, target: run.target, status: run.status, bytes: run.bytes, at: run.at.toISOString() } };
  } catch (e) {
    await db.backupRun.create({
      data: { id: uuid7(), userId: user.id, target: "local", status: "ERROR" },
    });
    throw e;
  }
});
