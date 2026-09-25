"use client";

// LastTimeBar — "beat last time" context above the set-input card: the last
// performance of this exercise (date + tap-to-prefill set pills) and a live
// delta of the current inputs vs the top set of that session (weight delta,
// rep delta at same weight, e1RM delta, distance delta, today's best).
import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { History, Minus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import type { SetDTO } from "@/lib/types";
import type { SetField } from "@/lib/constants";
import { dayKeyOf, formatDayShort, round1, round2 } from "@/lib/client/format";
import { estOneRm, formatDuration } from "@/lib/formulas";
import { cn } from "@/lib/utils";

const MAX_PILLS = 6;

type Props = {
  date: string | null;
  sets: SetDTO[];
  fields: SetField[];
  weight: number | null;
  reps: number | null;
  distance: number | null;
  todaySets: SetDTO[];
  onApplySet?: (s: SetDTO) => void;
};

/** Top performed set by exercise shape: heaviest weight → most reps;
 *  distance-based: longest distance; time-based: longest duration. */
function topSet(sets: SetDTO[], fields: SetField[]): SetDTO | null {
  const done = sets.filter((s) => !s.isWarmup);
  if (done.length === 0) return null;
  const better = (a: SetDTO, b: SetDTO): number => {
    if (fields.includes("weight")) {
      if ((a.weight ?? -1) !== (b.weight ?? -1)) return (a.weight ?? -1) - (b.weight ?? -1);
      return (a.reps ?? -1) - (b.reps ?? -1);
    }
    if (fields.includes("distance")) return (a.distance ?? -1) - (b.distance ?? -1);
    return (a.timeSec ?? -1) - (b.timeSec ?? -1);
  };
  return done.reduce((best, s) => (better(s, best) > 0 ? s : best));
}

function pillLabel(s: SetDTO, fields: SetField[]): string {
  if (fields.includes("weight") && s.weight != null) {
    return s.reps != null ? `${round1(s.weight)}×${s.reps}` : `${round1(s.weight)}kg`;
  }
  if (fields.includes("distance") && s.distance != null) return `${round2(s.distance)}km`;
  if (s.timeSec != null) return formatDuration(s.timeSec);
  return "—";
}

function DeltaChip({
  tone,
  children,
}: {
  tone: "up" | "same" | "down";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold numeric",
        tone === "up" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        tone === "same" && "bg-muted text-muted-foreground",
        tone === "down" && "bg-muted/60 text-foreground/70",
      )}
    >
      {tone === "up" && <TrendingUp className="h-3 w-3" />}
      {tone === "down" && <TrendingDown className="h-3 w-3" />}
      {tone === "same" && <Minus className="h-3 w-3" />}
      {children}
    </span>
  );
}

export function LastTimeBar({
  date,
  sets,
  fields,
  weight,
  reps,
  distance,
  todaySets,
  onApplySet,
}: Props) {
  const last = useMemo(() => ({ date, sets: sets.filter((s) => !s.isWarmup) }), [date, sets]);
  const lastTop = useMemo(() => topSet(sets, fields), [sets, fields]);
  const todayBest = useMemo(() => topSet(todaySets, fields), [todaySets, fields]);

  // live deltas: current inputs vs the top set of the last session
  const deltas = useMemo(() => {
    const out: Array<{ key: string; tone: "up" | "same" | "down"; text: string }> = [];
    if (!lastTop) return out;

    if (fields.includes("weight") && weight != null && weight > 0 && lastTop.weight != null) {
      const diff = Math.round((weight - lastTop.weight) * 10) / 10;
      if (diff > 0) {
        out.push({ key: "w", tone: "up", text: `+${round1(diff)} kg vs last time` });
      } else if (diff < 0) {
        out.push({ key: "w", tone: "down", text: `−${round1(Math.abs(diff))} kg vs last time` });
      } else if (reps != null && lastTop.reps != null) {
        // same weight — reps are the battle
        if (reps > lastTop.reps) {
          out.push({ key: "w", tone: "up", text: `+${reps - lastTop.reps} reps at ${round1(weight)} kg` });
        } else {
          out.push({ key: "w", tone: "same", text: `${lastTop.reps} reps last time at this weight` });
        }
      } else {
        out.push({ key: "w", tone: "same", text: "matching last top weight" });
      }
    }

    if (
      fields.includes("weight") &&
      weight != null &&
      weight > 0 &&
      reps != null &&
      reps > 0 &&
      lastTop.weight != null &&
      lastTop.reps != null
    ) {
      const e1 = estOneRm(weight, reps);
      const lastE1 = estOneRm(lastTop.weight, lastTop.reps);
      if (e1 > 0 && lastE1 > 0) {
        const d = Math.round((e1 - lastE1) * 10) / 10;
        out.push({
          key: "e1",
          tone: d >= 0 ? "up" : "down",
          text: `${d >= 0 ? "+" : "−"}${round1(Math.abs(d))} e1RM vs last`,
        });
      }
    }

    if (fields.includes("distance") && distance != null && distance > 0 && lastTop.distance != null) {
      const diff = Math.round((distance - lastTop.distance) * 100) / 100;
      if (diff > 0) out.push({ key: "d", tone: "up", text: `+${round2(diff)} km vs last time` });
      else if (diff < 0) out.push({ key: "d", tone: "down", text: `−${round2(Math.abs(diff))} km vs last time` });
      else out.push({ key: "d", tone: "same", text: "matching last distance" });
    }

    return out;
  }, [fields, weight, reps, distance, lastTop]);

  // no history at all — a friendly explainer instead of silence
  if (!date || last.sets.length === 0) {
    if (date === null) {
      return (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          First time logging this exercise — today sets the baseline.
        </p>
      );
    }
    return null;
  }

  const shown = last.sets.slice(0, MAX_PILLS);
  const overflow = last.sets.length - shown.length;

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-3 shadow-sm">
      <div className="flex items-center gap-1.5">
        <History className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Last time</span>
        <span className="text-xs font-bold">{formatDayShort(dayKeyOf(date))}</span>
        <span className="text-[11px] text-muted-foreground">
          · <span className="numeric">{last.sets.length}</span> set{last.sets.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {shown.map((s) => {
          const label = pillLabel(s, fields);
          const clickable = !!onApplySet && s.id !== "";
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onApplySet?.(s)}
              disabled={!clickable}
              className={cn(
                "numeric rounded-lg border border-border bg-background px-2 py-1 text-xs font-bold shadow-sm transition-colors",
                clickable && "cursor-pointer hover:border-primary/50 hover:bg-primary/10 hover:text-primary",
              )}
              aria-label={clickable ? `Prefill ${label} from last time` : label}
              title={clickable ? `Prefill ${label}` : undefined}
            >
              {label}
            </button>
          );
        })}
        {overflow > 0 && (
          <span className="numeric rounded-lg px-1.5 py-1 text-[11px] font-semibold text-muted-foreground">
            +{overflow}
          </span>
        )}
        {lastTop && (
          <span className="ml-auto hidden items-center gap-1 text-[11px] font-semibold text-muted-foreground sm:flex">
            top {pillLabel(lastTop, fields)}
          </span>
        )}
      </div>

      <AnimatePresence>
        {(deltas.length > 0 || todayBest) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
              {deltas.map((d) => (
                <DeltaChip key={d.key} tone={d.tone}>
                  {d.text}
                </DeltaChip>
              ))}
              {todayBest && deltas.length > 0 && (
                <span className="text-[11px] font-semibold text-muted-foreground">
                  today <span className="numeric">{pillLabel(todayBest, fields)}</span>
                </span>
              )}
              {todayBest && deltas.length === 0 && (
                <span className="text-[11px] font-semibold text-muted-foreground">
                  today&apos;s best <span className="numeric">{pillLabel(todayBest, fields)}</span>
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
