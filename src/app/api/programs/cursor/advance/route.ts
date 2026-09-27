import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { cursorAdvanceSchema } from "@/lib/schemas";
import { advanceCursorOp } from "@/server/services/program-service";

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { n } = await parseBody(req, cursorAdvanceSchema);
  return advanceCursorOp(user.id, n);
});
