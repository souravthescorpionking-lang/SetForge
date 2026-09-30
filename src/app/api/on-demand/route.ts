import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { listOnDemand } from "@/server/services/on-demand-service";

import { z } from "zod";
import { DIFFICULTIES } from "@/lib/constants";

const DURATION_BANDS = ["LE20", "20_45", "GE45"] as const;
const EQUIPMENT_LEVELS = ["NONE", "MINIMAL", "GYM"] as const;
const MUSCLE_VALUES = [
  "CHEST", "BACK", "LATS", "TRAPS", "SHOULDERS", "BICEPS", "TRICEPS", "FOREARMS",
  "ABS", "OBLIQUES", "LOWER_BACK", "GLUTES", "QUADS", "HAMSTRINGS", "CALVES",
  "ADDUCTORS", "ABDUCTORS", "NECK", "FULL_BODY", "CARDIO",
] as const;

/**
 * Comma-joined multi-value query param → string[] of the allowed values only
 * (unknown entries are dropped, not 400s — same lenient posture as the §3/§4
 * program query schemas).
 */
function csvEnum(allowed: readonly string[]) {
  return z
    .string()
    .optional()
    .transform((raw) =>
      raw
        ? raw
            .split(",")
            .map((v) => v.trim())
            .filter((v) => (allowed as readonly string[]).includes(v))
        : undefined,
    );
}

/** GET /api/on-demand (§7) — query schema. */
export const onDemandQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  intensity: csvEnum(DIFFICULTIES),
  muscles: csvEnum(MUSCLE_VALUES),
  duration: z.enum(DURATION_BANDS).optional().catch(undefined),
  equipment: csvEnum(EQUIPMENT_LEVELS),
});

/** GET /api/on-demand — Part 9 §7 server-filtered On Demand catalog. */
export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const query = onDemandQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return listOnDemand(user.id, query);
});
