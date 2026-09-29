"use client";

// Screen slot — #/dev
// Part 3 component showcase (the spec's Storybook substitute): the single
// source of truth SetRow + ExerciseCard across every mode, modality, state and
// viewport. STATIC demo data only (no API) — every interactive action
// console.log's the CardAction so smoke tests can verify wiring.

import { useCallback, useState, type ReactNode } from "react";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { ExerciseCard, toCardSet } from "@/components/exercise-card/exercise-card";
import type { CardAction, CardExercise, CardSet } from "@/components/exercise-card/exercise-card";
import { useApp } from "@/lib/client/store";
import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// This slot IS the screen (no feature re-export); the shared ExerciseCard and
// SetRow components contribute their own exerciseCard.* / setRow.* steps.
const SCREEN = registerScreen({
  id: "dev",
  title: "Dev showcase",
  purpose: "Component showcase: ExerciseCard and SetRow in every mode and state.",
});
void SCREEN;


const ALL_COLS = { setType: true, rpe: true, tempo: true, rest: true };
const SUPERSET_COLOUR = "#14b8a6";

// ---------- demo catalogue ----------

const BENCH: CardExercise = {
  id: "ex-bench",
  name: "Barbell Bench Press",
  categoryLabel: "Chest",
  categoryColour: "#f97316",
  modality: "WEIGHT_REPS",
  unit: "kg",
  weightIncrement: 2.5,
};
const BARBELL_ROW: CardExercise = {
  id: "ex-row",
  name: "Barbell Row",
  categoryLabel: "Back",
  categoryColour: "#10b981",
  modality: "WEIGHT_REPS",
  unit: "kg",
  weightIncrement: 2.5,
};
const SQUAT: CardExercise = {
  id: "ex-squat",
  name: "Back Squat",
  categoryLabel: "Legs",
  categoryColour: "#a855f7",
  modality: "WEIGHT_REPS",
  unit: "kg",
  weightIncrement: 2.5,
};
const DEADLIFT: CardExercise = {
  id: "ex-deadlift",
  name: "Deadlift",
  categoryLabel: "Back",
  categoryColour: "#10b981",
  modality: "WEIGHT_REPS",
  unit: "kg",
  weightIncrement: 5,
};
const INCLINE_DB: CardExercise = {
  id: "ex-incline",
  name: "Incline Dumbbell Press",
  categoryLabel: "Chest",
  categoryColour: "#f97316",
  modality: "WEIGHT_REPS",
  unit: "kg",
  weightIncrement: 2,
};
const RUNNING: CardExercise = {
  id: "ex-running",
  name: "Running Intervals",
  categoryLabel: "Cardio",
  categoryColour: "#ef4444",
  modality: "DISTANCE_TIME",
};
const PLANK: CardExercise = {
  id: "ex-plank",
  name: "Plank",
  categoryLabel: "Abs",
  categoryColour: "#f59e0b",
  modality: "TIME",
};
const CURLS: CardExercise = {
  id: "ex-curls",
  name: "Dumbbell Curls",
  categoryLabel: "Biceps",
  categoryColour: "#84cc16",
  modality: "REPS",
};

const benchSets: CardSet[] = [
  toCardSet({ id: "b1", weight: 60, reps: 5, setType: "WARMUP", rpe: 6, restPlannedSec: 90, isComplete: true }, 1),
  toCardSet({ id: "b2", weight: 100, reps: 5, setType: "NORMAL", rpe: 8, tempo: "3-1-1-0", restPlannedSec: 120, isComplete: true }, 2),
  toCardSet(
    {
      id: "b3",
      weight: 100,
      reps: 5,
      setType: "NORMAL",
      rpe: 9,
      tempo: "3-1-1-0",
      restPlannedSec: 120,
      restActualSec: 113,
      isComplete: true,
      newPr: true,
      comment: "Felt strong — bar speed good",
    },
    3,
  ),
  toCardSet({ id: "b4", weight: 102.5, reps: 3, setType: "FAILURE", rpe: 10, restPlannedSec: 180 }, 4),
  toCardSet({ id: "b5", weight: 90, reps: 6, setType: "DROP", rpe: 9, restPlannedSec: 120 }, 5),
];

const squatSets: CardSet[] = [
  toCardSet({ id: "s1", weight: 80, reps: 5, setType: "WARMUP", rpe: 6, restPlannedSec: 90, restActualSec: 87, isComplete: true }, 1),
  toCardSet({ id: "s2", weight: 140, reps: 5, setType: "NORMAL", rpe: 8, tempo: "2-1-1-0", restPlannedSec: 120, restActualSec: 125, isComplete: true }, 2),
  toCardSet({ id: "s3", weight: 140, reps: 5, setType: "NORMAL", rpe: 9, tempo: "2-1-1-0", restPlannedSec: 120, restActualSec: 118, isComplete: true, newPr: true }, 3),
  toCardSet({ id: "s4", weight: 140, reps: 8, setType: "AMRAP", rpe: 10, restPlannedSec: 180, restActualSec: 190, isComplete: true, comment: "GRINDER" }, 4),
];

const deadliftSets: CardSet[] = [
  { ...toCardSet({ id: "d1", weight: 100, reps: 3, setType: "WARMUP", restPlannedSec: 60 }, 1), selected: true },
  { ...toCardSet({ id: "d2", weight: 180, reps: 3, setType: "WARMUP", restPlannedSec: 90 }, 2), selected: true },
  toCardSet({ id: "d3", weight: 220, reps: 5, setType: "NORMAL", rpe: 8, restPlannedSec: 180, isComplete: true, newPr: true }, 3),
  toCardSet({ id: "d4", weight: 200, reps: 5, setType: "DROP", rpe: 9, restPlannedSec: 120 }, 4),
];

const inclineSets: CardSet[] = [
  toCardSet({ id: "i1", weight: null, reps: null, setType: null }, 1),
  toCardSet({ id: "i2", weight: 30, reps: 10, setType: "NORMAL", rpe: 8, restPlannedSec: 60 }, 2),
  toCardSet({ id: "i3", weight: null, reps: null, setType: null, rpe: null }, 3),
  toCardSet({ id: "i4", weight: 32.5, reps: 8, setType: "NORMAL", tempo: "2-0-1-0", restPlannedSec: 90 }, 4),
];

const runningSets: CardSet[] = [
  toCardSet({ id: "r1", distance: 800, timeSec: 192, setType: "NORMAL", rpe: 7, restPlannedSec: 120, isComplete: true }, 1),
  toCardSet({ id: "r2", distance: 800, timeSec: 196, setType: "NORMAL", rpe: 8, restPlannedSec: 120, isComplete: true }, 2),
  toCardSet({ id: "r3", distance: 800, timeSec: 205, setType: "FAILURE", rpe: 10, restPlannedSec: 180 }, 3),
  toCardSet({ id: "r4", distance: 2000, timeSec: 540, setType: "NORMAL", rpe: 6, restPlannedSec: 300 }, 4),
];

const plankSets: CardSet[] = [
  toCardSet({ id: "p1", timeSec: 45, setType: "NORMAL", rpe: 6, restPlannedSec: 60, isComplete: true }, 1),
  toCardSet({ id: "p2", timeSec: 60, setType: "NORMAL", rpe: 8, tempo: "1-0-1-0", restPlannedSec: 60, isComplete: true, newPr: true }, 2),
  toCardSet({ id: "p3", timeSec: 75, setType: "AMRAP", rpe: 9, restPlannedSec: 90 }, 3),
];

const curlSets: CardSet[] = [
  toCardSet({ id: "c1", reps: 12, setType: "NORMAL", rpe: 7, restPlannedSec: 60, isComplete: true }, 1),
  toCardSet({ id: "c2", reps: 12, setType: "NORMAL", rpe: 8, restPlannedSec: 60, isComplete: true }, 2),
  toCardSet({ id: "c3", reps: 10, setType: "NORMAL", rpe: 9, restPlannedSec: 60 }, 3),
];

const groupBenchSets: CardSet[] = [
  toCardSet({ id: "gb1", weight: 80, reps: 8, setType: "NORMAL", rpe: 8, restPlannedSec: 60, isComplete: true }, 1),
  toCardSet({ id: "gb2", weight: 80, reps: 8, setType: "NORMAL", rpe: 9, restPlannedSec: 60 }, 2),
];

const groupRowSets: CardSet[] = [
  toCardSet({ id: "gr1", weight: 70, reps: 10, setType: "NORMAL", rpe: 8, restPlannedSec: 60, isComplete: true }, 1),
  toCardSet({ id: "gr2", weight: 70, reps: 10, setType: "NORMAL", rpe: 9, restPlannedSec: 60 }, 2),
];

const summaryBench: CardSet[] = benchSets.map((s) => ({ ...s }));
const summaryRun: CardSet[] = runningSets.map((s) => ({ ...s }));
const summaryPlank: CardSet[] = plankSets.map((s) => ({ ...s }));

// ---------- demo harness (logs every action; applies the local mutations) ----------

const BLANK: CardSet = {
  id: "",
  index: 0,
  setType: null,
  weightKg: null,
  reps: null,
  distanceM: null,
  timeSec: null,
  rpe: null,
  tempo: null,
  restPlannedSec: null,
  restActualSec: null,
  done: false,
  selected: false,
  isNewPr: false,
  note: null,
};

function useDemoCard(label: string, initial: CardSet[], initialCollapsed = false) {
  const [sets, setSets] = useState<CardSet[]>(initial);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const onAction = useCallback(
    (action: CardAction) => {
      // smoke-test hook: every interactive action logs the CardAction
      console.log(`[dev-showcase:${label}]`, action);
      switch (action.type) {
        case "toggle-collapse":
          setCollapsed((c) => !c);
          break;
        case "add-set":
          setSets((prev) => [
            ...prev,
            { ...BLANK, id: `${label}-new-${prev.length + 1}-${Date.now()}`, index: prev.length + 1 },
          ]);
          break;
        case "update-set":
          setSets((prev) => prev.map((s) => (s.id === action.setId ? ({ ...s, ...action.patch } as CardSet) : s)));
          break;
        case "toggle-done":
          setSets((prev) => prev.map((s) => (s.id === action.setId ? { ...s, done: !s.done } : s)));
          break;
        case "toggle-select":
          setSets((prev) => prev.map((s) => (s.id === action.setId ? { ...s, selected: !s.selected } : s)));
          break;
        case "copy-last":
          setSets((prev) =>
            prev.map((s) => {
              if (s.id !== action.setId) return s;
              const before = prev.slice(0, Math.max(0, s.index - 1));
              const src =
                [...before].reverse().find((p) => p.weightKg != null || p.reps != null || p.distanceM != null || p.timeSec != null) ??
                prev[prev.length - 1];
              if (!src) return s;
              return {
                ...s,
                weightKg: src.weightKg,
                reps: src.reps,
                distanceM: src.distanceM,
                timeSec: src.timeSec,
                rpe: src.rpe,
                tempo: src.tempo,
                restPlannedSec: src.restPlannedSec,
              };
            }),
          );
          break;
        default:
          // notes / rest-timer / move-up / move-down / add-to-group / replace /
          // remove / select / open — logged only (no showcase-side effect)
          break;
      }
    },
    [label],
  );

  return { sets, collapsed, onAction };
}

// ---------- screen ----------

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex h-8 flex-none items-center px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

export default function DevShowcaseScreen() {
  const navigate = useApp((s) => s.navigate);

  const bench = useDemoCard("edit-bench", benchSets);
  const squat = useDemoCard("read-squat", squatSets, true);
  const deadlift = useDemoCard("preview-deadlift", deadliftSets);
  const incline = useDemoCard("template-incline", inclineSets);
  const run = useDemoCard("modality-run", runningSets);
  const plank = useDemoCard("modality-plank", plankSets);
  const curls = useDemoCard("modality-curls", curlSets);
  const groupBench = useDemoCard("group-bench", groupBenchSets);
  const groupRow = useDemoCard("group-row", groupRowSets);

  const summaryAction = useCallback((action: CardAction) => {
    console.log("[dev-showcase:summary]", action);
  }, []);

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
              tour={{ id: "dev.back", label: "Back", help: "Return to the Today screen.", order: 10 }}
              onClick={() => navigate("/today")}
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title="Dev — Components"
          actions={<TopBarHelp />}
        />
      }
    >
      <ScrollBody>
        <SectionTitle>Edit mode — weighted · all set types · PR · note</SectionTitle>
        <ExerciseCard
          mode="edit"
          exercise={BENCH}
          sets={bench.sets}
          collapsed={bench.collapsed}
          visibleColumns={ALL_COLS}
          onAction={bench.onAction}
        />

        <SectionTitle>Read mode — collapsed default (tap chevron)</SectionTitle>
        <ExerciseCard
          mode="read"
          exercise={SQUAT}
          sets={squat.sets}
          collapsed={squat.collapsed}
          visibleColumns={ALL_COLS}
          onAction={squat.onAction}
        />

        <SectionTitle>Preview mode — copy / log-day (select sets)</SectionTitle>
        <ExerciseCard
          mode="preview"
          exercise={DEADLIFT}
          sets={deadlift.sets}
          collapsed={deadlift.collapsed}
          visibleColumns={ALL_COLS}
          onAction={deadlift.onAction}
        />

        <SectionTitle>Template mode — routine editor (blank = ↺ copy-last)</SectionTitle>
        <ExerciseCard
          mode="template"
          exercise={INCLINE_DB}
          sets={incline.sets}
          collapsed={incline.collapsed}
          visibleColumns={ALL_COLS}
          onAction={incline.onAction}
        />

        <SectionTitle>Grouped — superset (group colour + chip)</SectionTitle>
        <ExerciseCard
          mode="edit"
          exercise={BENCH}
          sets={groupBench.sets}
          collapsed={groupBench.collapsed}
          visibleColumns={ALL_COLS}
          groupColour={SUPERSET_COLOUR}
          groupName="Superset"
          onAction={groupBench.onAction}
        />
        <ExerciseCard
          mode="edit"
          exercise={BARBELL_ROW}
          sets={groupRow.sets}
          collapsed={groupRow.collapsed}
          visibleColumns={ALL_COLS}
          groupColour={SUPERSET_COLOUR}
          groupName="Superset"
          onAction={groupRow.onAction}
        />

        <SectionTitle>Modalities — distance/time · time-only · reps-only</SectionTitle>
        <ExerciseCard
          mode="edit"
          exercise={RUNNING}
          sets={run.sets}
          collapsed={run.collapsed}
          visibleColumns={ALL_COLS}
          onAction={run.onAction}
        />
        <ExerciseCard
          mode="edit"
          exercise={PLANK}
          sets={plank.sets}
          collapsed={plank.collapsed}
          visibleColumns={ALL_COLS}
          onAction={plank.onAction}
        />
        <ExerciseCard
          mode="read"
          exercise={CURLS}
          sets={curls.sets}
          visibleColumns={ALL_COLS}
          onAction={curls.onAction}
        />

        <SectionTitle>Summary mode — dense lists (desktop grid)</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-3">
          <ExerciseCard mode="summary" exercise={BENCH} sets={summaryBench} onAction={summaryAction} />
          <ExerciseCard mode="summary" exercise={RUNNING} sets={summaryRun} onAction={summaryAction} />
          <ExerciseCard mode="summary" exercise={PLANK} sets={summaryPlank} onAction={summaryAction} />
        </div>
      </ScrollBody>
    </Screen>
  );
}
