import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { bootstrap } from "@/server/bootstrap";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const started = Date.now();
  let dbOk = false;
  let latencyMs = 0;
  let error: string | undefined;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  latencyMs = Date.now() - started;
  const boot = await bootstrap();
  let lastBoot: string | null = null;
  try {
    lastBoot = (await db.systemMeta.findUnique({ where: { key: "last_boot" } }))?.value ?? null;
  } catch {
    /* not migrated */
  }
  return NextResponse.json(
    {
      db: dbOk ? "ok" : "fail",
      migrations: boot.migrations,
      version: boot.version,
      latencyMs,
      lastBoot,
      ...(error ? { error } : {}),
    },
    { status: dbOk ? 200 : 503 },
  );
}
