import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { cursorJumpSchema } from "@/lib/schemas";
import { jumpCursorOp } from "@/server/services/program-service";

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { dayIndex } = await parseBody(req, cursorJumpSchema);
  return jumpCursorOp(user.id, dayIndex);
});
