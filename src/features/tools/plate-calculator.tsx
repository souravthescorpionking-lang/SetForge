"use client";

// Plate calculator — greedy plate loading with a bar visualisation + inventory editor.
// Math is client-side; inventory editing hits the network (queued when offline).
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stepper } from "@/components/shared/stepper";
import { ExercisePickerDialog } from "@/components/shared/exercise-picker";
import { platesApi } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { useApp } from "@/lib/client/store";
import { plateGreedy, type PlateLike } from "@/lib/formulas";
import { round1 } from "@/lib/client/format";
import { queueMutation } from "@/lib/client/offline";
import type { ExerciseDTO, PlateDTO } from "@/lib/types";
import { toast } from "sonner";
import {
  CheckCircle2,
  Disc3,
  Dumbbell,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type UnitSystem = "metric" | "imperial";

type EditPlate = { weight: number; colour: string; count: number; isAvailable: boolean };

const DEFAULT_BAR: Record<UnitSystem, number> = { metric: 20, imperial: 45 };
const DEFAULT_TARGET: Record<UnitSystem, number> = { metric: 60, imperial: 135 };
const MAX_PLATES = 30;

function toEditPlates(plates: PlateDTO[]): EditPlate[] {
  return plates.map((p) => ({
    weight: p.weight,
    colour: p.colour,
    count: p.count,
    isAvailable: p.isAvailable,
  }));
}

/** Nearest loadable total at or around the target (searches outward). */
function nearestLoadable(
  target: number,
  bar: number,
  plates: PlateLike[],
  step: number,
): number | null {
  for (let k = 1; k <= 400; k++) {
    const down = target - k * step;
    if (down >= bar && plateGreedy(down, bar, plates)) return down;
    const up = target + k * step;
    if (plateGreedy(up, bar, plates)) return up;
  }
  return null;
}

/** Front-view loaded bar visualisation — plates on both sides of a bar. */
function BarVisual({
  perSide,
  unit,
}: {
  perSide: Array<{ weight: number; count: number; colour: string }>;
  unit: string;
}) {
  const flat: Array<{ weight: number; colour: string }> = [];
  for (const p of perSide) {
    for (let i = 0; i < p.count; i++) flat.push({ weight: p.weight, colour: p.colour });
  }
  const maxW = Math.max(1, ...flat.map((f) => f.weight));

  return (
    <div className="overflow-x-auto py-6" aria-label="Loaded bar visualisation">
      <div className="relative mx-auto flex min-w-[260px] max-w-[440px] items-center justify-center gap-[5px] px-6">
        {/* the bar itself */}
        <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-zinc-500 via-zinc-300 to-zinc-500 shadow-inner dark:from-zinc-700 dark:via-zinc-500 dark:to-zinc-700" />
        {/* left side (outermost first) */}
        <div className="relative z-10 flex items-center gap-[5px]">
          {[...flat].reverse().map((p, i) => (
            <PlateRect key={`l-${i}`} weight={p.weight} colour={p.colour} maxW={maxW} unit={unit} />
          ))}
        </div>
        {/* centre collar */}
        <div className="relative z-10 h-12 w-1.5 rounded-full bg-zinc-500 shadow dark:bg-zinc-600" />
        {/* right side */}
        <div className="relative z-10 flex items-center gap-[5px]">
          {flat.map((p, i) => (
            <PlateRect key={`r-${i}`} weight={p.weight} colour={p.colour} maxW={maxW} unit={unit} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PlateRect({
  weight,
  colour,
  maxW,
  unit,
}: {
  weight: number;
  colour: string;
  maxW: number;
  unit: string;
}) {
  const ratio = weight / maxW;
  const height = Math.round(24 + ratio * 96);
  const width = Math.round(11 + ratio * 15);
  return (
    <div
      role="img"
      aria-label={`${weight} ${unit} plate`}
      title={`${weight} ${unit}`}
      style={{ height, width, background: colour }}
      className="relative z-10 shrink-0 rounded-full border border-black/25 shadow-sm"
    >
      <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
    </div>
  );
}

export function PlateCalculator() {
  const settings = useApp((s) => s.settings);
  const invalidate = useInvalidate();
  const online = useOnline();

  const [tab, setTab] = useState<UnitSystem>(
    (settings?.unitSystem as UnitSystem) === "imperial" ? "imperial" : "metric",
  );
  const unit = tab === "imperial" ? "lb" : "kg";
  const increment = settings?.defaultWeightIncrement ?? 2.5;

  const [barWeight, setBarWeight] = useState(DEFAULT_BAR[tab]);
  const [target, setTarget] = useState(DEFAULT_TARGET[tab]);
  const [exercise, setExercise] = useState<ExerciseDTO | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [rows, setRows] = useState<EditPlate[] | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: platesData, isLoading: platesLoading } = useQuery({
    queryKey: qk.plates(tab),
    queryFn: () => platesApi.list(tab),
  });
  const serverPlates = useMemo(() => platesData?.plates ?? [], [platesData]);

  // sync local editor rows while they're clean
  const serverRows = useMemo(() => toEditPlates(serverPlates), [serverPlates]);
  const dirty =
    rows != null &&
    JSON.stringify([...rows].sort((a, b) => b.weight - a.weight)) !==
      JSON.stringify([...serverRows].sort((a, b) => b.weight - a.weight));

  useEffect(() => {
    if (platesData && !dirty) setRows(serverRows);
  }, [platesData, serverRows, dirty]);

  const availablePlates = useMemo(
    () => serverPlates.filter((p) => p.isAvailable && p.count > 0),
    [serverPlates],
  );
  const smallestPlate = useMemo(
    () => Math.min(...availablePlates.map((p) => p.weight).filter((w) => w > 0)),
    [availablePlates],
  );
  const targetStep = Number.isFinite(smallestPlate) && smallestPlate > 0 ? smallestPlate : increment;

  const perSide = useMemo(
    () => plateGreedy(target, barWeight, availablePlates),
    [target, barWeight, availablePlates],
  );

  // per-side plates with colours resolved from the inventory (for the bar visual)
  const perSideVisual = useMemo(() => {
    if (!perSide) return null;
    return perSide.map((p) => ({
      ...p,
      colour:
        serverPlates.find((sp) => Math.abs(sp.weight - p.weight) < 1e-9)?.colour ?? "#f97316",
    }));
  }, [perSide, serverPlates]);

  const suggestion = useMemo(() => {
    if (perSide != null || target <= barWeight || availablePlates.length === 0) return null;
    return nearestLoadable(target, barWeight, availablePlates, targetStep);
  }, [perSide, target, barWeight, availablePlates, targetStep]);

  const perSideTotal = perSide ? perSide.reduce((s, p) => s + p.weight * p.count, 0) : 0;

  // ----- inventory editing -----
  const updateRow = (index: number, patch: Partial<EditPlate>) => {
    setRows((prev) => (prev ?? []).map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => {
      if (!prev || prev.length >= MAX_PLATES) return prev;
      const smallest = Math.min(...prev.map((r) => r.weight).filter((w) => w > 0), 25);
      return [...prev, { weight: Math.max(0.25, smallest / 2), colour: "#f97316", count: 2, isAvailable: true }];
    });
  };

  const removeRow = (index: number) => {
    setRows((prev) => (prev ?? []).filter((_, i) => i !== index));
  };

  const resetRows = () => setRows(serverRows);

  const saveInventory = async () => {
    if (!rows) return;
    const body = {
      unitSystem: tab,
      plates: rows.map(({ weight, colour, count, isAvailable }) => ({
        weight,
        colour,
        count,
        isAvailable,
      })),
    };
    if (!online) {
      queueMutation("/api/plates", "PUT", body, `Plate inventory (${tab})`);
      toast.success("Saved offline — will sync when you reconnect");
      return;
    }
    setSaving(true);
    try {
      await platesApi.replace(body);
      invalidate.plates();
      toast.success(`Plate inventory saved (${tab})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save plate inventory");
    } finally {
      setSaving(false);
    }
  };

  const pickExercise = (e: ExerciseDTO) => {
    setExercise(e);
    if (e.barWeight != null && e.barWeight > 0) setBarWeight(e.barWeight);
  };

  return (
    <div className="space-y-4">
      {/* Calculator */}
      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Disc3 className="h-4.5 w-4.5" />
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold leading-tight">Plate Calculator</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Exact loads from your plate inventory — works offline
              </p>
            </div>
            <Tabs
              value={tab}
              onValueChange={(v) => {
                const next = v as UnitSystem;
                setTab(next);
                setBarWeight(DEFAULT_BAR[next]);
                setTarget(DEFAULT_TARGET[next]);
              }}
            >
              <TabsList className="h-8">
                <TabsTrigger value="metric" className="px-3 text-xs">kg</TabsTrigger>
                <TabsTrigger value="imperial" className="px-3 text-xs">lb</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* exercise (optional) */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="gap-2 h-10 flex-1 min-w-[180px] justify-start"
              onClick={() => setPickerOpen(true)}
            >
              <Dumbbell className="h-4 w-4 text-muted-foreground shrink-0" />
              {exercise ? (
                <span className="truncate">
                  {exercise.name}
                  {exercise.barWeight != null && exercise.barWeight > 0 && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      (bar {round1(exercise.barWeight)} {unit})
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">Exercise (uses its bar weight)…</span>
              )}
            </Button>
            {exercise && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                aria-label="Clear exercise"
                onClick={() => setExercise(null)}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
            <ExercisePickerDialog
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              onPick={pickExercise}
              title="Barbell exercise"
              description="Picking an exercise with a bar weight pre-fills it."
            />
          </div>

          {/* inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Bar weight ({unit})</Label>
              <Stepper
                ariaLabel="Bar weight"
                value={barWeight}
                onChange={(v) => setBarWeight(v ?? 0)}
                min={0}
                max={500}
                step={0.5}
                decimals={1}
                suffix={unit}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Target total ({unit})</Label>
              <Stepper
                ariaLabel="Target total weight"
                value={target}
                onChange={(v) => setTarget(v ?? 0)}
                min={0}
                max={1500}
                step={targetStep}
                decimals={2}
                suffix={unit}
              />
            </div>
          </div>

          {/* result */}
          <div
            className={cn(
              "rounded-2xl border p-4 transition-colors",
              perSide
                ? "border-primary/25 bg-primary/5"
                : "border-destructive/30 bg-destructive/5",
            )}
          >
            {target <= barWeight ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
                Target must be above the bar weight ({round1(barWeight)} {unit}) to load plates.
              </p>
            ) : perSide ? (
              <>
                <BarVisual perSide={perSideVisual ?? []} unit={unit} />
                <div className="mt-1 flex items-baseline justify-center gap-2 flex-wrap text-center">
                  <span className="numeric text-3xl font-black text-primary">
                    {round1(target)}
                    <span className="ml-1 text-sm font-bold text-primary/60">{unit}</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> loadable
                  </span>
                </div>
                <p className="numeric mt-1.5 text-center text-xs text-muted-foreground">
                  bar {round1(barWeight)} {unit} + {round1(perSideTotal)} {unit} per side
                </p>
                {perSide.length > 0 ? (
                  <p className="numeric mt-2 text-center text-sm font-medium">
                    {perSide.map((p) => `${p.count} × ${round1(p.weight)}${unit}`).join(", ")}{" "}
                    <span className="text-muted-foreground font-normal">per side</span>
                  </p>
                ) : (
                  <p className="mt-2 text-center text-sm text-muted-foreground">
                    Empty bar — just the {round1(barWeight)} {unit} bar.
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-3 py-2 text-center">
                <p className="flex items-center justify-center gap-2 text-sm font-medium text-destructive">
                  <XCircle className="h-4 w-4 shrink-0" />
                  {round1(target)} {unit} is not loadable with your current plates
                </p>
                {suggestion != null && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      Nearest loadable:{" "}
                      <span className="numeric font-semibold text-foreground">
                        {round1(suggestion)} {unit}
                      </span>{" "}
                      ({suggestion < target ? "−" : "+"}
                      {round1(Math.abs(suggestion - target))} {unit})
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => setTarget(suggestion)}
                    >
                      <RotateCcw className="h-3 w-3" /> Use {round1(suggestion)} {unit}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Inventory editor */}
      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold">Plate inventory ({unit})</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Colours, counts and availability used by the calculator{!online && " — offline edits are queued"}
              </p>
            </div>
            {dirty && (
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                Unsaved changes
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {platesLoading && rows == null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading plates…</p>
          ) : rows == null || rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 py-8 text-center">
              <p className="text-sm text-muted-foreground">No plates in this unit system yet.</p>
              <Button variant="outline" className="gap-2" onClick={addRow}>
                <Plus className="h-4 w-4" /> Add your first plate
              </Button>
            </div>
          ) : (
            <>
              <div className="max-h-96 overflow-y-auto scroll-slim rounded-xl border border-border/60 divide-y divide-border/60">
                {rows.map((row, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4"
                  >
                    <input
                      type="color"
                      aria-label={`Colour for ${row.weight} ${unit} plate`}
                      value={row.colour}
                      onChange={(e) => updateRow(i, { colour: e.target.value })}
                      className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-1"
                      style={{ accentColor: row.colour }}
                    />
                    <div className="flex-1 min-w-0">
                      <Stepper
                        ariaLabel={`Plate weight ${i + 1}`}
                        value={row.weight}
                        onChange={(v) => updateRow(i, { weight: v ?? 0.25 })}
                        min={0.25}
                        max={1000}
                        step={0.25}
                        decimals={2}
                        suffix={unit}
                        size="sm"
                      />
                    </div>
                    <div className="w-[104px] shrink-0">
                      <Stepper
                        ariaLabel={`Plate count for ${row.weight} ${unit}`}
                        value={row.count}
                        onChange={(v) => updateRow(i, { count: v ?? 0 })}
                        min={0}
                        max={50}
                        step={1}
                        decimals={0}
                        size="sm"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Switch
                        aria-label={`Availability for ${row.weight} ${unit} plates`}
                        checked={row.isAvailable}
                        onCheckedChange={(v) => updateRow(i, { isAvailable: v })}
                      />
                      <span className="hidden text-[11px] text-muted-foreground sm:inline w-[52px]">
                        {row.isAvailable ? "in use" : "stored"}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${row.weight} ${unit} plates`}
                      onClick={() => removeRow(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={addRow}
                  disabled={rows.length >= MAX_PLATES}
                >
                  <Plus className="h-4 w-4" /> Add plate
                </Button>
                <div className="ml-auto flex items-center gap-2">
                  {dirty && (
                    <Button variant="ghost" className="gap-2" onClick={resetRows} disabled={saving}>
                      <RotateCcw className="h-4 w-4" /> Reset
                    </Button>
                  )}
                  <Button className="gap-2" onClick={() => void saveInventory()} disabled={!dirty || saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save inventory
                  </Button>
                </div>
              </div>
            </>
          )}

          <AnimatePresence>
            {!online && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
              >
                You&apos;re offline — inventory changes are queued and sync automatically when you
                reconnect.
              </motion.p>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}
