"use client";

// Set calculator — percentage-based working sets from a base weight or your PRs.
// Pure client-side math; "Add to workout" is the only networked action.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stepper } from "@/components/shared/stepper";
import { ExercisePickerDialog } from "@/components/shared/exercise-picker";
import { exercisesApi, workoutsApi } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { useApp } from "@/lib/client/store";
import { formatDayLabel, round1, todayKey } from "@/lib/client/format";
import { roundToStep } from "@/lib/formulas";
import type { ExerciseDTO } from "@/lib/types";
import { toast } from "sonner";
import {
  CalendarPlus,
  Dumbbell,
  Layers,
  Loader2,
  Percent,
  Plus,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DateField } from "./date-field";

const PERCENT_CHIPS = [60, 70, 75, 80, 85, 90, 95];
const ROUND_OPTIONS = [0.25, 0.5, 1.25, 2.5, 5];
const PRESETS = [
  { label: "5×5 @ 80%", sets: 5, reps: 5, pct: 80 },
  { label: "3×8 @ 70%", sets: 3, reps: 8, pct: 70 },
  { label: "5×3 @ 85%", sets: 5, reps: 3, pct: 85 },
] as const;

type RowCfg = { sets: number; reps: number };
const DEFAULT_CFG: RowCfg = { sets: 3, reps: 8 };

export function SetCalculator() {
  const settings = useApp((s) => s.settings);
  const navigate = useApp((s) => s.navigate);
  const invalidate = useInvalidate();
  const online = useOnline();
  const unit = settings?.unitSystem === "imperial" ? "lb" : "kg";
  const increment = settings?.defaultWeightIncrement ?? 2.5;

  const [exercise, setExercise] = useState<ExerciseDTO | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [baseWeight, setBaseWeight] = useState<number>(() =>
    settings?.unitSystem === "imperial" ? 135 : 60,
  );
  const [percents, setPercents] = useState<number[]>([80]);
  const [customPct, setCustomPct] = useState(75);
  const [roundTo, setRoundTo] = useState<number>(2.5);
  const [rowCfg, setRowCfg] = useState<Record<number, RowCfg>>({});
  const [dateKey, setDateKey] = useState<string>(todayKey);
  const [adding, setAdding] = useState(false);

  const { data: records } = useQuery({
    queryKey: qk.exerciseRecords(exercise?.id ?? ""),
    queryFn: () => exercisesApi.records(exercise!.id),
    enabled: !!exercise,
  });

  // PR chips: top actual (non-superseded) records + estimated 1RM
  const prChips = useMemo(() => {
    if (!records) return [];
    const chips: Array<{ label: string; value: number; title: string }> = [];
    const top = records.actual
      .filter((r) => !r.superseded && r.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);
    for (const r of top) {
      chips.push({
        label: `${round1(r.weight)}${unit} × ${r.reps}`,
        value: r.weight,
        title: `Actual PR — ${round1(r.weight)} ${unit} for ${r.reps} reps`,
      });
    }
    if (records.estimatedOneRm > 0) {
      chips.push({
        label: `e1RM ${round1(records.estimatedOneRm)}${unit}`,
        value: Math.round(records.estimatedOneRm * 2) / 2,
        title: `Estimated 1RM — ${round1(records.estimatedOneRm)} ${unit} (rounded to 0.5)`,
      });
    }
    return chips;
  }, [records, unit]);

  const togglePercent = (pct: number) => {
    setPercents((prev) => {
      if (prev.includes(pct)) return prev.filter((p) => p !== pct);
      return [...prev, pct];
    });
  };

  const addCustomPercent = () => {
    setPercents((prev) => (prev.includes(customPct) ? prev : [...prev, customPct]));
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setPercents([preset.pct]);
    setRowCfg((prev) => ({
      ...prev,
      [preset.pct]: { sets: preset.sets, reps: preset.reps },
    }));
  };

  const cfgOf = (pct: number): RowCfg => rowCfg[pct] ?? DEFAULT_CFG;

  const resultRows = useMemo(
    () =>
      [...percents]
        .sort((a, b) => b - a)
        .map((pct) => {
          const cfg = rowCfg[pct] ?? DEFAULT_CFG;
          return {
            pct,
            sets: cfg.sets,
            reps: cfg.reps,
            weight: roundToStep((baseWeight * pct) / 100, roundTo),
          };
        }),
    [percents, baseWeight, roundTo, rowCfg],
  );

  const totalSets = resultRows.reduce((sum, r) => sum + r.sets, 0);
  const totalVolume = resultRows.reduce((sum, r) => sum + r.weight * r.reps * r.sets, 0);

  const addToWorkout = async () => {
    if (!exercise || resultRows.length === 0) return;
    setAdding(true);
    try {
      const workout = await workoutsApi.createOrGet(dateKey);
      const { workoutExerciseId } = await workoutsApi.addExercise(workout.id, exercise.id);
      let added = 0;
      for (const row of resultRows) {
        for (let i = 0; i < row.sets; i++) {
          await workoutsApi.addSet(workout.id, workoutExerciseId, {
            weight: row.weight,
            reps: row.reps,
          });
          added++;
        }
      }
      invalidate.workout(dateKey);
      toast.success(`Added ${added} sets to ${formatDayLabel(dateKey)}`);
      navigate(`/today?date=${dateKey}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add sets to workout");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* Base card */}
      <Card className="rounded-2xl border-border/60 lg:col-span-2 self-start">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Percent className="h-4.5 w-4.5" />
            </span>
            <div>
              <h3 className="text-base font-semibold leading-tight">Set Calculator</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Percentage working sets from a base weight
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Exercise */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Exercise (optional)</Label>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 h-11"
              onClick={() => setPickerOpen(true)}
            >
              {exercise ? (
                <>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: exercise.category?.colour ?? "#f97316" }}
                  />
                  <span className="truncate font-medium">{exercise.name}</span>
                </>
              ) : (
                <>
                  <Dumbbell className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Pick exercise to load your PRs…</span>
                </>
              )}
            </Button>
            {!exercise && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Without an exercise this works as a plain calculator — you can still compute loads,
                but not send them to a workout.
              </p>
            )}
            <ExercisePickerDialog
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              onPick={setExercise}
              title="Base exercise"
              description="Its records become quick-pick bases."
            />
          </div>

          {/* PR chips */}
          {exercise && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Trophy className="h-3.5 w-3.5 text-primary" /> Select max from PRs
              </p>
              {prChips.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {prChips.map((chip) => {
                    const active = Math.abs(baseWeight - chip.value) < 0.001;
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        title={chip.title}
                        onClick={() => setBaseWeight(chip.value)}
                        className={cn(
                          "numeric rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                          active
                            ? "border-primary/60 bg-primary/15 text-primary"
                            : "border-border/70 bg-muted/40 text-foreground/80 hover:border-primary/40 hover:text-primary",
                        )}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No records for this exercise yet.</p>
              )}
            </div>
          )}

          {/* Base weight */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Base weight ({unit})</Label>
            <Stepper
              ariaLabel="Base weight"
              value={baseWeight}
              onChange={(v) => setBaseWeight(v ?? 0)}
              min={0}
              max={1000}
              step={increment}
              decimals={2}
              suffix={unit}
            />
          </div>

          {/* Percent chips */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Percentages of base (multi-select)</p>
            <div className="flex flex-wrap gap-1.5">
              {PERCENT_CHIPS.map((pct) => {
                const active = percents.includes(pct);
                return (
                  <button
                    key={pct}
                    type="button"
                    aria-pressed={active}
                    onClick={() => togglePercent(pct)}
                    className={cn(
                      "numeric min-w-[52px] rounded-lg border px-2.5 py-2 text-sm font-bold transition-all",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                        : "border-border/70 bg-muted/40 text-foreground/80 hover:border-primary/40 hover:text-primary",
                    )}
                  >
                    {pct}%
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <Stepper
                ariaLabel="Custom percent"
                value={customPct}
                onChange={(v) => setCustomPct(v ?? 5)}
                min={5}
                max={100}
                step={5}
                decimals={0}
                suffix="%"
                size="sm"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
                onClick={addCustomPercent}
                disabled={percents.includes(customPct)}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </div>

          {/* Round to + presets */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Round loads to</Label>
              <Select
                value={String(roundTo)}
                onValueChange={(v) => setRoundTo(Number(v))}
              >
                <SelectTrigger className="w-full" aria-label="Round to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUND_OPTIONS.map((o) => (
                    <SelectItem key={o} value={String(o)} className="numeric">
                      {o} {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Presets</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      "rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition-all",
                      percents.includes(preset.pct) && cfgOf(preset.pct).sets === preset.sets
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/70 bg-muted/40 text-foreground/80 hover:border-primary/40 hover:text-primary",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results card */}
      <Card className="rounded-2xl border-border/60 lg:col-span-3 self-start">
        <CardHeader className="pb-2">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4 text-primary" /> Working sets
            </h3>
            {resultRows.length > 0 && (
              <p className="numeric text-xs text-muted-foreground">
                {totalSets} sets · {round1(totalVolume)} {unit} total volume
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {resultRows.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 py-10 text-center">
              <Sparkles className="h-5 w-5 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                Select one or more percentages to build your sets.
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {resultRows.map((row) => (
              <motion.div
                key={row.pct}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="rounded-xl border border-border/60 bg-muted/20 p-3.5"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-baseline gap-1 min-w-[86px]">
                    <span className="numeric text-2xl font-black text-primary">{row.pct}</span>
                    <span className="text-xs font-bold text-primary/60">%</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="numeric text-2xl font-black">{round1(row.weight)}</span>
                    <span className="text-xs font-semibold text-muted-foreground">{unit}</span>
                    <span className="ml-1 text-[11px] text-muted-foreground">
                      ({round1((baseWeight * row.pct) / 100)} raw)
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">sets</span>
                      <Stepper
                        ariaLabel={`Sets at ${row.pct}%`}
                        value={cfgOf(row.pct).sets}
                        onChange={(v) =>
                          setRowCfg((prev) => ({
                            ...prev,
                            [row.pct]: { ...cfgOf(row.pct), sets: v ?? 1 },
                          }))
                        }
                        min={1}
                        max={10}
                        step={1}
                        decimals={0}
                        size="sm"
                        className="w-[86px]"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">reps</span>
                      <Stepper
                        ariaLabel={`Reps at ${row.pct}%`}
                        value={cfgOf(row.pct).reps}
                        onChange={(v) =>
                          setRowCfg((prev) => ({
                            ...prev,
                            [row.pct]: { ...cfgOf(row.pct), reps: v ?? 1 },
                          }))
                        }
                        min={1}
                        max={50}
                        step={1}
                        decimals={0}
                        size="sm"
                        className="w-[86px]"
                      />
                    </div>
                  </div>
                </div>
                <p className="numeric mt-2 text-[11px] text-muted-foreground">
                  {row.sets} × {row.reps} @ {round1(row.weight)} {unit} ·{" "}
                  {round1(row.weight * row.reps * row.sets)} {unit} volume
                </p>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Add to workout */}
          {exercise && resultRows.length > 0 && (
            <div className="mt-1 rounded-xl border border-primary/25 bg-primary/5 p-3.5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <CalendarPlus className="h-4 w-4 text-primary shrink-0" />
                <p className="text-sm font-medium">Add to workout</p>
                <div className="ml-auto">
                  <DateField
                    value={dateKey}
                    onChange={setDateKey}
                    ariaLabel="Target workout date"
                  />
                </div>
              </div>
              <Button
                className="w-full gap-2 font-bold"
                disabled={adding || !online}
                onClick={() => void addToWorkout()}
              >
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Add {totalSets} sets to {formatDayLabel(dateKey)}
              </Button>
              {!online && (
                <p className="text-xs text-muted-foreground">
                  You&apos;re offline — the calculator works, but adding sets needs a connection.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
