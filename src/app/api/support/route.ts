import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { supportTicketSchema } from "@/lib/schemas";
import { createSupportTicket } from "@/server/services/account-service";

// POST /api/support (Part 9 §9) — create a SupportTicket for the signed-in
// user. Zod-validated (subject ≥3 ≤120, body ≥10 ≤4000); the service enforces
// the 5-per-rolling-24h limit and throws a 400 with the readable message.
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const input = await parseBody(req, supportTicketSchema);
  return createSupportTicket(user.id, input);
});
