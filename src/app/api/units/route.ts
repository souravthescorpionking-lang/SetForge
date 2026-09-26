import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { unitCreateSchema } from "@/lib/schemas";
import { listUnits, createUnit } from "@/server/services/measurement-service";

export const GET = handler(async () => {
  const user = await requireUser();
  return { units: await listUnits(user.id) };
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, unitCreateSchema);
  return createUnit(user.id, body);
});
