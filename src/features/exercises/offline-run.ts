"use client";

// Offline-aware mutation runner for exercise features.
// Online: await the API call. Offline: queue via localStorage outbox + toast.
import { toast } from "sonner";
import { useOnline } from "@/lib/client/query";
import { queueMutation } from "@/lib/client/offline";

export type OfflineRunOpts = {
  /** Human label used in toasts, e.g. "Exercise". */
  label: string;
  path: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** The actual API call (skipped while offline). */
  run: () => Promise<unknown>;
  successMsg?: string;
  /** Called after success (or after queueing offline). */
  onDone?: () => void;
  /** false = this operation cannot be queued (needs a response id, etc.) */
  queueable?: boolean;
};

/** Returns a runner fn → true when the change was applied or queued. */
export function useOfflineRun() {
  const online = useOnline();
  return async (opts: OfflineRunOpts): Promise<boolean> => {
    if (!online) {
      if (opts.queueable === false) {
        toast.error(`${opts.label} needs a connection`, {
          description: "Reconnect and try again.",
        });
        return false;
      }
      queueMutation(opts.path, opts.method, opts.body, opts.label);
      toast.info(`${opts.label} saved offline`, {
        description: "It will sync automatically when you reconnect.",
      });
      opts.onDone?.();
      return true;
    }
    try {
      await opts.run();
      if (opts.successMsg) toast.success(opts.successMsg);
      opts.onDone?.();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${opts.label} failed`);
      return false;
    }
  };
}
