import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { timerPresetUpdateSchema } from "@/lib/schemas";
import { updateTimerPreset, deleteTimerPreset } from "@/server/services/timer-preset-service";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, timerPresetUpdateSchema);
  return updateTimerPreset(user.id, id, body);
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return deleteTimerPreset(user.id, id);
});
