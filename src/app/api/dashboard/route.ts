import { handler, requireUser } from "@/server/http";
import { getDashboard } from "@/server/services/program-service";

export const GET = handler(async () => {
  const user = await requireUser();
  return getDashboard(user.id);
});
