import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { copyRoutine } from "@/server/services/routine-service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return copyRoutine(user.id, id);
});
