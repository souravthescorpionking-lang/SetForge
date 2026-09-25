"use client";

// Expandable workout card for the history timeline.
// Collapsed: date block + metrics + category dots.
// Expanded: fetches the full workout tree and lists exercises with sets.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryDot } from "@/components/shared/category-dot";
import {
  ChevronDown,
  Clock,
  Copy,
  Dumbbell,
  Layers,
  MoreVertical,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WarmupBadge } from "@/components/shared/warmup-badge";
import { workoutsApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import {
  dayKeyOf,
  formatDayLabel,
  formatDayLong,
  formatDistance,
  formatSec,
  parseDayKey,
  round1,
  setSummary,
} from "@/lib/client/format";
import type { WorkoutSummaryDTO } from "@/lib/types";

type Props = {
  workout: WorkoutSummaryDTO;
  onOpenDay: (dateKey: string) => void;
  onDelete: (workout: WorkoutSummaryDTO) => void;
  onCopy: (workout: WorkoutSummaryDTO) => void;
};

export function WorkoutCard({ workout, onOpenDay, onDelete, onCopy }: Props) {
  const [expanded, setExpanded] = useState(false);
  const dateKey = dayKeyOf(workout.date);
  const day = parseDayKey(dateKey);
  const hasDuration = workout.durationSec > 0;
  const hasDistance = workout.distance > 0;

  // full tree fetched lazily on first expand
  const detail = useQuery({
    queryKey: qk.workoutByDate(dateKey),
    queryFn: () => workoutsApi.byDate(dateKey),
    enabled: expanded,
  });

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-2xl border-border/70 bg-card transition-colors",
        expanded && "border-primary/30",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-stretch gap-3 p-3 text-left transition-colors hover:bg-muted/40 sm:gap-4 sm:p-4"
      >
        {/* date block */}
        <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 px-1 py-2 text-primary sm:w-16">
          <span className="text-xl font-black leading-none numeric sm:text-2xl">
            {day.getUTCDate()}
          </span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide opacity-80">
            {day.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })}
          </span>
          <span className="text-[10px] uppercase tracking-wide opacity-60">
            {day.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })}
          </span>
        </div>

        {/* body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold sm:text-base">
                {workout.comment?.trim() || formatDayLong(dateKey)}
              </p>
              {/* only show the short date when a comment replaced the date-as-title */}
              {workout.comment?.trim() && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDayLabel(dateKey)}
                </p>
              )}
            </div>
            <ChevronDown
              className={cn(
                "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
                expanded && "rotate-180 text-primary",
              )}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Dumbbell className="h-3.5 w-3.5" />
              <span className="numeric">{workout.exerciseCount}</span> ex
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              <span className="numeric">{workout.setCount}</span> sets
            </span>
            {workout.volume > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                <span className="font-black text-primary numeric">
                  {round1(workout.volume)}
                </span>
                kg vol
              </span>
            )}
            {hasDuration && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {formatSec(workout.durationSec)}
              </span>
            )}
            {hasDistance && (
              <span className="inline-flex items-center gap-1.5">
                {formatDistance(workout.distance)}
              </span>
            )}
          </div>

          {workout.categories.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {workout.categories.map((c) => (
                <span
                  key={c.name}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  <CategoryDot colour={c.colour} className="h-2 w-2" />
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* expanded detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="overflow-hidden border-t border-border/60"
          >
            <div className="p-3 sm:p-4">
              {detail.isLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-3/4 rounded-xl" />
                </div>
              )}

              {detail.isError && (
                <p className="py-4 text-center text-sm text-destructive">
                  Could not load this workout.
                </p>
              )}

              {detail.data?.workout?.exercises.map((we) => {
                const sets = we.sets.filter((s) => !s.isComplete || s.weight != null || s.reps != null);
                const shown = sets.length > 0 ? sets : we.sets;
                return (
                  <div
                    key={we.id}
                    className="mb-2 rounded-xl bg-muted/30 px-3 py-2.5 last:mb-0"
                  >
                    <div className="flex items-center gap-2">
                      {we.exercise.category?.colour && (
                        <CategoryDot colour={we.exercise.category.colour} className="h-2.5 w-2.5" />
                      )}
                      <p className="truncate text-sm font-semibold">
                        {we.exercise.name}
                      </p>
                      <span className="ml-auto shrink-0 text-[10px] font-medium text-muted-foreground">
                        <span className="numeric">{we.sets.length}</span> sets
                      </span>
                    </div>
                    {shown.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {shown.map((s, i) => (
                          <div
                            key={s.id}
                            className="flex items-baseline gap-2 text-xs text-muted-foreground"
                          >
                            {s.isWarmup ? (
                              <WarmupBadge className="h-4 w-4 rounded text-[9px]" />
                            ) : (
                              <span className="w-4 shrink-0 text-right font-bold text-primary/70 numeric">
                                {i + 1}
                              </span>
                            )}
                            <span className={cn("font-medium", s.isWarmup ? "text-muted-foreground" : "text-foreground/90")}>
                              {setSummary(s)}
                            </span>
                            {s.comment && (
                              <span className="truncate italic opacity-70">
                                {s.comment}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {detail.data?.workout && detail.data.workout.exercises.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Empty workout — no exercises logged.
                </p>
              )}

              {/* actions */}
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-10 flex-1 rounded-xl"
                  onClick={() => onOpenDay(dateKey)}
                >
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Open day
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 rounded-xl"
                  onClick={() => onCopy(workout)}
                >
                  <Copy className="mr-1.5 h-4 w-4" />
                  Copy
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0 rounded-xl"
                      aria-label="More workout actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDelete(workout)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete workout
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onOpenDay(dateKey)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open in day view
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
