"use client";

// ─────────────────────────────────────────────────────────────────────────────
// schedule-shared.tsx — plumbing shared by every schedule-creating surface
// (Home TodayCard ⋮ · Programs rows ⋮ · Program detail · Schedule picker ·
// Calendar SelectedDayPanel).
//
//   DatePickerDialog       → the one allowed non-destructive modal: a date
//                            picker Dialog (react-day-picker), past days
//                            disabled.
//   useScheduleCreate()    → scheduleApi.create + 409 CONFLICT handling
//                            (Replace confirm AlertDialog + retry with
//                            replace:true) + success toast with an Undo action
//                            (deletes the entry) + offline outbox routing.
//   useScheduleMutations() → entry mutations (skip / reopen / move / remove)
//                            with invalidation + toasts. ALSO registers the
//                            app QueryClient so toast-action Undos (fired
//                            outside React) can invalidate too.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { ApiError, scheduleApi } from "@/lib/client/api";
import { useInvalidate, useOnline } from "@/lib/client/query";
import { queueMutation } from "@/lib/client/offline";
import { formatDayLabel } from "@/lib/client/format";
import type { ScheduleEntryDTO } from "@/lib/types";
import { dateToLocalKey, keyToLocalDate } from "@/features/today/day-utils";
import { errorMessage } from "@/features/routines/screen-helpers";

// The app QueryClient, captured by the hooks below so toast-action callbacks
// (fired outside React) can invalidate the schedule/dashboard queries.
let sharedClient: QueryClient | null = null;

function invalidateScheduleQueries(): void {
  sharedClient?.invalidateQueries({ queryKey: ["schedule"] });
  sharedClient?.invalidateQueries({ queryKey: ["dashboard"] });
  sharedClient?.invalidateQueries({ queryKey: ["programs"] });
}

// ---------- date picker dialog ----------

export function DatePickerDialog({
  open,
  onOpenChange,
  onSelect,
  initialKey,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with a YYYY-MM-DD key when a (non-past) day is picked. */
  onSelect: (dayKey: string) => void;
  /** Initially highlighted day key. */
  initialKey?: string;
  title: string;
  description?: string;
}) {
  const today = keyToLocalDate(new Date().toISOString().slice(0, 10));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-auto max-w-[calc(100vw-2rem)] p-4">
        <DialogHeader className="text-left">
          <DialogTitle>{title}</DialogTitle>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </DialogHeader>
        <Calendar
          mode="single"
          weekStartsOn={1}
          selected={initialKey ? keyToLocalDate(initialKey) : undefined}
          defaultMonth={initialKey ? keyToLocalDate(initialKey) : today}
          disabled={{ before: today }}
          onSelect={(d) => {
            if (!d) return;
            onSelect(dateToLocalKey(d));
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------- create with conflict handling ----------

/** 409 CONFLICT details payload (see the API contract). */
export type ScheduleConflictDetails = {
  date: string;
  entryId: string;
  routineName: string;
  dayName?: string | null;
};

export type ScheduleCreateArgs = {
  date: string; // YYYY-MM-DD
  routineId: string;
  dayId?: string;
  /** Pre-formatted success message, e.g. "Scheduled Push Day · Push for 3 Oct". */
  toastLabel: string;
  /** Runs after a successful create (navigation etc.). */
  onSuccess?: (entry: ScheduleEntryDTO) => void;
};

/** Best-effort back navigation: history when available, else the calendar. */
export function goBackOrCalendar(dateKey: string): void {
  if (window.history.length > 1) window.history.back();
  else window.location.hash = `#/calendar?date=${dateKey}`;
}

export function useScheduleCreate(): {
  create: (args: ScheduleCreateArgs) => Promise<ScheduleEntryDTO | null>;
  /** Render wherever convenient — the Replace confirm AlertDialog. */
  conflictDialog: ReactNode;
} {
  const online = useOnline();
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const [conflict, setConflict] = useState<
    (ScheduleCreateArgs & { details: ScheduleConflictDetails }) | null
  >(null);

  useEffect(() => {
    sharedClient = qc;
    return () => {
      if (sharedClient === qc) sharedClient = null;
    };
  }, [qc]);

  const create = useCallback(
    async (args: ScheduleCreateArgs): Promise<ScheduleEntryDTO | null> => {
      const payload = {
        date: args.date,
        routineId: args.routineId,
        ...(args.dayId ? { dayId: args.dayId } : {}),
      };
      if (!online) {
        queueMutation("/api/schedule", "POST", payload, args.toastLabel);
        invalidate.schedule();
        invalidate.programs();
        toast.info(`${args.toastLabel} — saved offline, will sync when reconnected`);
        return null;
      }
      try {
        const entry = await scheduleApi.create(payload);
        invalidate.schedule();
        invalidate.programs();
        toast.success(args.toastLabel, {
          action: {
            label: "Undo",
            onClick: () => void removeScheduleEntry(entry.id),
          },
        });
        args.onSuccess?.(entry);
        return entry;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setConflict({ ...args, details: (e.details ?? {}) as ScheduleConflictDetails });
          return null;
        }
        toast.error(errorMessage(e));
        return null;
      }
    },
    [online, invalidate],
  );

  const conflictDialog = (
    <AlertDialog open={conflict != null} onOpenChange={(o) => !o && setConflict(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Replace {conflict?.details.routineName ?? "the planned workout"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {conflict ? (
              <>
                {conflict.details.routineName}
                {conflict.details.dayName ? ` · ${conflict.details.dayName}` : ""} is already planned
                for {formatDayLabel(conflict.details.date || conflict.date)}. Replacing removes the old
                plan.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              const pending = conflict;
              setConflict(null);
              if (!pending) return;
              void (async () => {
                try {
                  const entry = await scheduleApi.create({
                    date: pending.date,
                    routineId: pending.routineId,
                    ...(pending.dayId ? { dayId: pending.dayId } : {}),
                    replace: true,
                  });
                  invalidate.schedule();
                  invalidate.programs();
                  toast.success(pending.toastLabel, {
                    action: {
                      label: "Undo",
                      onClick: () => void removeScheduleEntry(entry.id),
                    },
                  });
                  pending.onSuccess?.(entry);
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              })();
            }}
          >
            Replace
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { create, conflictDialog };
}

// ---------- entry mutations (calendar panel, toasts) ----------

/** DELETE a schedule entry + invalidate + toast. Safe outside React (Undo). */
export async function removeScheduleEntry(id: string): Promise<void> {
  try {
    await scheduleApi.remove(id);
    invalidateScheduleQueries();
    toast.success("Schedule removed");
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

/**
 * Skip / reopen / move mutations for existing entries. Registers the shared
 * QueryClient (see top) so toast Undo actions invalidate correctly.
 */
export function useScheduleMutations() {
  const online = useOnline();
  const invalidate = useInvalidate();
  const qc = useQueryClient();

  useEffect(() => {
    sharedClient = qc;
    return () => {
      if (sharedClient === qc) sharedClient = null;
    };
  }, [qc]);

  const run = useCallback(
    async (
      fn: () => Promise<unknown>,
      queue: { path: string; method: string; body?: unknown; label: string },
    ): Promise<boolean> => {
      if (!online) {
        queueMutation(queue.path, queue.method, queue.body, queue.label);
        invalidate.schedule();
        invalidate.programs();
        toast.info(`${queue.label} — saved offline, will sync when reconnected`);
        return false;
      }
      try {
        await fn();
        invalidate.schedule();
        invalidate.programs();
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          toast.error("A workout is already planned for that date");
        } else {
          toast.error(errorMessage(e));
        }
        return false;
      }
    },
    [online, invalidate],
  );

  const skipEntry = useCallback(
    async (entry: ScheduleEntryDTO) => {
      const ok = await run(
        () => scheduleApi.update(entry.id, { status: "SKIPPED" }),
        {
          path: `/api/schedule/${entry.id}`,
          method: "PUT",
          body: { status: "SKIPPED" },
          label: "Scheduled day skipped",
        },
      );
      if (ok) toast.success("Scheduled day skipped");
      return ok;
    },
    [run],
  );

  const reopenEntry = useCallback(
    async (entry: ScheduleEntryDTO) => {
      const ok = await run(
        () => scheduleApi.update(entry.id, { status: "PLANNED" }),
        {
          path: `/api/schedule/${entry.id}`,
          method: "PUT",
          body: { status: "PLANNED" },
          label: "Schedule reopened",
        },
      );
      if (ok) toast.success("Schedule reopened");
      return ok;
    },
    [run],
  );

  const moveEntry = useCallback(
    async (entry: ScheduleEntryDTO, dateKey: string) => {
      const ok = await run(
        () => scheduleApi.update(entry.id, { date: dateKey }),
        {
          path: `/api/schedule/${entry.id}`,
          method: "PUT",
          body: { date: dateKey },
          label: "Schedule moved",
        },
      );
      if (ok) toast.success(`Moved to ${formatDayLabel(dateKey)}`);
      return ok;
    },
    [run],
  );

  return { online, skipEntry, reopenEntry, moveEntry, removeEntry: removeScheduleEntry };
}
