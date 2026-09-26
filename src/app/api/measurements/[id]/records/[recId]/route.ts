import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { measurementRecordUpdateSchema } from "@/lib/schemas";
import { updateRecord, deleteRecord } from "@/server/services/measurement-service";

type Ctx = { params: Promise<{ id: string; recId: string }> };

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, recId } = await params;
  const body = await parseBody(req, measurementRecordUpdateSchema);
  return updateRecord(user.id, id, recId, body);
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, recId } = await params;
  return deleteRecord(user.id, id, recId);
});
