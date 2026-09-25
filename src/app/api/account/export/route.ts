import { NextRequest, NextResponse } from "next/server";
import { handler, requireUser } from "@/server/http";
import { exportBackup, exportCsv } from "@/server/services/account-service";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  if (format === "csv") {
    const type = url.searchParams.get("type") === "body" ? "body" : "workouts";
    const csv = await exportCsv(user.id, type);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="setforge-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }
  const backup = await exportBackup(user.id);
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="setforge-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
