"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProgramBuilderScreen — #/programs/new/builder (Part 6 §4.7).
//
// A single-page vertical stepper — every step is an inline section with a
// 32px header (NO wizard dialogs/sheets):
//
//   TopBar (56)  : [◀ back to programs] · "New program" · [Create h-11]
//                  (disabled until a name + ≥1 named workout template exist)
//   ScrollBody   : 1 Basics — name input h-12 · difficulty segmented 40px ·
//                  days/week stepper 48 (auto-derives from the weekly template
//                  until set manually) · est-minutes stepper 48
//                  2 Phases — PhaseRow 48 ×N (name input · weeks stepper · ×)
//                  + "Add phase" 40 dashed. Default: "Phase 1" × 1 week.
//                  3 Weekly template — 7 DayTemplateRow 48
//                  (`Mon · [template name input] · [Workout ▾ | Rest ▾]`)
//                  4 Exercises (optional) — per named template: added rows 40
//                  + an inline searchable picker (0fr→1fr expansion) over the
//                  user's own exercises. Draft-only; nothing persists before
//                  Create.
//                  Labels — ChipRow 40 + "+ New label" inline input.
//   Create       : programsMetaApi.build → invalidate programs → toast
//                  "Program created · N days" → replaceHash #/programs/{id}.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { tourAttrs } from "@/lib/tour/attrs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronLeft,
  Dumbbell,
  Hammer,
  Minus,
  Moon,
  Plus,
  Search,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { programsMetaApi, type BuilderProgramInput, type BuilderSetInput } from "@/lib/client/api";
import { useExercises, useInvalidate, useOnline } from "@/lib/client/query";
import { replaceHash } from "@/features/shell/router";
import { hapticSuccess, hapticTap } from "@/lib/client/haptics";
import { DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty } from "@/lib/constants";
import { CategoryDot } from "@/components/shared/category-dot";
import { InlineInput, errorMessage } from "./screen-helpers";

/** weekday index → label (0 = Mon … 6 = Sun — the builder's canonical order). */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Blank sets attached to builder-added exercises (3 per §4.7). */
const BLANK_BUILDER_SETS: BuilderSetInput[] = [{}, {}, {}];

type DayTemplate = { type: "WORKOUT" | "REST"; name: string };
type PhaseDraft = { name: string; weeks: number };

const DEFAULT_WEEKLY: DayTemplate[] = [
  { type: "WORKOUT", name: "" },
  { type: "WORKOUT", name: "" },
  { type: "WORKOUT", name: "" },
  { type: "WORKOUT", name: "" },
  { type: "WORKOUT", name: "" },
  { type: "REST", name: "" },
  { type: "REST", name: "" },
];

// ---------- small building blocks ----------

function SectionHeader({ step, title, hint }: { step: string; title: string; hint?: string }) {
  return (
    <div
      data-row
      role="group"
      aria-label={`Step ${step}: ${title}`}
      className="flex h-8 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap px-1"
    >
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded bg-primary/10 text-[11px] font-bold tabular-nums text-primary">
        {step}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {hint ? (
        <span className="flex-none text-[11px] font-medium text-muted-foreground/70">{hint}</span>
      ) : null}
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  formatValue,
  ariaLabel,
  onDecrement,
  onIncrement,
}: {
  value: number | null;
  min: number;
  max: number;
  formatValue?: (v: number | null) => string;
  ariaLabel: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const text = formatValue ? formatValue(value) : value == null ? "–" : String(value);
  return (
    <span className="flex flex-none items-center gap-1">
      <Button
        type="button"
        variant="outline"
        className="h-10 w-10 flex-none p-0"
        disabled={value != null && value <= min}
        aria-label={`Decrease ${ariaLabel}`}
        tour={{ id: "programBuilder.stepper", label: "Stepper", help: "Adjust days per week and estimated minutes.", order: 80 }}
        onClick={() => {
          hapticTap();
          onDecrement();
        }}
      >
        <Minus className="h-4 w-4" aria-hidden />
      </Button>
      <span
        className="flex h-10 w-12 flex-none items-center justify-center text-sm font-bold tabular-nums leading-none"
        aria-live="polite"
        aria-label={`${ariaLabel}: ${text}`}
      >
        {text}
      </span>
      <Button
        type="button"
        variant="outline"
        className="h-10 w-10 flex-none p-0"
        disabled={value != null && value >= max}
        aria-label={`Increase ${ariaLabel}`}
        tour={{ skipTour: true, reason: "The + half of the builder stepper pair" }}
        onClick={() => {
          hapticTap();
          onIncrement();
        }}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </Button>
    </span>
  );
}

// ---------- screen ----------

export default function ProgramBuilderScreen() {
  const navigate = useApp((s) => s.navigate);
  const online = useOnline();
  const invalidate = useInvalidate();

  // ---------- draft state (local only — nothing persists before Create) ----------
  // #/programs/new/builder?name=… deep-links can pre-fill the name.
  const [name, setName] = useState(() => {
    if (typeof window === "undefined") return "";
    const m = window.location.hash.match(/[?&]name=([^&]+)/);
    return m ? decodeURIComponent(m[1]).slice(0, 80) : "";
  });
  const [difficulty, setDifficulty] = useState<Difficulty>("BEGINNER");
  const [daysManual, setDaysManual] = useState<number | null>(null);
  const [estMinutes, setEstMinutes] = useState<number | null>(null);
  const [phases, setPhases] = useState<PhaseDraft[]>([{ name: "Phase 1", weeks: 1 }]);
  const [weekly, setWeekly] = useState<DayTemplate[]>(DEFAULT_WEEKLY);
  const [labels, setLabels] = useState<string[]>([]);
  const [addingLabel, setAddingLabel] = useState(false);
  /** exercises per unique template name (draft; 3 blank sets attach on build). */
  const [exercises, setExercises] = useState<Record<string, Array<{ exerciseId: string; name: string }>>>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const searchFocusRef = useRef<HTMLInputElement | null>(null);

  // ---------- derived ----------
  const workoutDayCount = weekly.filter((w) => w.type === "WORKOUT").length;
  const daysPerWeek = daysManual ?? workoutDayCount;
  const templateNames = useMemo(() => {
    const seen: string[] = [];
    for (const w of weekly) {
      if (w.type !== "WORKOUT") continue;
      const n = w.name.trim();
      if (n && !seen.includes(n)) seen.push(n);
    }
    return seen;
  }, [weekly]);
  const unnamedWorkoutDays = weekly.some((w) => w.type === "WORKOUT" && !w.name.trim());
  const totalWeeks = phases.reduce((n, p) => n + p.weeks, 0);
  const totalDays = totalWeeks * 7;
  const canCreate =
    name.trim().length > 0 && templateNames.length > 0 && !unnamedWorkoutDays && !creating;

  // debounced picker search (250ms) — feeds useExercises
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(pickerSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [pickerSearch]);
  const exercisesQuery = useExercises(debouncedSearch ? { search: debouncedSearch } : undefined);
  const allExercises = exercisesQuery.data ?? [];

  // ---------- mutations ----------
  const setDayType = (index: number, type: "WORKOUT" | "REST") => {
    hapticTap();
    setWeekly((prev) => prev.map((w, i) => (i === index ? { ...w, type } : w)));
  };

  const setDayName = (index: number, dayName: string) => {
    setWeekly((prev) => prev.map((w, i) => (i === index ? { ...w, name: dayName.slice(0, 40) } : w)));
  };

  const addPhase = () => {
    hapticTap();
    setPhases((prev) =>
      prev.length >= 12 ? prev : [...prev, { name: `Phase ${prev.length + 1}`, weeks: 1 }],
    );
  };

  const removePhase = (index: number) => {
    setPhases((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const openPicker = (templateName: string) => {
    hapticTap();
    setPickerSearch("");
    setPickerFor((prev) => (prev === templateName ? null : templateName));
    if (pickerFor !== templateName) {
      requestAnimationFrame(() => searchFocusRef.current?.focus());
    }
  };

  const addExerciseTo = (templateName: string, exerciseId: string, exerciseName: string) => {
    hapticTap();
    setExercises((prev) => {
      const list = prev[templateName] ?? [];
      if (list.some((e) => e.exerciseId === exerciseId)) return prev;
      return { ...prev, [templateName]: [...list, { exerciseId, name: exerciseName }] };
    });
  };

  const removeExerciseFrom = (templateName: string, exerciseId: string) => {
    setExercises((prev) => {
      const list = (prev[templateName] ?? []).filter((e) => e.exerciseId !== exerciseId);
      const next = { ...prev, [templateName]: list };
      return next;
    });
  };

  const addLabel = (label: string) => {
    const clean = label.trim().slice(0, 30);
    if (!clean) return;
    if (labels.includes(clean)) {
      toast.info("That label already exists");
      return;
    }
    if (labels.length >= 20) {
      toast.info("Labels are limited to 20");
      return;
    }
    setLabels((prev) => [...prev, clean]);
  };

  const create = async () => {
    if (!canCreate) return;
    if (!online) {
      toast.info("Creating a program needs a connection");
      return;
    }
    setCreating(true);
    try {
      const exercisesPayload: BuilderProgramInput["exercises"] = {};
      for (const templateName of templateNames) {
        const list = exercises[templateName] ?? [];
        if (list.length === 0) continue;
        exercisesPayload[templateName] = list.map((e) => ({
          exerciseId: e.exerciseId,
          sets: BLANK_BUILDER_SETS,
        }));
      }
      const input: BuilderProgramInput = {
        name: name.trim(),
        difficulty,
        ...(daysManual != null || workoutDayCount > 0 ? { daysPerWeek: Math.max(1, Math.min(7, daysPerWeek)) } : {}),
        ...(estMinutes != null ? { estMinutes } : {}),
        ...(labels.length > 0 ? { labels } : {}),
        phases: phases.map((p, i) => ({ name: p.name.trim() || `Phase ${i + 1}`, weeks: p.weeks })),
        weekly: weekly.map((w, i) => ({
          weekday: i,
          type: w.type,
          ...(w.type === "WORKOUT" ? { name: w.name.trim() } : { name: null }),
        })),
        ...(exercisesPayload && Object.keys(exercisesPayload).length > 0 ? { exercises: exercisesPayload } : {}),
      };
      const res = await programsMetaApi.build(input);
      invalidate.programs();
      invalidate.routines();
      hapticSuccess();
      toast.success(`Program created · ${res.dayCount} days`);
      replaceHash(`#/programs/${res.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  // ---------- render helpers ----------
  const renderWeeklyRow = (index: number) => {
    const day = weekly[index];
    return (
      <div
        key={WEEKDAYS[index]}
        data-row
        className="flex h-12 w-full items-center gap-1 overflow-hidden whitespace-nowrap"
      >
        <span className="w-10 flex-none text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {WEEKDAYS[index]}
        </span>
        {day.type === "WORKOUT" ? (
          <Input
            value={day.name}
            placeholder="Push, Pull…"
            aria-label={`${WEEKDAYS[index]} workout template name`}
            {...tourAttrs({ id: "programBuilder.templateName", label: "Template name", help: "Name the day's template; same names share.", order: 50 })}
            onChange={(e) => setDayName(index, e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-md"
          />
        ) : (
          <span className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
            <Moon className="h-4 w-4 flex-none text-muted-foreground/60" aria-hidden />
            Rest day
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-24 flex-none justify-between gap-1 px-2 text-xs font-bold"
              aria-label={`${WEEKDAYS[index]} day type: ${day.type === "WORKOUT" ? "workout" : "rest"}`}
              tour={{ id: "programBuilder.dayType", label: "Day type", help: "Switch this weekday between workout and rest.", order: 60 }}
            >
              {day.type === "WORKOUT" ? (
                <Dumbbell className="h-4 w-4 flex-none text-primary" aria-hidden />
              ) : (
                <Moon className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">
                {day.type === "WORKOUT" ? "Workout" : "Rest"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => setDayType(index, "WORKOUT")}>
              <Dumbbell className="h-4 w-4" aria-hidden /> Workout
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDayType(index, "REST")}>
              <Moon className="h-4 w-4" aria-hidden /> Rest
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const renderTemplateSection = (templateName: string) => {
    const list = exercises[templateName] ?? [];
    const addedIds = new Set(list.map((e) => e.exerciseId));
    const pickerOpen = pickerFor === templateName;
    const candidates = allExercises
      .filter((ex) => !addedIds.has(ex.id))
      .slice(0, 30);
    return (
      <div key={templateName} className="flex flex-none flex-col overflow-hidden rounded-lg border bg-card">
        {/* template header 40px */}
        <div
          data-row
          className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border px-3"
        >
          <Dumbbell className="h-4 w-4 flex-none text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none" title={templateName}>
            {templateName}
          </span>
          <span className="flex-none text-[11px] font-semibold tabular-nums text-muted-foreground">
            {list.length} exercise{list.length === 1 ? "" : "s"}
          </span>
        </div>
        {/* added exercises — 40px rows with × remove */}
        {list.map((e) => (
          <div
            key={e.exerciseId}
            data-row
            className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/60 pl-4 pr-1"
          >
            <span className="min-w-0 flex-1 truncate text-sm leading-none" title={e.name}>
              {e.name}
            </span>
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-10 flex-none p-0 text-muted-foreground"
              aria-label={`Remove ${e.name} from ${templateName}`}
              tour={{ skipTour: true, reason: "Remove chip on an added exercise row" }}
              onClick={() => removeExerciseFrom(templateName, e.exerciseId)}
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ))}
        {/* + Add exercise → inline searchable picker (0fr→1fr expansion) */}
        <button
          type="button"
          data-row
          aria-expanded={pickerOpen}
          aria-label={`Add exercise to ${templateName}`}
          {...tourAttrs({ id: "programBuilder.addExercise", label: "Add exercise", help: "Open the searchable picker for this template.", order: 70 })}
          className={cn(
            "flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap px-3 text-left text-sm font-medium transition-colors",
            pickerOpen
              ? "bg-primary/5 text-primary"
              : "text-muted-foreground hover:bg-accent/40",
          )}
          onClick={() => openPicker(templateName)}
        >
          {pickerOpen ? (
            <ChevronDown className="h-4 w-4 flex-none rotate-180" aria-hidden />
          ) : (
            <Plus className="h-4 w-4 flex-none" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate">
            {pickerOpen ? "Close picker" : "Add exercise"}
          </span>
        </button>
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: pickerOpen ? "1fr" : "0fr" }}
        >
          <div className="min-h-0 overflow-hidden">
            {pickerOpen ? (
              <div className="flex flex-col gap-2 border-t border-border p-2">
                <div className="relative flex-none">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    ref={searchFocusRef}
                    value={pickerSearch}
                    placeholder="Search your exercises…"
                    aria-label={`Search exercises for ${templateName}`}
                    {...tourAttrs({ skipTour: true, reason: "Search input inside the inline picker" })}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    className="h-10 rounded-md pl-9"
                  />
                </div>
                <div
                  className="scroll-slim flex max-h-96 flex-none flex-col overflow-y-auto"
                  aria-label="Exercise results"
                >
                  {exercisesQuery.isLoading ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground" aria-busy="true">
                      Loading exercises…
                    </p>
                  ) : candidates.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">
                      {debouncedSearch ? "No exercises match that search." : "No exercises yet — create some first."}
                    </p>
                  ) : (
                    candidates.map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        data-row
                        aria-label={`Add ${ex.name} to ${templateName}`}
                        {...tourAttrs({ skipTour: true, reason: "Data-driven result rows in the inline picker" })}
                        onClick={() => addExerciseTo(templateName, ex.id, ex.name)}
                        className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-md px-2 text-left transition-colors hover:bg-accent/50"
                      >
                        <CategoryDot colour={ex.category?.colour ?? null} />
                        <span className="min-w-0 flex-1 truncate text-sm leading-none">{ex.name}</span>
                        <span className="flex-none text-[11px] text-muted-foreground">
                          {ex.category?.name ?? "Exercise"}
                        </span>
                        <Plus className="h-3.5 w-3.5 flex-none text-primary" aria-hidden />
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          leading={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 flex-none"
              onClick={() => navigate("/programs")}
              aria-label="Back to programs"
              tour={{ id: "programBuilder.back", label: "Back", help: "Return to the Programs list.", order: 10 }}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <Hammer className="h-4 w-4 flex-none text-primary" aria-hidden />
              <span className="min-w-0 truncate">New program</span>
            </span>
          }
          actions={
            <>
              <Button
                type="button"
                className="h-11 flex-none px-4 text-sm font-bold"
                disabled={!canCreate}
                aria-label="Create the program"
                tour={{ id: "programBuilder.create", label: "Create", help: "Generate the program and open it.", order: 20 }}
                onClick={() => void create()}
              >
                {creating ? "Creating…" : "Create"}
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
    >
      <ScrollBody>
        {/* ── Step 1 · Basics ─────────────────────────────────────────── */}
        <SectionHeader step="1" title="Basics" />
        <div className="flex flex-none flex-col gap-2 rounded-lg border bg-card p-3">
          <Input
            value={name}
            placeholder="Program name (e.g. Winter Strength Block)"
            aria-label="Program name"
            maxLength={80}
            {...tourAttrs({ id: "programBuilder.name", label: "Program name", help: "Name your program; required to create.", order: 30 })}
            onChange={(e) => setName(e.target.value)}
            className="h-12 rounded-md text-base font-semibold"
          />
          <div
            role="radiogroup"
            aria-label="Difficulty"
            className="flex h-10 w-full flex-none items-center gap-0.5 rounded-lg border bg-background p-0.5"
          >
            {DIFFICULTIES.map((d) => {
              const selected = difficulty === d;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={DIFFICULTY_LABELS[d]}
                  onClick={() => {
                    hapticTap();
                    setDifficulty(d);
                  }}
                  {...tourAttrs({ id: "programBuilder.difficulty", label: "Difficulty", help: "Pick the program's training level.", order: 40 })}
                  className={cn(
                    "h-9 min-w-0 flex-1 rounded-md text-xs font-bold leading-none transition-colors",
                    selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              );
            })}
          </div>
          <div data-row className="flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">Days / week</span>
            {daysManual == null ? (
              <button
                type="button"
                className="flex h-8 flex-none items-center rounded-full border border-primary/40 bg-primary/5 px-3 text-[11px] font-bold text-primary"
                aria-label="Days per week is derived from the weekly template"
                title="Derived from the weekly template"
                {...tourAttrs({ skipTour: true, reason: "Static auto badge; days derive from the template" })}
              >
                auto
              </button>
            ) : (
              <button
                type="button"
                className="flex h-8 flex-none items-center rounded-full border border-border px-3 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-accent"
                aria-label="Reset days per week to automatic"
                {...tourAttrs({ skipTour: true, reason: "Reset-to-auto chip beside the days stepper" })}
                onClick={() => {
                  hapticTap();
                  setDaysManual(null);
                }}
              >
                manual · reset
              </button>
            )}
            <Stepper
              value={daysPerWeek}
              min={1}
              max={7}
              ariaLabel="days per week"
              onDecrement={() => setDaysManual(Math.max(1, daysPerWeek - 1))}
              onIncrement={() => setDaysManual(Math.min(7, daysPerWeek + 1))}
            />
          </div>
          <div data-row className="flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">Est. minutes</span>
            <Stepper
              value={estMinutes}
              min={5}
              max={300}
              ariaLabel="estimated minutes"
              formatValue={(v) => (v == null ? "–" : `${v}`)}
              onDecrement={() => setEstMinutes(Math.max(5, (estMinutes ?? 60) - 5))}
              onIncrement={() => setEstMinutes(Math.min(300, (estMinutes ?? 55) + 5))}
            />
          </div>
        </div>

        {/* ── Step 2 · Phases ─────────────────────────────────────────── */}
        <SectionHeader step="2" title="Phases" hint={`${totalWeeks} week${totalWeeks === 1 ? "" : "s"}`} />
        <div className="flex flex-none flex-col gap-2">
          {phases.map((phase, index) => (
            <div
              key={index}
              data-row
              className="flex h-12 w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-2"
            >
              <Input
                value={phase.name}
                placeholder={`Phase ${index + 1}`}
                aria-label={`Phase ${index + 1} name`}
                maxLength={40}
                {...tourAttrs({ skipTour: true, reason: "Phase name field in the phases list" })}
                onChange={(e) =>
                  setPhases((prev) =>
                    prev.map((p, i) => (i === index ? { ...p, name: e.target.value } : p)),
                  )
                }
                className="h-10 min-w-0 flex-1 rounded-md"
              />
              <span className="flex flex-none items-center gap-0.5">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-9 flex-none p-0"
                  disabled={phase.weeks <= 1}
                  aria-label={`Decrease ${phase.name || `Phase ${index + 1}`} weeks`}
                  tour={{ id: "programBuilder.phaseWeeks", label: "Phase weeks", help: "Set each phase's length; 1–12 weeks.", order: 100, hint: true }}
                  onClick={() => {
                    hapticTap();
                    setPhases((prev) =>
                      prev.map((p, i) => (i === index ? { ...p, weeks: Math.max(1, p.weeks - 1) } : p)),
                    );
                  }}
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </Button>
                <span
                  className="flex h-10 w-10 flex-none items-center justify-center text-sm font-bold tabular-nums leading-none"
                  aria-live="polite"
                >
                  {phase.weeks}
                  <span className="sr-only"> weeks</span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-9 flex-none p-0"
                  disabled={phase.weeks >= 12}
                  aria-label={`Increase ${phase.name || `Phase ${index + 1}`} weeks`}
                  tour={{ skipTour: true, reason: "The + half of the phase weeks stepper" }}
                  onClick={() => {
                    hapticTap();
                    setPhases((prev) =>
                      prev.map((p, i) => (i === index ? { ...p, weeks: Math.min(12, p.weeks + 1) } : p)),
                    );
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
                <span className="flex-none pl-1 pr-0.5 text-[11px] font-semibold uppercase text-muted-foreground">
                  wk
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-11 flex-none p-0 text-muted-foreground hover:text-destructive"
                disabled={phases.length <= 1}
                aria-label={`Remove ${phase.name || `Phase ${index + 1}`}`}
                tour={{ skipTour: true, reason: "Phase remove button in the phases list" }}
                onClick={() => removePhase(index)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
          <button
            type="button"
            data-row
            disabled={phases.length >= 12}
            aria-label="Add phase"
            {...tourAttrs({ id: "programBuilder.addPhase", label: "Add phase", help: "Append another training phase row.", order: 90 })}
            className="flex h-10 w-full items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={addPhase}
          >
            <Plus className="h-4 w-4 flex-none" aria-hidden />
            Add phase
          </button>
        </div>

        {/* ── Step 3 · Weekly template ────────────────────────────────── */}
        <SectionHeader
          step="3"
          title="Weekly template"
          hint={`${workoutDayCount} workout${workoutDayCount === 1 ? "" : "s"}/wk`}
        />
        <div className="flex flex-none flex-col gap-1 rounded-lg border bg-card p-2">
          {weekly.map((_, index) => renderWeeklyRow(index))}
          {unnamedWorkoutDays ? (
            <p className="flex-none px-1 pt-1 text-xs text-amber-600 dark:text-amber-400">
              Give every workout day a template name (days sharing a name share exercises).
            </p>
          ) : null}
        </div>

        {/* ── Step 4 · Exercises (optional) ────────────────────────────── */}
        <SectionHeader step="4" title="Exercises" hint="optional" />
        {templateNames.length === 0 ? (
          <p className="flex-none rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            Name a workout day in step 3 first — each named template gets its own exercise list.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {templateNames.map(renderTemplateSection)}
            <p className="flex-none px-1 text-xs text-muted-foreground">
              Every day generated from a template carries its exercises with 3 blank sets each.
            </p>
          </div>
        )}

        {/* ── Labels ──────────────────────────────────────────────────── */}
        <SectionHeader step="5" title="Labels" />
        <div className="flex flex-none flex-col gap-2 rounded-lg border bg-card p-2">
          <div
            data-row
            data-chip-scroller
            className="no-scrollbar flex h-10 w-full items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
          >
            {labels.length === 0 ? (
              <span className="flex-none text-xs text-muted-foreground">No labels yet — add one below.</span>
            ) : (
              labels.map((l) => (
                <span
                  key={l}
                  className="flex h-8 flex-none items-center gap-1 rounded-full border px-3 text-xs font-semibold"
                >
                  {l}
                  <button
                    type="button"
                    aria-label={`Remove label ${l}`}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    {...tourAttrs({ skipTour: true, reason: "Label remove chip in the builder labels step" })}
                    onClick={() => setLabels((prev) => prev.filter((x) => x !== l))}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              ))
            )}
          </div>
          {addingLabel ? (
            <div
              data-row
              className="flex h-12 items-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border border-primary/40 bg-primary/5 pl-2 pr-1"
            >
              <Tags className="h-4 w-4 flex-none text-muted-foreground/60" aria-hidden />
              <InlineInput
                value=""
                placeholder="New label…"
                ariaLabel="New label"
                onCommit={(next) => {
                  setAddingLabel(false);
                  addLabel(next);
                }}
                onCancel={() => setAddingLabel(false)}
                className="h-11 min-w-0 flex-1"
              />
            </div>
          ) : (
            <button
              type="button"
              data-row
              className="flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40"
              {...tourAttrs({ skipTour: true, reason: "New-label row inside the builder labels step" })}
              onClick={() => setAddingLabel(true)}
            >
              <Plus className="h-4 w-4 flex-none" aria-hidden />
              New label
            </button>
          )}
        </div>

        {/* ── preview line ────────────────────────────────────────────── */}
        <p className="flex-none rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Create generates{" "}
          <span className="font-bold text-foreground">
            {totalDays} day{totalDays === 1 ? "" : "s"}
          </span>{" "}
          ({phases.length} phase{phases.length === 1 ? "" : "s"} × {totalWeeks} week
          {totalWeeks === 1 ? "" : "s"} × 7) · {DIFFICULTY_LABELS[difficulty].toLowerCase()} ·{" "}
          {daysPerWeek} day{daysPerWeek === 1 ? "" : "s"}/week
          {estMinutes != null ? ` · ~${estMinutes} min` : ""}
          {labels.length > 0 ? ` · ${labels.length} label${labels.length === 1 ? "" : "s"}` : ""}.
        </p>

        <div className="h-2 flex-none" aria-hidden />
      </ScrollBody>
    </Screen>
  );
}
