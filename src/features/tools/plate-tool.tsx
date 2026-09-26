"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PlateTool — inline expansion of the Plate calculator row on #/tools.
// Inputs: bar weight + target total → greedy per-side breakdown from the
// user's plate inventory (server query, works with cached data offline).
// Math ported from the legacy plate-calculator (plateGreedy + nearest
// loadable search).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { platesApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import { useApp } from "@/lib/client/store";
import { plateGreedy, type PlateLike } from "@/lib/formulas";
import { round1 } from "@/lib/client/format";
import { FieldRow, PanelNote, ResultRow, ToolPanel, parseNum } from "./tool-bits";

const DEFAULT_BAR: Record<"metric" | "imperial", number> = { metric: 20, imperial: 45 };
const DEFAULT_TARGET: Record<"metric" | "imperial", number> = { metric: 60, imperial: 135 };

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

export function PlateTool() {
  const settings = useApp((s) => s.settings);
  const unitSystem = (settings?.unitSystem === "imperial" ? "imperial" : "metric") as "metric" | "imperial";
  const unit = unitSystem === "imperial" ? "lb" : "kg";

  const [barRaw, setBarRaw] = useState<string>(String(DEFAULT_BAR[unitSystem]));
  const [targetRaw, setTargetRaw] = useState<string>(String(DEFAULT_TARGET[unitSystem]));

  const bar = parseNum(barRaw) ?? 0;
  const target = parseNum(targetRaw) ?? 0;

  const { data: platesData, isLoading } = useQuery({
    queryKey: qk.plates(unitSystem),
    queryFn: () => platesApi.list(unitSystem),
  });
  const serverPlates = useMemo(() => platesData?.plates ?? [], [platesData]);
  const availablePlates = useMemo(
    () => serverPlates.filter((p) => p.isAvailable && p.count > 0),
    [serverPlates],
  );

  const perSide = useMemo(
    () => (availablePlates.length > 0 ? plateGreedy(target, bar, availablePlates) : null),
    [target, bar, availablePlates],
  );
  const perSideTotal = perSide ? perSide.reduce((s, p) => s + p.weight * p.count, 0) : 0;

  const smallestPlate = useMemo(
    () => Math.min(...availablePlates.map((p) => p.weight).filter((w) => w > 0)),
    [availablePlates],
  );
  const targetStep =
    Number.isFinite(smallestPlate) && smallestPlate > 0 ? smallestPlate : (settings?.defaultWeightIncrement ?? 2.5);

  const suggestion = useMemo(() => {
    if (perSide != null || target <= bar || availablePlates.length === 0) return null;
    return nearestLoadable(target, bar, availablePlates, targetStep);
  }, [perSide, target, bar, availablePlates, targetStep]);

  return (
    <ToolPanel label="Plate calculator">
      <FieldRow
        label={`Bar weight (${unit})`}
        value={barRaw}
        onChange={setBarRaw}
        unit={unit}
        min={0}
        max={500}
        step={0.5}
        ariaLabel="Bar weight"
      />
      <FieldRow
        label={`Target total (${unit})`}
        value={targetRaw}
        onChange={setTargetRaw}
        unit={unit}
        min={0}
        max={1500}
        step={targetStep}
        ariaLabel="Target total weight"
      />

      {/* status row */}
      <ResultRow
        label="Result"
        value={
          isLoading
            ? "loading…"
            : target <= bar
              ? "target ≤ bar"
              : perSide
                ? "loadable"
                : suggestion != null
                  ? "not loadable"
                  : "no match"
        }
        valueClassName={
          perSide ? "font-bold text-primary" : target > bar ? "text-destructive" : undefined
        }
      />
      {target <= bar ? (
        <PanelNote>Target must be above the bar weight ({round1(bar)} {unit}) to load plates.</PanelNote>
      ) : perSide ? (
        <>
          {perSide.length > 0 ? (
            perSide.map((p) => (
              <ResultRow
                key={p.weight}
                label={`${p.count} × ${round1(p.weight)} ${unit} plate${p.count > 1 ? "s" : ""}`}
                value={`per side`}
                highlight
              />
            ))
          ) : (
            <PanelNote>Empty bar — just the {round1(bar)} {unit} bar.</PanelNote>
          )}
          <ResultRow
            label="Total"
            value={`${round1(target)} ${unit} = bar ${round1(bar)} + ${round1(perSideTotal)} ${unit}/side`}
          />
        </>
      ) : suggestion != null ? (
        <>
          <PanelNote>
            {round1(target)} {unit} is not loadable with your current plates. Nearest loadable:{" "}
            {round1(suggestion)} {unit} ({suggestion < target ? "−" : "+"}
            {round1(Math.abs(suggestion - target))}).
          </PanelNote>
          <ResultRow
            label={`Use ${round1(suggestion)} ${unit} instead`}
            value="tap to apply"
            onClick={() => setTargetRaw(String(Math.round(suggestion * 100) / 100))}
            ariaLabel={`Apply nearest loadable target ${round1(suggestion)} ${unit}`}
          />
        </>
      ) : (
        <PanelNote>No plates available for this unit system — add them from the plate inventory.</PanelNote>
      )}
      <PanelNote>
        Bar {round1(bar)} {unit} · target {round1(target)} {unit} · uses your saved inventory
        ({availablePlates.length} plate types).
      </PanelNote>
    </ToolPanel>
  );
}
