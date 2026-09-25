"use client";

// Offline-aware mutation helper + datetime-local conversions for the Body feature.

import { toast } from "sonner";
import { useOnline } from "@/lib/client/query";
import { queueMutation } from "@/lib/client/offline";
import { ApiError } from "@/lib/client/api";

export type BodyAction = {
  path: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  label: string;
  run: () => Promise<unknown>;
  successMsg?: string;
  onDone?: () => void;
};

/** Runs a mutation online, or queues it for later sync when offline. */
export function useBodyAction() {
  const online = useOnline();
  return async (a: BodyAction): Promise<boolean> => {
    if (!online) {
      queueMutation(a.path, a.method, a.body, a.label);
      toast.info(`${a.label} — saved offline, will sync when reconnected`);
      a.onDone?.();
      return true;
    }
    try {
      await a.run();
      if (a.successMsg) toast.success(a.successMsg);
      a.onDone?.();
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : `Could not save: ${a.label}`);
      return false;
    }
  };
}

/** Date → value for <input type="datetime-local"> (local wall-clock, minutes). */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local input value → ISO string (undefined when invalid/empty). */
export function localInputToIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** "14:35" style local time label for an ISO timestamp. */
export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Local calendar-day key of an ISO timestamp (body entries are wall-clock). */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Fri 26 Sep" label for a local day key. */
export function localDayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}

export function signedDelta(delta: number): string {
  const v = Math.round(delta * 100) / 100;
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)}`;
}
