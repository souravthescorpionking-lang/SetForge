import { handler, requireUser } from "@/server/http";
import { finishWorkout, undoFinishWorkout } from "@/server/services/program-service";

export const POST = handler(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return finishWorkout(user.id, id);
});

/** Undo (client 10s window): reverts finishedAt and best-effort reverts the cursor. */
export const DELETE = handler(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return undoFinishWorkout(user.id, id);
});
