import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { adoptMany } from "@/server/services/library-service";
import { z } from "zod";

const adoptManySchema = z.object({
  keys: z.array(z.string().min(1)).min(1).max(500),
});

/** POST /api/library/adopt-many — bulk adopt ("Add all favourites…"). */
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, adoptManySchema);
  return adoptMany(user.id, body.keys);
});
