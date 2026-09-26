import { NextRequest } from "next/server";
import { handler, parseBody, rateLimit, clientIp } from "@/server/http";
import { resetRequestSchema } from "@/lib/schemas";
import { requestPasswordReset } from "@/server/services/auth-service";

// Password reset request (audit B8). Always 200 — never reveals account existence.
// Rate-limited; tokens are single-use, hashed at rest, 1h TTL.
export const POST = handler(async (req: NextRequest) => {
  rateLimit(`reset:${clientIp(req)}`);
  const body = await parseBody(req, resetRequestSchema);
  return requestPasswordReset(body);
});
