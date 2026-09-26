import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { timerPresetCreateSchema } from "@/lib/schemas";
import { listTimerPresets, createTimerPreset } from "@/server/services/timer-preset-service";

export const GET = handler(async () => {
  const user = await requireUser();
  return { presets: await listTimerPresets(user.id) };
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, timerPresetCreateSchema);
  return createTimerPreset(user.id, body);
});
