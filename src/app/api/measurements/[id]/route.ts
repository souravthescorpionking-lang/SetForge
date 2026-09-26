import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { measurementUpdateSchema } from "@/lib/schemas";
import { updateMeasurement, deleteMeasurement } from "@/server/services/measurement-service";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, measurementUpdateSchema);
  return updateMeasurement(user.id, id, body);
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return deleteMeasurement(user.id, id);
});
