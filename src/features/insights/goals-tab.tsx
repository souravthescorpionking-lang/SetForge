"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GoalsTab — GOALS tab of #/insights (Part 3 p3-7).
//
//   40px [data-row]s: goal (exercise + target, ellipsis) | progress % |
//   status (hit / open). Tapping a row expands a 96px INLINE block (not a
//   data-row) with the progress detail + edit controls ported from the legacy
//   goals-overview / goals-tab: progress bar, current vs target, inline target
//   editor (Save) and a two-tap inline Delete confirm (no dialogs).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import { Target, Trash2, Trophy } from "lucide-react";
import { goalsApi, ApiError, type GoalInput } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { queueMutation } from "@/lib/client/offline";
import { useApp } from "@/lib/client/store";
import {
  defaultUnitFor,
  goalTargetField,
  goalTypeLabel,
  goalValueLabel,
  type WeightUnit,
} from "@/features/exercises/labels";
import { cn } from "@/lib/utils";
import type { GoalDTO } from "@/lib/types";

type GoalRun = {
  path: string;
  method: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  label: string;
  run: () => Promise<unknown>;
  successMsg?: string;
};

/** Offline-aware goal mutation runner (port of the legacy goals-tab runner). */
function useGoalRun() {
  const online = useOnline();
  const inv = useInvalidate();
  return async (a: GoalRun): Promise<boolean> => {
    if (!online) {
      queueMutation(a.path, a.method, a.body, a.label);
      toast.info(`${a.label} — saved offline, will sync when reconnected`);
      inv.goals();
      return true;
    }
    try {
      await a.run();
      if (a.successMsg) toast.success(a.successMsg);
      inv.goals();
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : `Could not save: ${a.label}`);
      return false;
    }
  };
}

export function GoalsTab() {
  const settings = useApp((s) => s.settings);
  const unit: WeightUnit = defaultUnitFor(settings);

  const { data, isLoading } = useQuery({ queryKey: qk.goals, queryFn: () => goalsApi.list() });
  const goals = data?.goals ?? [];

  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {goals.length > 0 ? (
        <p className="flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span className="truncate">
            {goals.length} goal{goals.length === 1 ? "" : "s"} · {goals.filter((g) => g.achieved).length} achieved
          </span>
        </p>
      ) : null}

      {goals.length === 0 ? (
        <div
          data-row
          className="flex h-12 items-center overflow-hidden whitespace-nowrap text-sm text-muted-foreground"
        >
          No goals yet — open an exercise to set one.
        </div>
      ) : (
        goals.map((g) => (
          <div key={g.id} className="flex flex-col">
            <button
              type="button"
              data-row
              aria-expanded={expandedId === g.id}
              {...tourAttrs({ id: "insights.goalRow", label: "Goal row", help: "Tap a goal to see progress and edit its target.", order: 80 })}
              onClick={() => setExpandedId((cur) => (cur === g.id ? null : g.id))}
              className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/50 text-left transition-colors hover:bg-accent/50"
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <Target className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden />
                <span className="min-w-0 truncate text-sm font-medium">
                  {g.exercise?.name ?? "Exercise"}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {goalTypeLabel(g.type)} {goalValueLabel(g.type, g.target, unit)}
                  </span>
                </span>
              </span>
              <span
                className={cn(
                  "w-[44px] flex-none text-right text-sm font-bold tabular-nums",
                  g.achieved ? "text-primary" : "",
                )}
              >
                {Math.round(g.pct)}%
              </span>
              <span className="flex w-[52px] flex-none items-center justify-end gap-1 text-xs font-semibold">
                {g.achieved ? (
                  <>
                    <Trophy className="h-3.5 w-3.5 flex-none text-emerald-500" aria-hidden />
                    <span className="text-emerald-500">hit</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">open</span>
                )}
              </span>
            </button>

            {expandedId === g.id ? (
              <GoalExpansion key={g.id} goal={g} unit={unit} onDone={() => setExpandedId(null)} />
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

// ── 96px inline expansion (NOT a data-row) ──────────────────────────────────

function GoalExpansion({
  goal,
  unit,
  onDone,
}: {
  goal: GoalDTO;
  unit: WeightUnit;
  onDone: () => void;
}) {
  const run = useGoalRun();
  const field = goalTargetField(goal.type);
  const initial =
    field === "targetWeight"
      ? goal.targetWeight
      : field === "targetReps"
        ? goal.targetReps
        : field === "targetDistance"
          ? goal.targetDistance
          : goal.targetTimeSec;

  const [target, setTarget] = useState<string>(initial != null ? String(initial) : "");
  const [saving, setSaving] = useState(false);
  const [armed, setArmed] = useState(false);

  // auto-disarm the two-tap delete after a pause
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);

  const save = async () => {
    const n = Number(target);
    if (target.trim() === "" || !Number.isFinite(n) || n <= 0) {
      toast.error("Set a target value above zero");
      return;
    }
    setSaving(true);
    const payload: GoalInput = {
      type: goal.type,
      targetWeight: field === "targetWeight" ? n : null,
      targetReps: field === "targetReps" ? n : null,
      targetDistance: field === "targetDistance" ? n : null,
      targetTimeSec: field === "targetTimeSec" ? n : null,
    };
    const ok = await run({
      path: `/api/goals/${goal.id}`,
      method: "PATCH",
      body: payload,
      label: "Goal update",
      run: () => goalsApi.update(goal.id, payload),
      successMsg: "Goal updated",
    });
    setSaving(false);
    if (ok) onDone();
  };

  const remove = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    const ok = await run({
      path: `/api/goals/${goal.id}`,
      method: "DELETE",
      label: "Goal delete",
      run: () => goalsApi.remove(goal.id),
      successMsg: "Goal deleted",
    });
    if (ok) onDone();
  };

  const targetPlaceholder =
    field === "targetWeight" ? `Target ${unit}` : field === "targetReps" ? "Target reps" : field === "targetDistance" ? "Target km" : "Target sec";

  return (
    <div className="flex h-24 flex-none flex-col gap-1 rounded-lg border bg-card p-1.5">
      <div className="flex min-h-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap">
        <Progress
          value={Math.min(100, goal.pct)}
          className={cn("h-2 flex-1", goal.achieved && "*:data-[slot=progress-indicator]:bg-emerald-500")}
          aria-label={`${goal.pct}% of goal`}
        />
        <span className="flex-none truncate text-xs font-semibold tabular-nums text-muted-foreground">
          {goalValueLabel(goal.type, goal.current, unit)} / {goalValueLabel(goal.type, goal.target, unit)}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          className="h-full flex-1 rounded-lg tabular-nums"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={targetPlaceholder}
          aria-label={targetPlaceholder}
          {...tourAttrs({ id: "insights.goalTarget", label: "Target", help: "Set a new target value for the goal.", order: 90 })}
        />
        <Button type="button" className="h-full flex-1 rounded-lg font-semibold" disabled={saving} tour={{ id: "insights.goalSave", label: "Save target", help: "Update the goal's target value.", order: 100 }} onClick={() => void save()}>
          {saving ? "Saving…" : "Save target"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn("h-full flex-none gap-1 rounded-lg", armed ? "border-destructive/50 text-destructive" : "text-muted-foreground")}
          tour={{ id: "insights.goalDelete", label: "Delete goal", help: "Tap twice to delete the goal for good.", order: 110 }}
          onClick={() => void remove()}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {armed ? "Sure?" : "Delete"}
        </Button>
      </div>
    </div>
  );
}
