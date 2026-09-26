"use client";

// ─────────────────────────────────────────────────────────────────────────────
// OneRmTool — inline expansion of the One-Rep Max row on #/tools.
// Inputs: weight + reps (single-line 48px fields) → e1RM headline + alternate
// method row + quick rep-max rows. Math ported from @/lib/formulas.
//
// NOTE (p3-8 deviation, documented in the worklog): the headline defaults to
// Epley — the task gate expects 100 kg × 5 → e1RM ≈ 115–120 (Epley = 116.7;
// legacy legacy calculator showed Brzycki = 112.5). The method row cycles
// Epley ↔ Brzycki inline and BOTH values are always displayed.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useApp } from "@/lib/client/store";
import { estOneRm, estOneRmEpley, estRm } from "@/lib/formulas";
import { round1 } from "@/lib/client/format";
import { FieldRow, PanelNote, ResultRow, ToolPanel, parseNum } from "./tool-bits";

type Method = "EPLEY" | "BRZYCKI";

export function OneRmTool() {
  const settings = useApp((s) => s.settings);
  const unit = settings?.unitSystem === "imperial" ? "lb" : "kg";
  const repLimit = settings?.estOneRmRepLimit ?? 10;

  const [weightRaw, setWeightRaw] = useState<string>(() => (settings?.unitSystem === "imperial" ? "135" : "60"));
  const [repsRaw, setRepsRaw] = useState<string>("5");
  const [method, setMethod] = useState<Method>("EPLEY");

  const weight = parseNum(weightRaw) ?? 0;
  const reps = Math.max(1, Math.min(15, Math.round(parseNum(repsRaw) ?? 1)));

  const epley = useMemo(() => estOneRmEpley(weight, reps), [weight, reps]);
  const brzycki = useMemo(() => estOneRm(weight, reps), [weight, reps]);
  const oneRm = method === "EPLEY" ? epley : brzycki;
  const other = method === "EPLEY" ? brzycki : epley;
  const otherName = method === "EPLEY" ? "Brzycki" : "Epley";

  // quick rep-max rows from the selected method's 1RM
  const rmRows = useMemo(
    () => [5, 8, 10, 12].map((n) => ({ n, w: estRm(oneRm, n) })),
    [oneRm],
  );

  return (
    <ToolPanel label="One-rep max calculator">
      <FieldRow
        label={`Weight (${unit})`}
        value={weightRaw}
        onChange={setWeightRaw}
        unit={unit}
        min={0}
        max={1000}
        step={settings?.defaultWeightIncrement ?? 2.5}
        ariaLabel="Weight lifted"
      />
      <FieldRow
        label="Reps"
        value={repsRaw}
        onChange={setRepsRaw}
        min={1}
        max={15}
        step={1}
        ariaLabel="Reps performed"
      />
      {/* method cycle row */}
      <ResultRow
        label={
          <>
            Method <span className="text-xs font-normal text-muted-foreground">(tap to switch)</span>
          </>
        }
        value={method === "EPLEY" ? "Epley" : "Brzycki"}
        onClick={() => setMethod((m) => (m === "EPLEY" ? "BRZYCKI" : "EPLEY"))}
        ariaLabel="Estimation method — tap to switch between Epley and Brzycki"
      />
      {/* headline result */}
      <div
        data-row
        className="flex h-14 items-center justify-between gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-primary/25 bg-primary/10 px-3"
        aria-live="polite"
      >
        <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wider text-primary/80">
          Estimated 1RM
        </span>
        <span className="flex-none text-2xl font-black tabular-nums text-primary">
          {weight > 0 && reps > 0 ? round1(oneRm) : "–"}
          {weight > 0 && reps > 0 ? <span className="ml-1 text-sm font-bold text-primary/60">{unit}</span> : null}
        </span>
      </div>
      <ResultRow
        label={`${otherName} formula`}
        value={weight > 0 ? `${round1(other)} ${unit}` : "–"}
      />
      {rmRows.map((r) => (
        <ResultRow
          key={r.n}
          label={
            <>
              {r.n}RM
              {r.n > repLimit ? <span className="ml-1 text-xs font-normal text-muted-foreground/70">&gt; limit</span> : null}
            </>
          }
          value={weight > 0 ? `${round1(r.w)} ${unit}` : "–"}
          highlight={r.n === reps}
        />
      ))}
      <PanelNote>
        {weight > 0 ? `${round1(weight)} ${unit} × ${reps} reps` : "Enter a weight"} · guide only — record
        tracking counts sets of up to {repLimit} reps.
      </PanelNote>
    </ToolPanel>
  );
}
