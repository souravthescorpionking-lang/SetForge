import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { difficultyPatchSchema } from "@/lib/schemas";
import { changeDifficulty } from "@/server/services/program-service";

/** PATCH /api/user/difficulty (Part 9 §2) — global difficulty switch. */
export const PATCH = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, difficultyPatchSchema);
  return changeDifficulty(user.id, body.difficulty);
});
