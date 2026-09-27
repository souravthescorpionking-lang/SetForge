import { handler, requireUser } from "@/server/http";
import { skipCursorDay } from "@/server/services/program-service";

export const POST = handler(async () => {
  const user = await requireUser();
  return skipCursorDay(user.id);
});
