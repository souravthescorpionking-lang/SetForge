import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { measurementRecordCreateSchema } from "@/lib/schemas";
import { listRecords, createRecord } from "@/server/services/measurement-service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return { records: await listRecords(user.id, id) };
});

export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, measurementRecordCreateSchema);
  return createRecord(user.id, id, body);
});
