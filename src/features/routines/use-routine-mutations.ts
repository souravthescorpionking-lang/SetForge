"use client";

// Shared mutation plumbing for the Routines feature.
// Online: execute via the typed API client, invalidate the routines cache and
// surface errors as toasts. Offline: queue the raw request in the outbox so it
// replays on reconnect (AppRoot triggers a global invalidation after flushing).
import { toast } from "sonner";
import { queueMutation } from "@/lib/client/offline";
import { useInvalidate, useOnline } from "@/lib/client/query";

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Something went wrong";
}

export type QueueDescriptor = {
  path: string;
  method: string;
  body?: unknown;
  label: string;
};

/** A single queued operation of a reorder sequence. */
export type OrderOp = {
  fn: () => Promise<unknown>;
  path: string;
  method: string;
  body?: unknown;
};

export function useRoutineMutations() {
  const online = useOnline();
  const invalidate = useInvalidate();

  /**
   * Run a mutation while online (invalidates the routine cache and toasts on
   * failure); while offline queue it instead. Returns true when the change is
   * reflected on the server, false when it was only queued offline.
   */
  const run = async (fn: () => Promise<unknown>, queue: QueueDescriptor): Promise<boolean> => {
    if (!online) {
      queueMutation(queue.path, queue.method, queue.body, queue.label);
      toast.info(`${queue.label} — saved offline, will sync when reconnected`);
      return false;
    }
    try {
      await fn();
      invalidate.routines();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  /** Persist a sequence of sortOrder patches (drag-reorder of routines/days). */
  const runOrder = async (label: string, ops: OrderOp[]) => {
    if (!online) {
      for (const op of ops) queueMutation(op.path, op.method, op.body, label);
      toast.info(`${label} — saved offline, will sync when reconnected`);
      return;
    }
    try {
      for (const op of ops) await op.fn();
      invalidate.routines();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return { online, run, runOrder, invalidate };
}
