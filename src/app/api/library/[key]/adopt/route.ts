import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { adoptExercise } from "@/server/services/library-service";
import { z } from "zod";

type Ctx = { params: Promise<{ key: string }> };

const adoptSchema = z.object({
  favourite: z.boolean().optional(),
});

/** POST /api/library/:key/adopt — add to my exercises (optionally starred). */
export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { key } = await params;
  const body = await parseBody(req, adoptSchema).catch(() => ({} as z.infer<typeof adoptSchema>));
  return adoptExercise(user.id, key, { favourite: body?.favourite });
});
