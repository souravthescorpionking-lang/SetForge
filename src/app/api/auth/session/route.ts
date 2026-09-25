import { NextRequest } from "next/server";
import { handler } from "@/server/http";
import { getSessionUser } from "@/server/auth";
import { getUserWithSettings } from "@/server/services/auth-service";

export const GET = handler(async (_req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return { user: null, settings: null };
  return getUserWithSettings(user.id);
});
