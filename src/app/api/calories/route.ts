import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser, badRequest } from "@/server/http";
import { getCalories, putCalories } from "@/server/services/calories-service";
import { caloriesPutSchema } from "@/lib/schemas";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/calories?date=YYYY-MM-DD */
export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) throw badRequest("date must be YYYY-MM-DD");
  return getCalories(user.id, date);
});

/** PUT /api/calories?date=YYYY-MM-DD { kcal: number|null, note? } */
export const PUT = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) throw badRequest("date must be YYYY-MM-DD");
  const body = await parseBody(req, caloriesPutSchema);
  return putCalories(user.id, date, body.kcal, body.note);
});
