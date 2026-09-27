"use client";

// Offline-aware mutation helper for the Today feature.
// Online: runs the API call and returns its result.
// Offline: queues the same request descriptor via the shared outbox and returns null,
// so callers skip response-dependent behaviour (PR toast, auto-advance, …).
import { useCallback } from "react";
import { useInvalidate, useOnline } from "@/lib/client/query";
import { queueMutation } from "@/lib/client/offline";
import { toast } from "sonner";
import { hapticError } from "@/lib/client/haptics";

export type OfflineQueue = { path: string; method: string; body?: unknown };

/**
 * Usage:
 *   const mutate = useMutate();
 *   const set = await mutate({
 *     label: "Set saved",
 *     run: () => workoutsApi.addSet(workoutId, weId, values),
 *     queue: { path: `/api/workouts/${workoutId}/exercises/${weId}/sets`, method: "POST", body: values },
 *   });
 */
export function useMutate() {
  const online = useOnline();
  const invalidate = useInvalidate();

  return useCallback(
    async <T>(opts: { label?: string; run: () => Promise<T>; queue: OfflineQueue }): Promise<T | null> => {
      if (!online) {
        queueMutation(opts.queue.path, opts.queue.method, opts.queue.body, opts.label);
        toast.info("Saved offline — will sync when back online", {
          description: opts.label,
        });
        return null;
      }
      try {
        return await opts.run();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Something went wrong";
        hapticError(); // §4.17 — error feedback
        toast.error(message);
        return null;
      } finally {
        invalidate.workout();
      }
    },
    [online, invalidate],
  );
}
