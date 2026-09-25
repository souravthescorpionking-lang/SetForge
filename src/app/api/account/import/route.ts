import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { importSchema } from "@/lib/schemas";
import { importBackup } from "@/server/services/account-service";

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, importSchema);
  return importBackup(user.id, body.mode, body.data);
});
