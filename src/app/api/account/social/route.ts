import { NextRequest } from "next/server";
import { z } from "zod";
import { handler, parseBody, requireUser } from "@/server/http";
import {
  linkSocialProvider,
  listSocialProviders,
  unlinkSocialProvider,
} from "@/server/services/account-service";

// Provider param — the client also sends an `action` discriminator
// ("link" | "unlink"); accepted and stripped so the two verbs stay one surface.
const socialActionSchema = z.object({
  provider: z.string().trim().min(1).max(40),
  action: z.enum(["link", "unlink"]).optional(),
});

// GET /api/account/social (Part 9 §9) — env-configured provider list with an
// honest `linked` state (no OAuth flow in this deployment → always false).
export const GET = handler(async (_req: NextRequest) => {
  await requireUser();
  return listSocialProviders();
});

// POST /api/account/social {provider} — link. Always an honest 200 {ok:false}
// in this build (message explains why); never a faked success.
export const POST = handler(async (req: NextRequest) => {
  await requireUser();
  const { provider } = await parseBody(req, socialActionSchema);
  return linkSocialProvider(provider);
});

// DELETE /api/account/social {provider} — unlink. Nothing can be linked in
// this deployment, so this always rejects with 400 "No linked account".
export const DELETE = handler(async (req: NextRequest) => {
  await requireUser();
  const { provider } = await parseBody(req, socialActionSchema);
  return unlinkSocialProvider(provider);
});
