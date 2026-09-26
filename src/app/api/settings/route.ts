import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { settingsUpdateSchema } from "@/lib/schemas";
import { getSettings, updateSettings } from "@/server/services/settings-service";

export const GET = handler(async () => {
  const user = await requireUser();
  return getSettings(user.id);
});

export const PATCH = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, settingsUpdateSchema);
  return updateSettings(user.id, body);
});
