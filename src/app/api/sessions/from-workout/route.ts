import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { sessionFromWorkoutSchema } from "@/lib/schemas";
import { sessionFromWorkout } from "@/server/services/program-service";

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, sessionFromWorkoutSchema);
  return sessionFromWorkout(user.id, body);
});
