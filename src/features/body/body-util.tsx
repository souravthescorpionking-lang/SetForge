"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Body feature helpers — ported from the legacy body files (offline-mutation.ts
// + delta-chip.tsx) so the legacy views can be deleted in p3-9 without breaking
// the Part 3 rebuild. Self-contained: no imports from legacy body components.
// ─────────────────────────────────────────────────────────────────────────────

import { toast } from "sonner";
import { useOnline } from "@/lib/client/query";
import { queueMutation } from "@/lib/client/offline";
import { ApiError } from "@/lib/client/api";
import { round2 } from "@/lib/client/format";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";

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

/** Local calendar-day key of an ISO timestamp (body entries are wall-clock). */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's date as a native <input type="date"> value (local wall clock). */
export function localTodayInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * date / datetime-local input value → ISO string (undefined when invalid).
 * Accepts both "yyyy-mm-dd" (native date input, → local midnight) and
 * "yyyy-mm-ddThh:mm" (datetime-local) values.
 */
export function dateInputToIso(v: string): string | undefined {
  if (!v) return undefined;
  const s = v.length === 10 ? `${v}T00:00` : v;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Signed compact delta ("+0.1" / "−0.5" / "±0"). */
export function signedDelta(delta: number): string {
  const v = Math.round(delta * 100) / 100;
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)}`;
}

/** Goal-direction-aware tone for a value delta (up is only good when the goal says so). */
export function deltaTone(goalType: string, delta: number): "good" | "bad" | "flat" {
  if (Math.abs(delta) < 0.005) return "flat";
  if (goalType === "INCREASE") return delta > 0 ? "good" : "bad";
  if (goalType === "DECREASE") return delta < 0 ? "good" : "bad";
  return "flat";
}

const TONE_CLASS = {
  good: "text-emerald-500",
  bad: "text-red-500",
  flat: "text-muted-foreground",
} as const;

/**
 * Compact delta line for narrow right columns (Track 120px / History 56px).
 * SPECIFIC goals show the distance to target instead of a delta.
 */
export function DeltaLine({
  goalType,
  last,
  prev,
  target,
  className,
}: {
  goalType: string;
  last: number | null;
  prev: number | null;
  target: number | null;
  className?: string;
}) {
  if (last == null) {
    return (
      <span className={cn("numeric text-[11px] text-muted-foreground", className)}>–</span>
    );
  }
  if (goalType === "SPECIFIC" && target != null) {
    const diff = Math.round((last - target) * 100) / 100;
    if (Math.abs(diff) < 0.005) {
      return (
        <span className={cn("numeric text-[11px] font-semibold text-emerald-500", className)}>at target</span>
      );
    }
    return (
      <span className={cn("numeric text-[11px] font-semibold text-amber-500", className)}>
        <Target className="mr-0.5 inline h-3 w-3" aria-hidden />
        {round2(Math.abs(diff))} to go
      </span>
    );
  }
  if (prev == null) {
    return (
      <span className={cn("numeric text-[11px] text-muted-foreground", className)}>first entry</span>
    );
  }
  const delta = Math.round((last - prev) * 100) / 100;
  const tone = deltaTone(goalType, delta);
  return (
    <span className={cn("numeric text-[11px] font-semibold", TONE_CLASS[tone], className)}>
      {signedDelta(delta)}
    </span>
  );
}
