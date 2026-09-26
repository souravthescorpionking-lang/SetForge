import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { deleteAccount } from "@/server/services/auth-service";

export const DELETE = handler(async (_req: NextRequest) => {
  const user = await requireUser();
  await deleteAccount(user.id);
  return { ok: true };
});
