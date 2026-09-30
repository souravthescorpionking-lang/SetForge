import { handler, requireUser } from "@/server/http";
import { listEquipment } from "@/server/services/exercise-service";

/** GET /api/equipment — §4.4 canonical equipment filter list (seed ∪ catalog). */
export const GET = handler(async () => {
  const user = await requireUser();
  return listEquipment(user.id);
});
