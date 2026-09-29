// GET /api/backup/runs — §6.8 scheduled backup history (last runs).
import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { db } from "@/lib/db";

export const GET = handler(async (_req: NextRequest) => {
  const user = await requireUser();
  const runs = await db.backupRun.findMany({
    where: { userId: user.id },
    orderBy: { at: "desc" },
    take: 10,
  });
  return {
    runs: runs.map((r) => ({
      id: r.id,
      target: r.target,
      status: r.status,
      bytes: r.bytes ?? null,
      at: r.at.toISOString(),
    })),
  };
});
