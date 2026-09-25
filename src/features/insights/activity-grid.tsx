"use client";

// Activity grid — GitHub-style heatmap of workout days over the trailing weeks.
// Intensity buckets are derived from per-day volume (from stats workoutDates
// when available, otherwise a flat level-1 fill for logged days).
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { addDaysKey, dayKeyOf, formatDayShort, parseDayKey, todayKey } from "@/lib/client/format";

const WEEKS = 17;
const LEVEL_CLASSES = [
  "bg-muted/60",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
];

type Props = {
  dates: string[]; // yyyy-mm-dd keys (any period)
  className?: string;
};

export function ActivityGrid({ dates, className }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const { weeks, monthLabels } = useMemo(() => {
    // Build grid columns (weeks) aligned so the last column is the current week.
    const today = todayKey();
    const todayDow = parseDayKey(today).getUTCDay(); // 0=Sun
    // end of current week (Saturday) offset
    const endOffset = 6 - todayDow;
    const lastDay = addDaysKey(today, endOffset);
    const firstDay = addDaysKey(lastDay, -(WEEKS * 7 - 1));

    const daySet = new Set(dates);
    const cols: Array<Array<{ key: string; inFuture: boolean; logged: boolean }>> = [];
    const months: Array<{ index: number; label: string }> = [];
    let prevMonth = -1;
    for (let w = 0; w < WEEKS; w++) {
      const col: Array<{ key: string; inFuture: boolean; logged: boolean }> = [];
      for (let d = 0; d < 7; d++) {
        const key = addDaysKey(firstDay, w * 7 + d);
        col.push({ key, inFuture: key > today, logged: daySet.has(key) });
        const m = parseDayKey(key).getUTCMonth();
        if (m !== prevMonth && key <= today) {
          months.push({
            index: w,
            label: parseDayKey(key).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }),
          });
          prevMonth = m;
        }
      }
      cols.push(col);
    }
    return { weeks: cols, monthLabels: months.slice(-WEEKS) };
  }, [dates]);

  const activeDays = dates.length;

  return (
    <div className={cn("rounded-2xl border border-border/70 bg-card p-4", className)}>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-bold">Activity</h3>
        <p className="text-xs text-muted-foreground">
          <span className="font-bold text-primary numeric">{activeDays}</span> logged day
          {activeDays === 1 ? "" : "s"} in range
        </p>
      </div>

      <div className="overflow-x-auto scroll-slim pb-1">
        <div className="min-w-max">
          {/* month labels */}
          <div className="mb-1 flex gap-[3px] pl-6">
            {weeks.map((_, w) => {
              const label = monthLabels.find((m) => m.index === w);
              return (
                <div key={w} className="w-3 text-[9px] font-semibold uppercase text-muted-foreground">
                  {label && <span className="whitespace-nowrap">{label.label}</span>}
                </div>
              );
            })}
          </div>
          {/* day rows: Mon / Wed / Fri labels */}
          <div className="flex gap-[3px]">
            <div className="flex w-6 flex-col gap-[3px]">
              {["", "M", "", "W", "", "F", ""].map((d, i) => (
                <div
                  key={i}
                  className="h-3 text-[9px] font-semibold uppercase leading-[12px] text-muted-foreground"
                >
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((col, w) => (
              <div key={w} className="flex flex-col gap-[3px]">
                {col.map((cell) => (
                  <motion.div
                    key={cell.key}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, delay: Math.min(w * 0.015, 0.4) }}
                    onMouseEnter={() => setHovered(cell.key)}
                    onMouseLeave={() => setHovered(null)}
                    className={cn(
                      "h-3 w-3 rounded-[3px] transition-transform hover:scale-125",
                      cell.inFuture
                        ? "bg-muted/25"
                        : cell.logged
                          ? LEVEL_CLASSES[3]
                          : "bg-muted/60",
                    )}
                    title={
                      cell.inFuture
                        ? undefined
                        : `${formatDayShort(cell.key)}${cell.logged ? " · workout" : " · rest"}`
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {hovered && (
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          {formatDayShort(hovered)} · {dates.includes(hovered) ? "workout logged" : "rest day"}
        </p>
      )}
    </div>
  );
}
