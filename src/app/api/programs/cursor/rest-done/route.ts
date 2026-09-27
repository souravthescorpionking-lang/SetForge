import { handler, requireUser } from "@/server/http";
import { markRestDone } from "@/server/services/program-service";

export const POST = handler(async () => {
  const user = await requireUser();
  return markRestDone(user.id);
});
