import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { buildProgram } from "@/server/services/program-service";
import { builderSchema } from "@/lib/schemas";

/** POST /api/programs/builder — §4.7 program builder (phases × weeks × weekly template). */
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, builderSchema);
  return buildProgram(user.id, body);
});
