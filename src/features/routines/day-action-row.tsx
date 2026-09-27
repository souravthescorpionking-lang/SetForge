"use client";

// ─────────────────────────────────────────────────────────────────────────────
// day-action-row.tsx — Part 6 §4.5/§4.6 shared DayActionRow (48px, 4 equal
// cells, icon + 12px label):
//
//   [☆ Favourite] [Schedule] [History] [Mark off]
//
// Favourite and Mark off OWN their mutations here (programsMetaApi
// favouriteDay / markOff / unmarkOff) with optimistic star, toasts + Undo;
// Schedule and History delegate to the parent (date-picker dialog owner) /
// navigate straight to the history screen. Rendered at the top of a routine
// day body on BOTH the program detail screen and the day detail screen.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CalendarClock, CheckCircle2, History, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { useOnline } from "@/lib/client/query";
import { programsMetaApi } from "@/lib/client/api";
import { errorMessage } from "./screen-helpers";
import { useProgramExtras, unmarkDayOffFull } from "./program-meta";

export interface DayActionRowProps {
  routineId: string;
  dayId: string;
  dayName: string;
  /** Day favourite from the RoutineDayDTO (render-adjust resync after refetch). */
  isFavorite: boolean;
  /** Completed state from the parent's merged completedDayIds set. */
  isCompleted: boolean;
  /** Parent opens its DatePickerDialog (owns useScheduleCreate). */
  onSchedule: () => void;
  /** Notified after mark/unmark so the parent syncs its Done chip + ring. */
  onCompletedChange?: (completed: boolean) => void;
}

const CELL_CLS =
  "flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function DayActionRow({
  routineId,
  dayId,
  dayName,
  isFavorite,
  isCompleted,
  onSchedule,
  onCompletedChange,
}: DayActionRowProps) {
  const navigate = useApp((s) => s.navigate);
  const online = useOnline();
  const qc = useQueryClient();
  const invalidateExtras = useProgramExtras();

  // optimistic day-favourite state (reset during render once the server
  // RoutineDayDTO catches up — same pattern as the routines-screen tab sync)
  const [favPending, setFavPending] = useState<boolean | null>(null);
  const fav = favPending ?? isFavorite;
  if (favPending != null && favPending === isFavorite) setFavPending(null);

  const toggleFavourite = async () => {
    if (!online) {
      toast.info("Favourite days need a connection");
      return;
    }
    const next = !fav;
    setFavPending(next);
    try {
      const res = await programsMetaApi.favouriteDay(routineId, dayId);
      setFavPending(res.isFavorite);
      invalidateExtras(routineId);
      toast.success(res.isFavorite ? `“${dayName}” favourited` : `“${dayName}” unfavourited`);
    } catch (e) {
      setFavPending(null);
      toast.error(errorMessage(e));
    }
  };

  const unmarkOff = async (quiet = false) => {
    if (!online) {
      toast.info("Unmarking needs a connection");
      return;
    }
    try {
      await unmarkDayOffFull(routineId, dayId);
      invalidateExtras(routineId);
      onCompletedChange?.(false);
      if (!quiet) toast.success(`“${dayName}” unmarked`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const markOff = async () => {
    if (!online) {
      toast.info("Marking a day off needs a connection");
      return;
    }
    try {
      const res = await programsMetaApi.markOff(routineId, dayId);
      invalidateExtras(routineId);
      onCompletedChange?.(true);
      toast.success(`Day marked off${res.advanced ? " · program advanced" : ""}`, {
        action: {
          label: "Undo",
          onClick: () => void unmarkOff(true),
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // keep the button labels short + single-line (fixed 48px row law)
  const labelCls = "text-[12px] font-semibold leading-none";
  const iconCls = "h-4 w-4 flex-none";

  return (
    <div
      data-row
      role="toolbar"
      aria-label={`Actions for ${dayName}`}
      className="grid h-12 w-full flex-none grid-cols-4 gap-1 overflow-hidden whitespace-nowrap rounded-lg border bg-card p-0.5"
    >
      <Button
        type="button"
        variant="ghost"
        className={cn(CELL_CLS, fav && "text-amber-500 hover:text-amber-500")}
        aria-pressed={fav}
        aria-label={fav ? `Unfavourite ${dayName}` : `Favourite ${dayName}`}
        onClick={() => void toggleFavourite()}
      >
        <Star className={iconCls} aria-hidden fill={fav ? "currentColor" : "none"} />
        <span className={labelCls}>{fav ? "Favourited" : "Favourite"}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className={CELL_CLS}
        aria-label={`Schedule ${dayName}`}
        onClick={onSchedule}
      >
        <CalendarClock className={iconCls} aria-hidden />
        <span className={labelCls}>Schedule</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className={CELL_CLS}
        aria-label={`History for ${dayName}`}
        onClick={() => navigate(`/history?routineId=${routineId}&dayId=${dayId}`)}
      >
        <History className={iconCls} aria-hidden />
        <span className={labelCls}>History</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        className={cn(CELL_CLS, isCompleted && "text-emerald-600 dark:text-emerald-400")}
        aria-label={isCompleted ? `Unmark ${dayName}` : `Mark ${dayName} off`}
        onClick={() => (isCompleted ? void unmarkOff() : void markOff())}
      >
        <CheckCircle2 className={iconCls} aria-hidden />
        <span className={labelCls}>{isCompleted ? "Marked off" : "Mark off"}</span>
      </Button>
    </div>
  );
}
