import { handler, requireUser } from "@/server/http";
import { unfollowProgram } from "@/server/services/program-service";

export const DELETE = handler(async () => {
  const user = await requireUser();
  return unfollowProgram(user.id);
});
