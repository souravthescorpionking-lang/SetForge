import type { NextRequest } from "next/server";
import { handler, parseBody, rateLimit, requireUser, badRequest, clientIp } from "@/server/http";
import { z } from "zod";

const clientErrorSchema = z.object({
  message: z.string().min(1).max(1000),
  stack: z.string().max(1000).optional(),
  route: z.string().max(200).optional(),
  url: z.string().max(500).optional(),
});

// In-memory ring buffer (last 100) — surfaced in server logs, not persisted.
const ring: unknown[] = [];

/** POST /api/client-errors — rate-limited, 2 KB max body, fire-and-forget from the UI. */
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser().catch(() => null);
  rateLimit(`client-error:${user?.id ?? clientIp(req)}`);
  const body = await parseBody(req, clientErrorSchema, 2048).catch(() => null);
  if (!body) throw badRequest("Invalid client error payload");
  const entry = { ...body, userId: user?.id ?? null, at: new Date().toISOString() };
  ring.push(entry);
  if (ring.length > 100) ring.shift();
  console.error("[client-error]", JSON.stringify(entry));
  return { ok: true };
});
