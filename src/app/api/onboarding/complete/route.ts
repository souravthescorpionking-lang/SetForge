import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { completeOnboardingWithTemplate } from "@/server/services/profile-service";
import { onboardingCompleteSchema } from "@/lib/schemas";

/** POST /api/onboarding/complete — persists profile + first weigh-in; clears the gate. */
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, onboardingCompleteSchema);
  return completeOnboardingWithTemplate(user.id, body);
});
