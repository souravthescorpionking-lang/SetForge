"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SetTool — inline expansion of the Set calculator row on #/tools.
// Inputs: base weight (+ sets × reps defaults) → percentage table as 40px
// result rows; tap a percentage to toggle it. Ported from the legacy
// set-calculator's percentage math (roundToStep).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useApp } from "@/lib/client/store";
import { roundToStep } from "@/lib/formulas";
import { round1 } from "@/lib/client/format";
import { Check } from "lucide-react";
import { FieldRow, PanelNote, ResultRow, ToolPanel, parseNum } from "./tool-bits";

const PERCENTS = [95, 90, 85, 80, 75, 70, 65, 60] as const;

export function SetTool() {
  const settings = useApp((s) => s.settings);
  const unit = settings?.unitSystem === "imperial" ? "lb" : "kg";
  const increment = settings?.defaultWeightIncrement ?? 2.5;

  const [baseRaw, setBaseRaw] = useState<string>(() => (settings?.unitSystem === "imperial" ? "135" : "60"));
  const [setsRaw, setSetsRaw] = useState<string>("3");
  const [repsRaw, setRepsRaw] = useState<string>("8");
  const [selected, setSelected] = useState<number[]>([80]);

  const base = parseNum(baseRaw) ?? 0;
  const sets = Math.max(1, Math.min(10, Math.round(parseNum(setsRaw) ?? 3)));
  const reps = Math.max(1, Math.min(50, Math.round(parseNum(repsRaw) ?? 8)));

  const rows = useMemo(
    () =>
      PERCENTS.map((pct) => ({
        pct,
        weight: roundToStep((base * pct) / 100, increment),
      })),
    [base, increment],
  );

  const totalSets = selected.length * sets;
  const totalVolume = rows
    .filter((r) => selected.includes(r.pct))
    .reduce((sum, r) => sum + r.weight * reps * sets, 0);

  return (
    <ToolPanel label="Set calculator">
      <FieldRow
        label={`Base weight (${unit})`}
        value={baseRaw}
        onChange={setBaseRaw}
        unit={unit}
        min={0}
        max={1000}
        step={increment}
        ariaLabel="Base weight"
      />
      <FieldRow label="Sets per %" value={setsRaw} onChange={setSetsRaw} min={1} max={10} step={1} ariaLabel="Sets per percentage" />
      <FieldRow label="Reps per set" value={repsRaw} onChange={setRepsRaw} min={1} max={50} step={1} ariaLabel="Reps per set" />

      {/* percentage table — tap a row to toggle */}
      {rows.map((r) => {
        const on = selected.includes(r.pct);
        return (
          <ResultRow
            key={r.pct}
            label={
              <>
                {on ? <Check className="mr-1 inline h-3.5 w-3.5 text-primary" aria-hidden /> : null}
                {r.pct}% of base
              </>
            }
            value={base > 0 ? `${round1(r.weight)} ${unit} × ${reps}` : "–"}
            highlight={on}
            onClick={() =>
              setSelected((prev) =>
                prev.includes(r.pct) ? prev.filter((p) => p !== r.pct) : [...prev, r.pct],
              )
            }
            ariaLabel={`${r.pct} percent of base weight${on ? " — selected" : ""}`}
          />
        );
      })}

      <ResultRow
        label="Working sets"
        value={
          selected.length > 0
            ? `${totalSets} sets · ${round1(totalVolume)} ${unit} volume`
            : "none selected"
        }
        highlight={selected.length > 0}
      />
      <PanelNote>
        Tap percentages to build your session. Loads are rounded to {round1(increment)} {unit}.
      </PanelNote>
    </ToolPanel>
  );
}
