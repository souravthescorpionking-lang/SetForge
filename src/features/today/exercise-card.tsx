"use client";

// A single workout-exercise card in the day view: name, category bar,
// last-N-set previews, completion progress, history hint, select checkbox,
// drag handle. Tap → training screen; long-press → multi-select mode.
import { useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, CheckCircle2, Circle, GripVertical, History, Trophy } from "lucide-react";
import type { SetDTO, WorkoutExerciseDTO, WorkoutGroupDTO } from "@/lib/types";
import { relativeFromNow, round1, setSummary } from "@/lib/client/format";
import { estOneRm } from "@/lib/formulas";
import { cn } from "@/lib/utils";
import { WarmupBadge } from "@/components/shared/warmup-badge";

export function ExerciseCard({
  we,
  group,
  showCategory,
  homeSetsShown,
  markSetsComplete,
  selectMode,
  isSelected,
  onOpen,
  onToggleSelect,
  onLongPress,
}: {
  we: WorkoutExerciseDTO;
  group: WorkoutGroupDTO | null;
  showCategory: boolean;
  homeSetsShown: number;
  markSetsComplete: boolean;
  selectMode: boolean;
  isSelected: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onLongPress: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: we.id });

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const ex = we.exercise;
  const sets = [...we.sets].sort((a, b) => a.sortOrder - b.sortOrder);
  const preview = sets.slice(-Math.max(1, homeSetsShown));
  const previewOffset = sets.length - preview.length;
  const doneCount = sets.filter((s) => s.isComplete).length;
  const pct = sets.length ? Math.round((doneCount / sets.length) * 100) : 0;

  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (selectMode) onToggleSelect();
    else onOpen();
  };

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/card relative touch-manipulation overflow-hidden rounded-2xl border bg-card shadow-sm transition-[box-shadow,border-color,transform]",
        isDragging && "z-20 opacity-80 shadow-2xl ring-2 ring-primary/60",
        isSelected && "border-primary/60 ring-1 ring-primary/40",
        !selectMode && "cursor-pointer hover:border-primary/40 hover:shadow-md active:scale-[0.99]",
      )}
      role="button"
      tabIndex={0}
      aria-label={`Open ${ex.name}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      onTouchStart={() => {
        if (selectMode) return;
        suppressClick.current = false;
        pressTimer.current = setTimeout(() => {
          suppressClick.current = true;
          onLongPress();
          try {
            navigator.vibrate?.(12);
          } catch {
            /* noop */
          }
        }, 550);
      }}
      onTouchEnd={clearPress}
      onTouchMove={clearPress}
      onTouchCancel={clearPress}
      onContextMenu={(e) => {
        if (!selectMode) e.preventDefault();
      }}
    >
      {showCategory && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ backgroundColor: ex.category?.colour ?? "var(--muted-foreground)" }}
        />
      )}

      <div className="flex items-start gap-1 p-4 pl-5 sm:pl-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-tight sm:text-base">{ex.name}</h3>
            {group && (
              <span
                className="inline-flex max-w-[9rem] items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{ backgroundColor: group.colour }}
                title={`Superset: ${group.name}`}
              >
                <span className="truncate">{group.name}</span>
              </span>
            )}
            <span className="numeric shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {sets.length} {sets.length === 1 ? "set" : "sets"}
            </span>
          </div>

          {(() => {
            // one-line block summary: volume · best e1RM · avg RPE (working sets only)
            const done = sets.filter((x) => x.isComplete && !x.isWarmup);
            if (done.length === 0) return null;
            let vol = 0;
            let best = 0;
            let rpeSum = 0;
            let rpeN = 0;
            for (const x of done) {
              vol += (x.weight ?? 0) * (x.reps ?? 0);
              if (x.weight != null && x.reps != null && x.reps >= 1 && x.reps <= 10 && (x.setType ?? "NORMAL") !== "FAILURE") {
                best = Math.max(best, estOneRm(x.weight, x.reps));
              }
              if (x.rpe != null) { rpeSum += x.rpe; rpeN++; }
            }
            const bits: string[] = [];
            if (vol > 0) bits.push(`Vol ${vol >= 1000 ? `${round1(vol / 1000)}k` : round1(vol)} kg`);
            if (best > 0) bits.push(`Best e1RM ${round1(best)}`);
            if (rpeN > 0) bits.push(`Avg RPE ${round1(rpeSum / rpeN)}`);
            if (bits.length === 0) return null;
            return (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {bits.map((b, i) => (
                  <span key={i} className={i === 0 ? "text-foreground/80" : undefined}>{b}</span>
                ))}
              </p>
            );
          })()}

          {ex.lastPerformed && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <History className="h-3 w-3" /> last {relativeFromNow(ex.lastPerformed)}
            </p>
          )}

          {preview.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {preview.map((s, i) => (
                <SetPill key={s.id} set={s} index={previewOffset + i + 1} markSetsComplete={markSetsComplete} />
              ))}
            </div>
          )}

          {markSetsComplete && sets.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="numeric">
                  {doneCount}/{sets.length} complete
                </span>
                {doneCount === sets.length && (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" /> done
                  </span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400 transition-[width] duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={selectMode ? `Toggle selection for ${ex.name}` : `Select ${ex.name}`}
            aria-pressed={isSelected}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
              selectMode
                ? isSelected
                  ? "text-primary"
                  : "text-muted-foreground hover:bg-accent"
                : "text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/card:opacity-100",
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
          >
            {isSelected ? <CheckCircle2 className="h-5.5 w-5.5" /> : <Circle className="h-5.5 w-5.5" />}
          </button>

          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${ex.name}`}
            className="flex h-11 w-8 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-5 w-5" />
          </button>
        </div>
      </div>
    </article>
  );
}

function SetPill({ set, index, markSetsComplete }: { set: SetDTO; index: number; markSetsComplete: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium",
        set.isComplete && markSetsComplete && !set.isWarmup
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "bg-muted/50 text-muted-foreground",
        set.isWarmup && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    >
      {set.isWarmup ? (
        <WarmupBadge className="h-4 w-4 rounded text-[9px]" />
      ) : (
        <span className="numeric text-muted-foreground/70">{index}.</span>
      )}
      <span className="numeric">{setSummary(set) || "—"}</span>
      {set.isComplete && markSetsComplete && !set.isWarmup && <Check className="h-3 w-3 text-primary" />}
      {set.newPr && <Trophy className="h-3 w-3 text-amber-500" aria-label="personal record" />}
    </span>
  );
}
