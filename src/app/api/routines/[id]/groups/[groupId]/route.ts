// DELETE /api/routines/:id/groups/:groupId — dissolve a routine superset
// group (members fall back to ungrouped via the FK's SetNull cascade).
import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { deleteRoutineGroup } from "@/server/services/routine-service";

type Ctx = { params: Promise<{ id: string; groupId: string }> };

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, groupId } = await params;
  return deleteRoutineGroup(user.id, id, groupId);
});
