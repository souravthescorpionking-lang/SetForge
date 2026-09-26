import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { importSchema } from "@/lib/schemas";
import { importBackup } from "@/server/services/account-service";

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, importSchema, 50 * 1024 * 1024); // audit N5: import cap 50 MB
  return importBackup(user.id, body.mode, body.data);
});
