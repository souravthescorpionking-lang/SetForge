import { NextRequest, NextResponse } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { accountDeleteSchema } from "@/lib/schemas";
import { softDeleteAccount } from "@/server/services/account-service";
import { SESSION_COOKIE } from "@/lib/constants";

// POST /api/account/delete (Part 9 §9) — typed-DELETE confirm, then SOFT
// delete: deletedAt=now, email anonymized to deleted+{userId}@setforge.invalid,
// name cleared, every Session row destroyed. The client clears its local state
// right after; the boot-time purge job hard-deletes after 30 days.
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  // Parsing IS the gate — anything but the literal "DELETE" is a 400.
  await parseBody(req, accountDeleteSchema);
  await softDeleteAccount(user.id);
  // The server sessions are gone; drop the cookie so the browser state
  // transitions cleanly to signed-out (same shape as /api/auth/logout).
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", expires: new Date(0) });
  return res;
});
