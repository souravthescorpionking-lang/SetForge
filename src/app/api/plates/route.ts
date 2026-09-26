import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { platesUpdateSchema } from "@/lib/schemas";
import { listPlates, replacePlates } from "@/server/services/settings-service";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const unitSystem = new URL(req.url).searchParams.get("unitSystem") ?? undefined;
  return { plates: await listPlates(user.id, unitSystem) };
});

export const PUT = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, platesUpdateSchema);
  return { plates: await replacePlates(user.id, body) };
});
