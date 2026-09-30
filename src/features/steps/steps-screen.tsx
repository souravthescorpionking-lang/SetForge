"use client";

// ─────────────────────────────────────────────────────────────────────────────
// StepsScreen — #/steps (Part 10 §8.3).
//
//   TopBar (56)   [◀] "Steps"
//   ScrollBody    Row 96: big "{today} / {goal}" + 4px progress bar
//                 Row 40: mode toggle "Add | Set total"
//                 Row 56: "Add steps" numeric + Apply (ADD accumulates today,
//                         SET replaces)
//                 Row 56: "Daily goal" ..... numeric (PATCH /api/user/step-goal)
//                 "This week": 7 rows 40 "{Mon d} · {steps}" + mini bar
//                 Prose 32 muted: "Automatic sync isn't available in the browser."
//                 Empty: "No steps logged yet."
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Plus } from "lucide-react";
import { tourAttrs } from "@/lib/tour/attrs";
import { qk, useInvalidate } from "@/lib/client/query";
import { stepsApi, userAccountApi } from "@/lib/client/api";
import { addDaysKey, formatDayShort, parseDayKey } from "@/lib/client/format";
import { hapticSuccess } from "@/lib/client/haptics";
import { errorMessage } from "@/features/routines/screen-helpers";
import { dateToLocalKey } from "@/features/today/day-utils";
import { cn } from "@/lib/utils";

type StepMode = "ADD" | "SET";

function localToday(): string {
  return dateToLocalKey(new Date());
}

/** Monday-based week start of a local day key. */
function weekStartOf(key: string): string {
  const d = new Date(`${key}T00:00`);
  const dow = d.getDay();
  const back = dow === 0 ? 6 : dow - 1;
  return addDaysKey(key, -back);
}

export default function StepsScreen() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const today = localToday();
  const weekStart = weekStartOf(today);

  const todayQuery = useQuery({
    queryKey: qk.steps(today, today),
    queryFn: () => stepsApi.list({ from: today, to: today }),
    staleTime: 15_000,
  });
  const weekQuery = useQuery({
    queryKey: qk.steps(weekStart, today),
    queryFn: () => stepsApi.list({ from: weekStart, to: today }),
    staleTime: 30_000,
  });

  const todaySteps = todayQuery.data?.entries.find((e) => e.date === today)?.steps ?? 0;
  const goal = todayQuery.data?.goal ?? weekQuery.data?.goal ?? 10_000;
  const pct = Math.min(100, Math.round((todaySteps / Math.max(1, goal)) * 100));

  // ---- Add steps (mode toggle + numeric + Apply) ----
  const [mode, setMode] = useState<StepMode>("ADD");
  const [stepsInput, setStepsInput] = useState("");
  const [applying, setApplying] = useState(false);

  const weekEntries = useMemo(() => weekQuery.data?.entries ?? [], [weekQuery.data]);
  const weekMax = useMemo(
    () => Math.max(goal, ...weekEntries.map((e) => e.steps), 1),
    [weekEntries, goal],
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i)),
    [weekStart],
  );
  const stepsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of weekEntries) map.set(e.date, e.steps);
    return map;
  }, [weekEntries]);

  const applySteps = async () => {
    const n = Number(stepsInput);
    if (stepsInput.trim() === "" || !Number.isFinite(n) || n < 0) {
      toast.error("Enter a step count");
      return;
    }
    if (applying) return;
    setApplying(true);
    try {
      const res = await stepsApi.log({ date: today, steps: Math.round(n), mode });
      invalidate.steps();
      hapticSuccess();
      toast.success(
        mode === "ADD" ? `Added ${Math.round(n).toLocaleString()} steps` : `Steps set to ${res.steps.toLocaleString()}`,
      );
      setStepsInput("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setApplying(false);
    }
  };

  // ---- Daily goal (PATCH /api/user/step-goal) ----
  const [goalInput, setGoalInput] = useState("");
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalEditing, setGoalEditing] = useState(false);

  const saveGoal = async () => {
    const n = Number(goalInput);
    if (goalInput.trim() === "" || !Number.isFinite(n) || n < 1_000 || n > 100_000) {
      toast.error("Goal must be 1,000 – 100,000");
      setGoalEditing(false);
      return;
    }
    if (goalSaving) return;
    setGoalSaving(true);
    try {
      await userAccountApi.setStepGoal(Math.round(n));
      invalidate.steps();
      void qc.invalidateQueries({ queryKey: qk.userAccount });
      hapticSuccess();
      toast.success(`Daily goal set to ${Math.round(n).toLocaleString()}`);
      setGoalEditing(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setGoalSaving(false);
    }
  };

  const loading = todayQuery.isLoading || weekQuery.isLoading;
  const hasAnySteps = weekEntries.length > 0 || todaySteps > 0;

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/more" label="Back" />}
          title="Steps"
        />
      }
    >
      <ScrollBody>
        {/* Row 96 — big "{today} / {goal}" + 4px progress bar */}
        <div className="flex h-24 w-full flex-none flex-col justify-center gap-2 overflow-hidden rounded-lg border bg-card px-4">
          {loading ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-1 w-full" />
            </div>
          ) : (
            <>
              <p
                className="min-w-0 truncate text-2xl font-bold leading-none tabular-nums"
                aria-label={`Steps today: ${todaySteps.toLocaleString()} of ${goal.toLocaleString()}, ${pct}% of goal`}
                {...tourAttrs({
                  id: "steps.today",
                  label: "Today's steps",
                  help: "Your step count today against the daily goal.",
                  order: 10,
                })}
              >
                {todaySteps.toLocaleString()}{" "}
                <span className="text-base font-semibold text-muted-foreground">/ {goal.toLocaleString()}</span>
              </p>
              <div className="flex h-1 w-full items-center overflow-hidden rounded-full bg-muted/50" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Daily step goal progress">
                <span
                  className={cn("h-full rounded-full transition-[width] duration-300", pct >= 100 ? "bg-primary" : "bg-primary/80")}
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
              </div>
            </>
          )}
        </div>

        {/* Mode toggle — "Add | Set total" */}
        <div className="flex h-10 w-full flex-none items-center gap-2" role="group" aria-label="Entry mode">
          {(["ADD", "SET"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              {...tourAttrs({
                id: m === "ADD" ? "steps.modeAdd" : "steps.modeSet",
                label: m === "ADD" ? "Add mode" : "Set total mode",
                help:
                  m === "ADD"
                    ? "Add the entered steps to today's total."
                    : "Replace today's total with the entered steps.",
                order: 20,
              })}
              onClick={() => setMode(m)}
              className={cn(
                "flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg border text-sm font-bold leading-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                mode === m
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent/40",
              )}
            >
              <span className="truncate">{m === "ADD" ? "Add" : "Set total"}</span>
            </button>
          ))}
        </div>

        {/* Row 56 — "Add steps" numeric + Apply */}
        <div className="flex h-14 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3">
          <span className="w-[88px] flex-none truncate text-sm font-medium">Add steps</span>
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            className="h-11 min-w-0 flex-1 rounded-lg text-base font-semibold tabular-nums"
            value={stepsInput}
            onChange={(e) => setStepsInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void applySteps();
            }}
            placeholder="e.g. 4000"
            aria-label={`Steps to ${mode === "ADD" ? "add to today" : "set as today's total"}`}
            {...tourAttrs({ id: "steps.input", label: "Steps input", help: "The steps to add or set for today.", order: 30 })}
          />
          <Button
            type="button"
            className="h-11 w-11 flex-none px-0"
            disabled={applying || stepsInput.trim() === ""}
            tour={{ id: "steps.apply", label: "Apply steps", help: "Apply the entered steps with the selected mode.", order: 40 }}
            onClick={() => void applySteps()}
            aria-label="Apply steps"
          >
            <Plus className="h-5 w-5" aria-hidden />
          </Button>
        </div>

        {/* Row 56 — "Daily goal" ..... numeric */}
        <div className="flex h-14 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3">
          <span className="w-[88px] flex-none truncate text-sm font-medium">Daily goal</span>
          {goalEditing ? (
            <>
              <Input
                type="number"
                inputMode="numeric"
                min="1000"
                max="100000"
                step="1"
                autoFocus
                className="h-11 min-w-0 flex-1 rounded-lg text-base font-semibold tabular-nums"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveGoal();
                  if (e.key === "Escape") setGoalEditing(false);
                }}
                aria-label="Daily step goal"
                {...tourAttrs({ id: "steps.goalInput", label: "Goal input", help: "Your daily step goal (1,000 – 100,000).", order: 50 })}
              />
              <Button
                type="button"
                className="h-11 w-11 flex-none px-0"
                disabled={goalSaving}
                tour={{ id: "steps.goalSave", label: "Save goal", help: "Save the daily step goal.", order: 60 }}
                onClick={() => void saveGoal()}
                aria-label="Save goal"
              >
                <Check className="h-5 w-5" aria-hidden />
              </Button>
            </>
          ) : (
            <button
              type="button"
              {...tourAttrs({
                id: "steps.goal",
                label: "Daily goal",
                help: "Your daily step goal — tap to change it.",
                order: 50,
              })}
              onClick={() => {
                setGoalInput(String(goal));
                setGoalEditing(true);
              }}
              aria-label={`Daily goal ${goal.toLocaleString()} steps — tap to edit`}
              className="flex h-11 min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden whitespace-nowrap rounded-lg px-2 text-right text-sm font-bold tabular-nums text-muted-foreground transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1 truncate">{goal.toLocaleString()}</span>
              <span className="flex-none text-xs font-medium text-muted-foreground/60">edit</span>
            </button>
          )}
        </div>

        {/* This week — 7 rows 40 + mini bar */}
        <p className="flex h-8 flex-none items-center overflow-hidden whitespace-nowrap px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span className="truncate">This week</span>
        </p>
        {loading ? (
          <div className="flex flex-col gap-1" aria-busy="true" aria-label="Loading this week's steps">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : !hasAnySteps ? (
          <div
            data-row
            className="flex h-10 w-full items-center overflow-hidden whitespace-nowrap rounded-lg border border-dashed px-3 text-sm text-muted-foreground"
          >
            No steps logged yet.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {weekDays.map((day) => {
              const steps = stepsByDate.get(day) ?? 0;
              const d = parseDayKey(day);
              const weekday = d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
              const barPct = Math.round((steps / weekMax) * 100);
              const isToday = day === today;
              return (
                <div
                  key={day}
                  data-row
                  aria-label={`${weekday} ${d.getUTCDate()}: ${steps.toLocaleString()} steps`}
                  className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
                >
                  <span className="w-[64px] flex-none truncate text-xs tabular-nums text-muted-foreground">
                    {weekday} {d.getUTCDate()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold tabular-nums">
                    {steps.toLocaleString()}
                  </span>
                  <span className="flex h-2 w-[96px] flex-none items-center overflow-hidden rounded-full bg-muted/50" aria-hidden>
                    <span
                      className={cn("h-full rounded-full", isToday ? "bg-primary" : "bg-primary/60")}
                      style={{ width: `${Math.max(barPct, steps > 0 ? 4 : 0)}%` }}
                    />
                  </span>
                  <span className="sr-only">{formatDayShort(day)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Prose 32 muted */}
        <p className="flex h-8 w-full flex-none items-center overflow-hidden px-1 text-xs text-muted-foreground">
          <span className="truncate">Automatic sync isn&apos;t available in the browser.</span>
        </p>
      </ScrollBody>
    </Screen>
  );
}
