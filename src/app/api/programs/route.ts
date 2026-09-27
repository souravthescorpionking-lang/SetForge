import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { listPrograms } from "@/server/services/program-service";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const kind = new URL(req.url).searchParams.get("kind");
  const parsed = kind === "ROUTINE" || kind === "SESSION" ? kind : undefined;
  return listPrograms(user.id, parsed);
});
