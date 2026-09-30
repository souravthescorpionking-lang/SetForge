"use client";

// ─────────────────────────────────────────────────────────────────────────────
// OnDemandFiltersScreen — #/on-demand/filters (Part 9 §7, full screen).
//
//   TopBar (56)    : BackButton(→ #/on-demand) · "Filters"
//   ScrollBody     : §7 filter sections (calendar-filters row patterns) —
//     Intensity    : multi — Beginner / Intermediate / Advanced (48px rows)
//     Target area  : multi — the 12 §7 muscles (48px rows; Core maps to
//                    ABS + OBLIQUES primary muscles in the server query)
//     Duration     : single — ≤20 · 20-45 · ≥45 (selecting one replaces)
//     Equipment    : multi — No equipment · Minimal · Gym
//   BottomBar (56) : "Clear all" (secondary left) · "Apply" (primary right —
//                    the ONE primary button of the screen)
//
// STATE LIVES IN THE URL: the list screen opens this screen carrying the full
// #/on-demand state in the hash query (filter-url.ts); the draft is seeded
// from it on mount, Apply writes the edited state back onto #/on-demand and
// navigates there, and Clear all empties the four filter dimensions. `q` and
// the active chip pass through untouched (they belong to the list screen).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Screen, TopBar, ScrollBody, BottomBar } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { useHashRoute } from "@/features/shell/router";
import { DIFFICULTY_LABELS, type Difficulty } from "@/lib/constants";
import {
  EMPTY_ON_DEMAND_FILTERS,
  TARGET_AREAS,
  onDemandListHash,
  parseOnDemandFilters,
  type OnDemandUrlFilters,
} from "./filter-url";

const INTENSITY_ROWS = (["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const).map((d) => ({
  key: d,
  label: DIFFICULTY_LABELS[d as Difficulty],
}));

const DURATION_ROWS = [
  { key: "LE20", label: "≤ 20 min" },
  { key: "20_45", label: "20 – 45 min" },
  { key: "GE45", label: "≥ 45 min" },
] as const;

const EQUIPMENT_ROWS = [
  { key: "NONE", label: "No equipment" },
  { key: "MINIMAL", label: "Minimal" },
  { key: "GYM", label: "Gym" },
] as const;

/** 32px section header — deliberately NOT a data-row (height law). */
function SectionHeader({ label }: { label: string }) {
  return (
    <h2 className="flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span className="truncate">{label}</span>
    </h2>
  );
}

function CheckboxMark({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border-2",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
      )}
      aria-hidden
    >
      {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </span>
  );
}

function RadioMark({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 flex-none items-center justify-center rounded-full border-2",
        active ? "border-primary" : "border-muted-foreground/40",
      )}
      aria-hidden
    >
      {active ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
    </span>
  );
}

const ROW_CLS =
  "flex h-12 w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 text-left text-sm transition-colors hover:bg-accent/50";

export default function OnDemandFiltersScreen() {
  const navigate = useApp((s) => s.navigate);
  const route = useHashRoute();

  // seed the draft from the list state carried in this route's hash query
  const seeded = useMemo(
    () =>
      route.name === "on-demand-filters"
        ? parseOnDemandFilters(route.query)
        : EMPTY_ON_DEMAND_FILTERS,
    [route.name, route.query],
  );
  const [intensity, setIntensity] = useState<string[]>(seeded.intensity);
  const [muscles, setMuscles] = useState<string[]>(seeded.muscles);
  const [duration, setDuration] = useState<string | null>(seeded.duration);
  const [equipment, setEquipment] = useState<string[]>(seeded.equipment);

  const toggle = (list: string[], key: string): string[] =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

  const apply = () => {
    const next: OnDemandUrlFilters = {
      ...seeded,
      intensity,
      muscles,
      duration,
      equipment,
    };
    navigate(onDemandListHash(next));
  };

  const clearAll = () => {
    setIntensity([]);
    setMuscles([]);
    setDuration(null);
    setEquipment([]);
  };

  return (
    <Screen
      topBar={
        <TopBar
          title="Filters"
          leading={<BackButton fallbackHash="#/on-demand" label="Back to On Demand" />}
        />
      }
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            variant="ghost"
            className="h-11 min-w-0 flex-1 gap-2 text-base font-bold"
            aria-label="Clear all filters"
            tour={{ id: "onDemandFilters.clearAll", label: "Clear all", help: "Empty every filter selection on this screen.", order: 100 }}
            onClick={clearAll}
          >
            Clear all
          </Button>
          <Button
            type="button"
            className="h-11 min-w-0 flex-1 gap-2 text-base font-bold"
            aria-label="Apply filters"
            tour={{ id: "onDemandFilters.apply", label: "Apply", help: "Save the filters and return to the session list.", order: 110 }}
            onClick={apply}
          >
            Apply
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody>
        {/* ── Intensity (multi) ──────────────────────────────────────── */}
        <SectionHeader label="Intensity" />
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="divide-y divide-border/60">
            {INTENSITY_ROWS.map((row) => {
              const checked = intensity.includes(row.key);
              return (
                <button
                  key={row.key}
                  type="button"
                  data-row
                  role="checkbox"
                  aria-checked={checked}
                  {...tourAttrs({ id: "onDemandFilters.intensity", label: "Intensity row", help: "Toggle one or more intensity levels.", order: 20 })}
                  onClick={() => setIntensity((prev) => toggle(prev, row.key))}
                  className={ROW_CLS}
                >
                  <CheckboxMark checked={checked} />
                  <span className={cn("min-w-0 flex-1 truncate", checked && "font-medium")}>{row.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Target area (multi — the 12 §7 muscles) ─────────────────── */}
        <SectionHeader label="Target area" />
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="divide-y divide-border/60">
            {TARGET_AREAS.map((area) => {
              const checked = muscles.includes(area.key);
              return (
                <button
                  key={area.key}
                  type="button"
                  data-row
                  role="checkbox"
                  aria-checked={checked}
                  {...tourAttrs({ id: "onDemandFilters.muscle", label: "Target area row", help: "Toggle one or more target areas.", order: 30 })}
                  onClick={() => setMuscles((prev) => toggle(prev, area.key))}
                  className={ROW_CLS}
                >
                  <CheckboxMark checked={checked} />
                  <span className={cn("min-w-0 flex-1 truncate", checked && "font-medium")}>{area.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Duration (single — selecting replaces) ──────────────────── */}
        <SectionHeader label="Duration" />
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="divide-y divide-border/60">
            {DURATION_ROWS.map((row) => {
              const active = duration === row.key;
              return (
                <button
                  key={row.key}
                  type="button"
                  data-row
                  role="radio"
                  aria-checked={active}
                  {...tourAttrs({ id: "onDemandFilters.duration", label: "Duration row", help: "Pick one session length; picking another replaces it.", order: 40 })}
                  onClick={() => setDuration(active ? null : row.key)}
                  className={ROW_CLS}
                >
                  <RadioMark active={active} />
                  <span className={cn("min-w-0 flex-1 truncate", active && "font-medium")}>{row.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Equipment (multi) ───────────────────────────────────────── */}
        <SectionHeader label="Equipment" />
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="divide-y divide-border/60">
            {EQUIPMENT_ROWS.map((row) => {
              const checked = equipment.includes(row.key);
              return (
                <button
                  key={row.key}
                  type="button"
                  data-row
                  role="checkbox"
                  aria-checked={checked}
                  {...tourAttrs({ id: "onDemandFilters.equipment", label: "Equipment row", help: "Toggle the gear levels you have available.", order: 50 })}
                  onClick={() => setEquipment((prev) => toggle(prev, row.key))}
                  className={ROW_CLS}
                >
                  <CheckboxMark checked={checked} />
                  <span className={cn("min-w-0 flex-1 truncate", checked && "font-medium")}>{row.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="px-1 text-xs leading-snug text-muted-foreground">
          Filters run on the server and stay in the link — share or refresh and
          the same sessions come back.
        </p>
      </ScrollBody>
    </Screen>
  );
}
