"use client";

// Add / edit exercise dialog. Also reused by the exercise overview header.
// Supports inline "Create category…", type-change warning, and kg↔lbs
// conversion choice on unit change.
// NOTE: state is initialised from `exercise` on mount — parents must remount
// this dialog per open-session via a changing `key` (see exercises-view).
import { useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Stepper } from "@/components/shared/stepper";
import { CategoryDot } from "@/components/shared/category-dot";
import { CATEGORY_PALETTE, EXERCISE_TYPES, GRAPH_METRICS } from "@/lib/constants";
import type { ExerciseDTO } from "@/lib/types";
import { useApp } from "@/lib/client/store";
import { useCategories, useInvalidate } from "@/lib/client/query";
import { categoriesApi, exercisesApi, type ExerciseInput } from "@/lib/client/api";
import { toast } from "sonner";
import { Dumbbell, Plus, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { defaultUnitFor, graphMetricLabel, metricsForType, typeLabel } from "./labels";
import { useOfflineRun } from "./offline-run";

const NEW_CATEGORY = "__new__";
const DEFAULT_UNIT = "__default__";
const NO_GRAPH = "__none__";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → create mode. */
  exercise: ExerciseDTO | null;
  /** Called after a successful save (create or update). */
  onSaved?: (exercise: ExerciseDTO | null) => void;
};

function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}

export function ExerciseFormDialog({ open, onOpenChange, exercise, onSaved }: Props) {
  const settings = useApp((s) => s.settings);
  const { data: categories = [] } = useCategories();
  const invalidate = useInvalidate();
  const run = useOfflineRun();
  const editing = !!exercise;

  const [name, setName] = useState(exercise?.name ?? "");
  const [notes, setNotes] = useState(exercise?.notes ?? "");
  const [categoryId, setCategoryId] = useState<string>(exercise?.categoryId ?? "");
  const [newCatName, setNewCatName] = useState("");
  const [newCatColour, setNewCatColour] = useState<string>(CATEGORY_PALETTE[0]);
  const [type, setType] = useState<string>(exercise?.type ?? "WEIGHT_REPS");
  const [weightUnit, setWeightUnit] = useState<string>(exercise?.weightUnit ?? DEFAULT_UNIT);
  const [unitChangeMode, setUnitChangeMode] = useState<"convert" | "change">("convert");
  const [weightIncrement, setWeightIncrement] = useState<number | null>(exercise?.weightIncrement ?? null);
  const [restSec, setRestSec] = useState<number | null>(exercise?.restSec ?? null);
  const [barWeight, setBarWeight] = useState<number | null>(exercise?.barWeight ?? null);
  const [defaultGraph, setDefaultGraph] = useState<string>(exercise?.defaultGraph ?? NO_GRAPH);
  const [saving, setSaving] = useState(false);

  const effectiveCategoryId =
    categoryId === "" ? (categories[0]?.id ?? NEW_CATEGORY) : categoryId;
  const allowedMetrics = metricsForType(type);
  const unitOptions: Array<{ value: string; label: string }> = [
    { value: DEFAULT_UNIT, label: `Default (${defaultUnitFor(settings)})` },
    { value: "kg", label: "kg (metric)" },
    { value: "lbs", label: "lbs (imperial)" },
  ];
  const selectedUnit = weightUnit === "lbs" ? "lbs" : weightUnit === "kg" ? "kg" : defaultUnitFor(settings);

  const unitChanged = editing && weightUnit !== (exercise?.weightUnit ?? DEFAULT_UNIT);
  const typeChanged = editing && type !== exercise?.type;

  const resetForNew = () => {
    setName("");
    setNotes("");
    setNewCatName("");
    setSaving(false);
  };

  const handleSave = async (andNew: boolean) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Please give the exercise a name");
      return;
    }
    if (effectiveCategoryId === NEW_CATEGORY && !newCatName.trim()) {
      toast.error("Please name the new category");
      return;
    }

    setSaving(true);
    let resolvedCategoryId = effectiveCategoryId;

    // Inline category creation (needs a connection — the id comes from the server).
    if (effectiveCategoryId === NEW_CATEGORY) {
      const online = typeof navigator === "undefined" ? true : navigator.onLine;
      if (!online) {
        setSaving(false);
        toast.error("Creating a new category needs a connection");
        return;
      }
      try {
        const created = await categoriesApi.create({ name: newCatName.trim(), colour: newCatColour });
        resolvedCategoryId = created.id;
        setCategoryId(created.id);
      } catch (e) {
        setSaving(false);
        toast.error(e instanceof Error ? e.message : "Could not create category");
        return;
      }
    }

    const payload: ExerciseInput = {
      name: trimmedName,
      notes: notes.trim() || null,
      categoryId: resolvedCategoryId,
      type,
      weightUnit: weightUnit === DEFAULT_UNIT ? null : weightUnit,
      weightIncrement,
      restSec,
      barWeight,
      defaultGraph: defaultGraph === NO_GRAPH ? null : defaultGraph,
    };
    if (editing && unitChanged) payload.unitChangeMode = unitChangeMode;

    const ok = await run({
      label: editing ? "Exercise update" : "Exercise",
      path: editing ? `/api/exercises/${exercise!.id}` : "/api/exercises",
      method: editing ? "PATCH" : "POST",
      body: payload,
      run: () => (editing ? exercisesApi.update(exercise!.id, payload) : exercisesApi.create(payload)),
      successMsg: editing
        ? "Exercise updated"
        : `“${trimmedName}” created`,
      onDone: () => {
        invalidate.exercises();
        invalidate.categories();
        invalidate.goals();
        onSaved?.(editing ? null : null);
        if (andNew && !editing) resetForNew();
        else onOpenChange(false);
      },
    });
    if (!ok) setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-primary" />
            {editing ? "Edit exercise" : "New exercise"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update details, defaults and category."
              : "Add an exercise to your library."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto scroll-slim p-5 space-y-4">
          <Field label="Name *" htmlFor="ex-name">
            <Input
              id="ex-name"
              autoFocus={!editing}
              placeholder="e.g. Barbell Bench Press"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label="Notes" htmlFor="ex-notes">
            <Textarea
              id="ex-notes"
              rows={2}
              placeholder="Cues, setup, grip width…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="ex-category">
              <Select value={effectiveCategoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="ex-category" className="w-full">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <CategoryDot colour={c.colour} size={8} ring={false} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_CATEGORY}>
                    <span className="flex items-center gap-2 text-primary font-medium">
                      <Plus className="h-3.5 w-3.5" /> Create category…
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Type"
              htmlFor="ex-type"
              hint={typeChanged ? "Changing type keeps overlapping field data and clears the rest on new sets." : undefined}
            >
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="ex-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXERCISE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {typeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {effectiveCategoryId === NEW_CATEGORY && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
              <p className="text-xs font-semibold text-primary">New category</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Category name" htmlFor="new-cat-name">
                  <Input
                    id="new-cat-name"
                    placeholder="e.g. Forearms"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                  />
                </Field>
                <Field label="Colour">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {CATEGORY_PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Use colour ${c}`}
                        aria-pressed={newCatColour === c}
                        className={cn(
                          "h-7 w-7 rounded-lg transition-transform",
                          newCatColour === c && "ring-2 ring-ring ring-offset-2 ring-offset-background scale-110",
                        )}
                        style={{ backgroundColor: c }}
                        onClick={() => setNewCatColour(c)}
                      />
                    ))}
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="color"
                        aria-label="Custom colour"
                        className="h-7 w-8 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                        value={newCatColour}
                        onChange={(e) => setNewCatColour(e.target.value)}
                      />
                      Custom
                    </label>
                  </div>
                </Field>
              </div>
            </div>
          )}

          {unitChanged && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                Weight unit change — what should happen to logged weights?
              </p>
              <RadioGroup
                value={unitChangeMode}
                onValueChange={(v) => setUnitChangeMode(v as "convert" | "change")}
                className="gap-2"
              >
                <label className="flex items-start gap-2.5 rounded-lg border bg-background/60 p-2.5 cursor-pointer has-[button[data-state=checked]]:border-primary/50">
                  <RadioGroupItem value="convert" className="mt-0.5" />
                  <span className="text-xs leading-snug">
                    <span className="font-medium block">Convert values (kg↔lbs ×2.20462)</span>
                    <span className="text-muted-foreground">Rewrites existing set weights and PRs to the new unit.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 rounded-lg border bg-background/60 p-2.5 cursor-pointer has-[button[data-state=checked]]:border-primary/50">
                  <RadioGroupItem value="change" className="mt-0.5" />
                  <span className="text-xs leading-snug">
                    <span className="font-medium block">Just change unit</span>
                    <span className="text-muted-foreground">Numbers stay the same, only the label changes.</span>
                  </span>
                </label>
              </RadioGroup>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Weight unit" htmlFor="ex-unit">
              <Select value={weightUnit} onValueChange={setWeightUnit}>
                <SelectTrigger id="ex-unit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Weight increment" htmlFor="ex-inc">
              <Stepper
                value={weightIncrement}
                onChange={setWeightIncrement}
                step={selectedUnit === "lbs" ? 5 : 2.5}
                min={0}
                max={500}
                decimals={2}
                suffix={selectedUnit}
                allowClear
                placeholder="default"
                ariaLabel="weight increment"
              />
            </Field>

            <Field label="Rest seconds" htmlFor="ex-rest">
              <Stepper
                value={restSec}
                onChange={setRestSec}
                step={10}
                min={0}
                max={1800}
                decimals={0}
                suffix="s"
                allowClear
                placeholder="default"
                ariaLabel="rest seconds"
              />
            </Field>

            <Field label="Bar weight" htmlFor="ex-bar">
              <Stepper
                value={barWeight}
                onChange={setBarWeight}
                step={selectedUnit === "lbs" ? 5 : 2.5}
                min={0}
                max={500}
                decimals={2}
                suffix={selectedUnit}
                allowClear
                placeholder="none"
                ariaLabel="bar weight"
              />
            </Field>
          </div>

          <Field label="Default graph" htmlFor="ex-graph">
            <Select value={defaultGraph} onValueChange={setDefaultGraph}>
              <SelectTrigger id="ex-graph" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GRAPH}>None — use best guess</SelectItem>
                {GRAPH_METRICS.filter((m) => allowedMetrics.includes(m)).map((m) => (
                  <SelectItem key={m} value={m}>
                    {graphMetricLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DialogFooter className="p-5 pt-3 border-t bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {editing ? (
            <Button onClick={() => void handleSave(false)} disabled={saving} className="gap-1.5 min-w-24">
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save"}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => void handleSave(true)} disabled={saving} className="gap-1.5">
                <Plus className="h-4 w-4" /> Save &amp; New
              </Button>
              <Button onClick={() => void handleSave(false)} disabled={saving} className="gap-1.5 min-w-24">
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
