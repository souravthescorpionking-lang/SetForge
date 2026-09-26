import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { z } from "zod";
import { deleteWorkoutHistory } from "@/server/services/account-service";

const historyDeleteSchema = z.object({
  mode: z.enum(["all", "range", "exercise"]),
  from: z.string().optional(),
  to: z.string().optional(),
  exerciseId: z.string().optional(),
});

export const DELETE = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, historyDeleteSchema);
  return deleteWorkoutHistory(user.id, body);
});
