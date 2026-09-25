import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { measurementCreateSchema } from "@/lib/schemas";
import { listMeasurements, createMeasurement } from "@/server/services/measurement-service";

export const GET = handler(async () => {
  const user = await requireUser();
  return { measurements: await listMeasurements(user.id) };
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, measurementCreateSchema);
  return createMeasurement(user.id, body);
});
