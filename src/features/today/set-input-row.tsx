"use client";

// Set value input row: renders only the fields relevant to the exercise type.
// weight → Stepper (exercise increment), reps → Stepper (step 1),
// distance → Stepper (0.5 km), timeSec → segmented TimeInput.
import type { SetField } from "@/lib/constants";
import { Stepper } from "@/components/shared/stepper";
import { TimeInput } from "./time-input";

export type SetValues = {
  weight: number | null;
  reps: number | null;
  distance: number | null;
  timeSec: number | null;
};

export const EMPTY_SET_VALUES: SetValues = { weight: null, reps: null, distance: null, timeSec: null };

export function SetInputRow({
  fields,
  values,
  onChange,
  weightStep,
}: {
  fields: SetField[];
  values: SetValues;
  onChange: (patch: Partial<SetValues>) => void;
  weightStep: number;
}) {
  const show = (f: SetField) => fields.includes(f);
  const cols =
    fields.length >= 2 ? "grid-cols-2" : "grid-cols-1";

  return (
    <div className={`grid gap-2.5 ${cols}`}>
      {show("weight") && (
        <label className="block min-w-0">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Weight <span className="normal-case text-muted-foreground/70">(kg)</span>
          </span>
          <Stepper
            value={values.weight}
            onChange={(v) => onChange({ weight: v })}
            step={weightStep > 0 ? weightStep : 2.5}
            min={0}
            max={1000}
            decimals={2}
            allowClear
            suffix="kg"
            ariaLabel="weight"
          />
        </label>
      )}
      {show("reps") && (
        <label className="block min-w-0">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Reps</span>
          <Stepper
            value={values.reps}
            onChange={(v) => onChange({ reps: v })}
            step={1}
            min={0}
            max={1000}
            decimals={0}
            allowClear
            ariaLabel="reps"
          />
        </label>
      )}
      {show("distance") && (
        <label className="block min-w-0">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Distance</span>
          <Stepper
            value={values.distance}
            onChange={(v) => onChange({ distance: v })}
            step={0.5}
            min={0}
            max={999}
            decimals={2}
            allowClear
            suffix="km"
            ariaLabel="distance"
          />
        </label>
      )}
      {show("timeSec") && (
        <div className={fields.length === 1 ? "" : "col-span-2"}>
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Time <span className="normal-case text-muted-foreground/70">(h:m:s)</span>
          </span>
          <TimeInput valueSec={values.timeSec} onChange={(v) => onChange({ timeSec: v })} />
        </div>
      )}
    </div>
  );
}
