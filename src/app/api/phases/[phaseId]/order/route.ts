import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { phaseOrderSchema } from "@/lib/schemas";
import { putPhaseOrder, resetPhaseOrder } from "@/server/services/program-catalog";

/** PUT /api/phases/:id/order { dayOrder } — Part 9 §4 Program tab drag: save
 *  the per-user PhaseOverride (day ids in the new order). */
export const PUT = handler(async (req: NextRequest, ctx) => {
  const user = await requireUser();
  const { phaseId } = await ctx.params;
  const body = await parseBody(req, phaseOrderSchema);
  return putPhaseOrder(user.id, phaseId, body.dayOrder);
});

/** DELETE /api/phases/:id/order — Part 9 §4 Reset Order: drop the override. */
export const DELETE = handler(async (_req: NextRequest, ctx) => {
  const user = await requireUser();
  const { phaseId } = await ctx.params;
  return resetPhaseOrder(user.id, phaseId);
});
