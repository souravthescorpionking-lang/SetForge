import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { workoutSettingsPatchSchema } from "@/lib/schemas";
import { updateSettings } from "@/server/services/settings-service";

/**
 * PATCH /api/workout-settings — Part 10 §3.5/§3.1: the live-session settings
 * surface. Body keys use the spec's WorkoutSettings names; autoAdvance maps
 * onto the existing UserSettings.autoMoveNextSet (single source per setting —
 * the UserSettings singleton IS the spec's WorkoutSettings table). Returns the
 * full refreshed settings row so callers can replace their cache in one shot.
 */
export const PATCH = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const patch = await parseBody(req, workoutSettingsPatchSchema);
  return updateSettings(user.id, {
    ...(patch.autoAdvance !== undefined ? { autoMoveNextSet: patch.autoAdvance } : {}),
    ...(patch.countdownSounds !== undefined ? { countdownSounds: patch.countdownSounds } : {}),
    ...(patch.showTempo !== undefined ? { showTempo: patch.showTempo } : {}),
    ...(patch.videoSpeed !== undefined ? { videoSpeed: patch.videoSpeed } : {}),
  });
});
