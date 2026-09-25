"use client";

// Goals tab: goal cards with progress, achieved state, create / edit / delete.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/shared/stepper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { qk, useInvalidate } from "@/lib/client/query";
import { goalsApi, type GoalInput } from "@/lib/client/api";
import { GOAL_TYPES } from "@/lib/constants";
import { formatDuration } from "@/lib/formulas";
import type { ExerciseDTO, GoalDTO } from "@/lib/types";
import { toast } from "sonner";
import { Pencil, Plus, Save, Target, Trash2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type WeightUnit,
  goalTargetField,
  goalTypeLabel,
  goalValueLabel,
} from "@/features/exercises/labels";
import { useOfflineRun } from "@/features/exercises/offline-run";

export function GoalsTab({ exercise, unit }: { exercise: ExerciseDTO; unit: WeightUnit }) {
  const invalidate = useInvalidate();
  const run = useOfflineRun();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GoalDTO | null>(null);
  const [formSession, setFormSession] = useState(0);

  const openForm = (goal: GoalDTO | null) => {
    setEditing(goal);
    setFormSession((s) => s + 1); // remounts the dialog with fresh state
    setFormOpen(true);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["goals", exercise.id],
    queryFn: () => goalsApi.list(exercise.id),
  });
  const goals = data?.goals ?? [];

  const handleDelete = async (goal: GoalDTO) => {
    await run({
      label: "Goal delete",
      path: `/api/goals/${goal.id}`,
      method: "DELETE",
      run: () => goalsApi.remove(goal.id),
      successMsg: "Goal deleted",
      onDone: () => invalidate.goals(),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "…" : `${goals.length} goal${goals.length === 1 ? "" : "s"}`}
          {goals.length > 0 && ` · ${goals.filter((g) => g.achieved).length} achieved`}
        </p>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => openForm(null)}
        >
          <Plus className="h-4 w-4" /> Add goal
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <EmptyState
          icon={<Target className="h-6 w-6" />}
          title="No goals for this exercise"
          description="Set a 1RM, max weight, reps, distance, time or volume target and track your progress."
          action={
            <Button className="gap-1.5" onClick={() => openForm(null)}>
              <Plus className="h-4 w-4" /> Add goal
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {goals.map((g) => (
              <motion.div
                key={g.id}
                layout="position"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.16 }}
              >
                <Card
                  className={cn(
                    "gap-0 rounded-2xl p-4 transition-colors",
                    g.achieved && "border-primary/40 bg-primary/5",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                          g.achieved ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {g.achieved ? <Trophy className="h-4 w-4" /> : <Target className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold leading-tight">{goalTypeLabel(g.type)}</p>
                        {g.achieved && (
                          <p className="text-[11px] font-medium text-primary">Achieved 🎉</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground"
                        aria-label={`Edit ${goalTypeLabel(g.type)} goal`}
                        onClick={() => openForm(g)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${goalTypeLabel(g.type)} goal`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title="Delete this goal?"
                        description={`Your ${goalTypeLabel(g.type).toLowerCase()} goal and its progress tracking will be removed.`}
                        confirmLabel="Delete goal"
                        onConfirm={() => void handleDelete(g)}
                      />
                    </div>
                  </div>

                  <Progress
                    value={g.pct}
                    className="mt-3 h-2"
                    aria-label={`${g.pct}% of goal`}
                  />
                  <div className="mt-2 flex items-baseline justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground">
                      now{" "}
                      <span className="font-semibold numeric">{goalValueLabel(g.type, g.current, unit)}</span>
                    </span>
                    <span className="shrink-0 font-bold numeric">
                      {goalValueLabel(g.type, g.target, unit)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 text-[11px] font-medium numeric",
                      g.achieved ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {g.achieved ? `Smashed it — ${g.pct}% of target` : `${g.pct}% of the way there`}
                  </p>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <GoalFormDialog
        key={`goal-${editing?.id ?? "new"}-${formSession}`}
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        exercise={exercise}
        unit={unit}
        goal={editing}
      />
    </div>
  );
}

// ---------------- goal form ----------------
// NOTE: state is initialised from `goal` on mount — the parent remounts via key.
function GoalFormDialog({
  open,
  onOpenChange,
  exercise,
  unit,
  goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: ExerciseDTO;
  unit: WeightUnit;
  goal: GoalDTO | null;
}) {
  const invalidate = useInvalidate();
  const run = useOfflineRun();
  const editing = !!goal;

  const [type, setType] = useState<string>(goal?.type ?? "ONE_RM");
  const [targetWeight, setTargetWeight] = useState<number | null>(goal?.targetWeight ?? null);
  const [targetReps, setTargetReps] = useState<number | null>(goal?.targetReps ?? null);
  const [targetDistance, setTargetDistance] = useState<number | null>(goal?.targetDistance ?? null);
  const [targetTimeSec, setTargetTimeSec] = useState<number | null>(goal?.targetTimeSec ?? null);
  const [saving, setSaving] = useState(false);

  const field = goalTargetField(type);
  const activeValue =
    field === "targetWeight"
      ? targetWeight
      : field === "targetReps"
        ? targetReps
        : field === "targetDistance"
          ? targetDistance
          : targetTimeSec;

  const handleSave = async () => {
    if (activeValue == null || activeValue <= 0) {
      toast.error("Please set a target value above zero");
      return;
    }
    setSaving(true);
    const payload: GoalInput = {
      type,
      targetWeight: field === "targetWeight" ? targetWeight : null,
      targetReps: field === "targetReps" ? targetReps : null,
      targetDistance: field === "targetDistance" ? targetDistance : null,
      targetTimeSec: field === "targetTimeSec" ? targetTimeSec : null,
    };
    const ok = await run({
      label: editing ? "Goal update" : "Goal",
      path: editing ? `/api/goals/${goal!.id}` : "/api/goals",
      method: editing ? "PATCH" : "POST",
      body: editing ? payload : { ...payload, exerciseId: exercise.id },
      run: () => (editing ? goalsApi.update(goal!.id, payload) : goalsApi.create({ ...payload, exerciseId: exercise.id })),
      successMsg: editing ? "Goal updated" : "Goal created",
      onDone: () => {
        invalidate.goals();
        onOpenChange(false);
      },
    });
    if (!ok) setSaving(false);
  };

  const currentHint =
    goal && goal.current != null
      ? `Current best: ${goalValueLabel(goal.type, goal.current, unit)}`
      : "No data logged yet.";

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            {editing ? "Edit goal" : `New goal · ${exercise.name}`}
          </DialogTitle>
          <DialogDescription>{currentHint}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Goal type</p>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full" aria-label="Goal type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOAL_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {goalTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Target</p>
            {field === "targetWeight" && (
              <Stepper
                value={targetWeight}
                onChange={setTargetWeight}
                step={unit === "lbs" ? 5 : 2.5}
                min={0}
                max={100000}
                decimals={2}
                suffix={unit}
                ariaLabel="target weight"
              />
            )}
            {field === "targetReps" && (
              <Stepper
                value={targetReps}
                onChange={setTargetReps}
                step={1}
                min={0}
                max={1000}
                decimals={0}
                suffix="reps"
                ariaLabel="target reps"
              />
            )}
            {field === "targetDistance" && (
              <Stepper
                value={targetDistance}
                onChange={setTargetDistance}
                step={0.5}
                min={0}
                max={100000}
                decimals={2}
                suffix="km"
                ariaLabel="target distance"
              />
            )}
            {field === "targetTimeSec" && (
              <div className="space-y-1">
                <Stepper
                  value={targetTimeSec}
                  onChange={setTargetTimeSec}
                  step={15}
                  min={0}
                  max={86400}
                  decimals={0}
                  suffix="s"
                  ariaLabel="target time"
                />
                {targetTimeSec != null && targetTimeSec > 0 && (
                  <p className="text-xs text-muted-foreground numeric">= {formatDuration(targetTimeSec)}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving} className="gap-1.5 min-w-24">
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
