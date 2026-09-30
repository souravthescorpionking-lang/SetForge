"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ExerciseEditor — the §4.5 per-exercise editor block, rendered INSIDE the
// build screen's GroupCards through the `entry.editor` slot (L2: one GroupCard,
// one SetRow — this block composes them, never forks them).
//
//   Row 40  "Tempo"        · chip "x-x-x-x" | "None" → ActionList presets
//                           (draft: presets only — no reId exists for the
//                           #/tempo/{reId} route, which persists via the
//                           existing sets PATCH; documented decision. Persisted:
//                           presets + "Custom…" → the §4.6 route.)
//   Row 40  "Trainer tip"  · "Add" | first 24 chars → INLINE expanding textarea
//                           (L3: inline expand is allowed; not a sheet/route).
//   Row 40  "Rest"         · segmented "Same for all | Per set" · value chip
//                           (Same for all → one popover patches every set;
//                           Per set → each SetRow's rest cell edits its own)
//                           · "None" pill toggles restNone (RoutineExercise).
//   Set table  header 32 "Set | Type | {fields} | Rest" (the SetRow grid spec)
//              rows 40 = SetRow mode="template" (weight track dropped — weight
//              is logged, not prescribed §4.5; AMRAP via the type cell)
//              Row 40 "+ Add set" duplicates the last set.
//
// Mutations route through the `controller` prop: the DRAFT controller writes
// the Zustand draft store (§4.2 — nothing persists until Save); the EDIT
// controller calls the existing routines APIs the sets editor uses.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionList } from "@/components/shared/action-list";
import { SetRow, setRowGridSpec } from "@/components/set-row/set-row";
import { useViewportWidth } from "@/components/set-row/viewport";
import { toCardSet, type CardAction, type CardExercise, type CardSet, type CardVisibleColumns } from "@/components/group-card";
import { tourAttrs } from "@/lib/tour/attrs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Lightbulb,
  Loader2,
  Plus,
  Timer,
  TimerOff,
} from "lucide-react";
import { useApp } from "@/lib/client/store";
import { formatRestSec, fieldsForType, TEMPO_PRESETS, type SetField } from "@/lib/constants";
import { parseDurationInput } from "@/components/group-card/group-types";
import { useLastSetsPrefill } from "@/features/routines/screen-helpers";

// ---------- view + controller contracts ----------

export type EditorSetView = {
  id: string;
  reps: number | null;
  setType: string | null;
  restPlannedSec: number | null;
  tempo: string | null;
};

export type EditorExerciseView = {
  /** reId (persisted mode) or the draft exercise's client id. */
  id: string;
  name: string;
  /** ExerciseType — drives the SetRow field tracks. */
  modality: string;
  unit: string | null;
  /** Category display label + colour (the GroupCard 4px bar on singletons). */
  categoryLabel: string;
  categoryColour: string;
  /** Shared series group (null = own singleton group) — deriveGroups input. */
  groupId: string | null;
  /** Flat position within the workout (deriveGroups input). */
  sortOrder?: number;
  tip: string | null;
  restNone: boolean;
  sets: EditorSetView[];
};

export type ExerciseEditorController = {
  /** draft=true → mutations stay client-side until Save (§4.2). */
  draft: boolean;
  patchSet: (setId: string, patch: Partial<EditorSetView>) => void;
  addSet: () => void;
  removeSet: (setId: string) => void;
  patchExercise: (patch: { tip?: string | null; restNone?: boolean }) => void | Promise<void>;
  setTempoAll: (tempo: string | null) => void;
  setRestAll: (sec: number | null) => void;
};

// ---------- constants ----------

const REST_PRESETS = [30, 60, 90, 120, 150, 180];

const TABLE_COLUMNS: CardVisibleColumns = { setType: true, rpe: false, tempo: false, rest: true };

const headerLabel = (field: SetField): string => {
  switch (field) {
    case "reps":
      return "Reps";
    case "distance":
      return "Dist";
    case "timeSec":
      return "Time";
    case "weight":
      return "Weight";
  }
};

// ---------- the editor ----------

export function ExerciseEditor({
  view,
  controller,
  /** Persisted context (null in draft mode) — the §4.6 tempo route target. */
  routineId,
  dayId,
  /** §4.8: set ids whose reps are missing (number ≥1 or AMRAP). */
  invalidSetIds,
  /** §4.7 "Edit sets": scroll + focus target anchor. */
  bodyRef,
}: {
  view: EditorExerciseView;
  controller: ExerciseEditorController;
  routineId: string | null;
  dayId: string | null;
  invalidSetIds: ReadonlySet<string>;
  bodyRef: React.RefObject<HTMLDivElement | null>;
}) {
  const navigate = useApp((s) => s.navigate);
  const vw = useViewportWidth();
  const reducedMotion = useReducedMotion();
  const prefillFor = useLastSetsPrefill();

  const [restMode, setRestMode] = useState<"all" | "per">("all");
  const [tipOpen, setTipOpen] = useState(false);
  const [tipDraft, setTipDraft] = useState<string | null>(null);
  const [tipBusy, setTipBusy] = useState(false);
  const [shakeId, setShakeId] = useState<string | null>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // §4.5 builder table: weight is logged, not prescribed — drop its track.
  const fields = useMemo(
    () => fieldsForType(view.modality).filter((f) => f !== "weight"),
    [view.modality],
  );
  const cardExercise: CardExercise = useMemo(
    () => ({
      id: view.id,
      name: view.name,
      categoryLabel: view.categoryLabel,
      categoryColour: view.categoryColour,
      modality: view.modality,
      unit: view.unit,
    }),
    [view.id, view.name, view.categoryLabel, view.categoryColour, view.modality, view.unit],
  );

  const cardSets: CardSet[] = view.sets.map((s, i) => toCardSet(s, i + 1));

  // ---- set mutations (routed through the controller) ----
  const patchFromCard = (setId: string, patch: Partial<CardSet>) => {
    const next: Partial<EditorSetView> = {};
    if ("reps" in patch) next.reps = patch.reps ?? null;
    if ("setType" in patch) next.setType = patch.setType ?? null;
    if ("restPlannedSec" in patch) next.restPlannedSec = patch.restPlannedSec ?? null;
    if ("tempo" in patch) next.tempo = patch.tempo ?? null;
    if (Object.keys(next).length > 0) controller.patchSet(setId, next);
  };

  /** §4.8: each exercise needs ≥1 set — the delete is BLOCKED with a shake. */
  const removeSet = (setId: string) => {
    if (view.sets.length <= 1) {
      if (!reducedMotion) {
        setShakeId(setId);
        if (shakeTimer.current) clearTimeout(shakeTimer.current);
        shakeTimer.current = setTimeout(() => setShakeId(null), 450);
      }
      return;
    }
    controller.removeSet(setId);
  };

  const copyLastToSet = async (setId: string, index0: number) => {
    const src = await prefillFor(cardExercise.id, index0).catch(() => null);
    if (!src) {
      toast.info("No previous workout to copy from");
      return;
    }
    controller.patchSet(setId, { reps: src.reps });
  };

  const handleCardAction = (action: CardAction): void => {
    switch (action.type) {
      case "update-set":
        patchFromCard(action.setId, action.patch);
        break;
      case "remove-set":
        removeSet(action.setId);
        break;
      case "copy-last":
        void copyLastToSet(action.setId, cardSets.findIndex((s) => s.id === action.setId));
        break;
      default:
        break; // the template table emits only the three actions above
    }
  };

  // ---- tempo chip (ActionList of §4.6 presets) ----
  const currentTempo = view.sets.find((s) => s.tempo?.trim())?.tempo ?? null;
  const tempoItems = [
    ...TEMPO_PRESETS.map((preset) => ({
      id: `t:${preset}`,
      label: preset,
      checked: currentTempo === preset,
      onSelect: () => controller.setTempoAll(preset),
    })),
    {
      id: "t:none",
      label: "None",
      checked: currentTempo == null,
      onSelect: () => controller.setTempoAll(null),
    },
    // §4.6 route for the full picker (custom 4-field tempo). Drafts carry
    // only their client id — the tempo screen resolves them in draft-store.
    {
      id: "t:custom",
      label: "Custom…",
      onSelect: () => {
        const params = new URLSearchParams({
          return: `/builder/session/${routineId ?? "new"}`,
        });
        if (routineId && dayId) {
          params.set("routineId", routineId);
          params.set("dayId", dayId);
        }
        navigate(`/tempo/${view.id}?${params.toString()}`);
      },
    },
  ];

  // ---- rest value chip (Same for all → patch every set) ----
  const restAll = view.sets[0]?.restPlannedSec ?? null;
  const restPerSet = view.sets.length > 1 && view.sets.some((s) => s.restPlannedSec !== restAll);

  // ---- trainer tip ----
  const tipSummary = view.tip?.trim() ? view.tip.trim().slice(0, 24) : "Add";
  const saveTip = async () => {
    if (tipDraft == null) return;
    setTipBusy(true);
    await controller.patchExercise({ tip: tipDraft.trim() || null });
    setTipBusy(false);
    setTipDraft(null);
    toast.success("Tip saved");
  };

  // ---- set table header (the SetRow grid spec — one grid engine) ----
  const grid = setRowGridSpec(fields, TABLE_COLUMNS, "template", vw, true);

  return (
    <div ref={bodyRef} className="flex flex-col">
      {/* ---------- Tempo row 40 ---------- */}
      <div
        data-row
        role="group"
        aria-label={`Tempo for ${view.name}`}
        className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap px-3"
      >
        <span className="w-16 flex-none text-xs font-semibold text-muted-foreground">Tempo</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground/60">ecc · pause · con · pause</span>
        <ActionList
          label={`Tempo for ${view.name}`}
          align="end"
          items={tempoItems}
          trigger={
            <button
              type="button"
              {...tourAttrs({ id: "builderExercise.tempo", label: "Tempo", help: "Pick an eccentric-pause-concentric-pause tempo for every set.", order: 200 })}
              aria-label={currentTempo ? `Tempo ${currentTempo}, tap to change` : "Tempo not set, tap to pick"}
              className="flex h-8 flex-none items-center rounded-full border border-border bg-card px-3 text-xs font-bold tabular-nums transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              {currentTempo ?? "None"}
            </button>
          }
        />
      </div>

      {/* ---------- Trainer tip row 40 + inline expand ---------- */}
      <div
        data-row
        role="group"
        aria-label={`Trainer tip for ${view.name}`}
        className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap px-3"
      >
        <Lightbulb
          className={cn("h-4 w-4 flex-none", view.tip?.trim() ? "text-amber-500" : "text-muted-foreground")}
          aria-hidden
        />
        <span className="w-16 flex-none text-xs font-semibold text-muted-foreground">Trainer tip</span>
        <button
          type="button"
          {...tourAttrs({ id: "builderExercise.tip", label: "Trainer tip", help: "Author the 💡 coaching cue shown with this exercise.", order: 210 })}
          aria-expanded={tipOpen}
          className="flex h-8 min-w-0 flex-1 items-center justify-end gap-1 truncate rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          onClick={() => {
            setTipDraft(view.tip ?? "");
            setTipOpen((o) => !o);
          }}
        >
          <span className="truncate">{tipSummary}</span>
        </button>
      </div>
      {tipOpen ? (
        <div className="flex flex-col gap-2 px-3 pb-2">
          <Textarea
            value={tipDraft ?? ""}
            maxLength={600}
            aria-label="Trainer tip"
            {...tourAttrs({ skipTour: true, reason: "Tip textarea covered by the builderExercise.tip anchor" })}
            onChange={(e) => setTipDraft(e.target.value)}
            placeholder="Coaching cue — e.g. “Elbows at 45°, bar to mid-chest.”"
            className="min-h-20 w-full resize-none text-sm leading-relaxed"
          />
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              Shown as 💡 on the day.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              tour={{ skipTour: true, reason: "Save-tip button inside the inline tip editor" }}
              className="h-9 flex-none rounded-lg text-xs font-bold"
              disabled={tipBusy || (tipDraft ?? "").trim() === (view.tip ?? "")}
              onClick={() => void saveTip()}
            >
              {tipBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save tip
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---------- Rest row 40 ---------- */}
      <div
        data-row
        role="group"
        aria-label={`Rest for ${view.name}`}
        className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap px-3"
      >
        <Timer
          className={cn("h-4 w-4 flex-none", view.restNone ? "text-primary" : "text-muted-foreground")}
          aria-hidden
        />
        <span className="w-11 flex-none text-xs font-semibold text-muted-foreground">Rest</span>
        <div className="flex h-8 min-w-0 flex-1 items-center gap-1" role="radiogroup" aria-label="Rest mode">
          <Button
            type="button"
            variant={restMode === "all" ? "default" : "outline"}
            size="sm"
            tour={{ id: "builderExercise.restAll", label: "Same for all", help: "One rest value applies to every set of this exercise.", order: 220 }}
            className="h-8 min-w-0 flex-1 rounded-lg px-1 text-[11px] font-bold"
            onClick={() => setRestMode("all")}
          >
            <span className="truncate">Same for all</span>
          </Button>
          <Button
            type="button"
            variant={restMode === "per" ? "default" : "outline"}
            size="sm"
            tour={{ id: "builderExercise.restPer", label: "Per set", help: "Each set row gets its own rest value.", order: 230 }}
            className="h-8 min-w-0 flex-1 rounded-lg px-1 text-[11px] font-bold"
            onClick={() => setRestMode("per")}
          >
            <span className="truncate">Per set</span>
          </Button>
        </div>
        {restMode === "all" ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                {...tourAttrs({ id: "builderExercise.restValue", label: "Rest value", help: "The shared rest between sets; tap to change.", order: 240 })}
                aria-label={restAll != null ? `Rest ${formatRestSec(restAll)}, tap to change` : "Rest not set, tap to set"}
                className="flex h-8 flex-none items-center rounded-full border border-border bg-card px-3 text-xs font-bold tabular-nums transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                {restAll != null ? `${restAll} s` : "–"}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-3">
              <p className="pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Rest · every set
              </p>
              <div className="grid grid-cols-3 gap-1">
                {REST_PRESETS.map((sec) => (
                  <Button
                    key={sec}
                    type="button"
                    variant={restAll === sec ? "default" : "outline"}
                    size="sm"
                    tour={{ skipTour: true, reason: "Rest presets inside the rest popover" }}
                    className="h-8 rounded-lg px-0 text-xs font-bold tabular-nums"
                    onClick={() => controller.setRestAll(sec)}
                  >
                    {formatRestSec(sec)}
                  </Button>
                ))}
              </div>
              <RestCustomInput onCommit={(sec) => controller.setRestAll(sec)} />
              {restAll != null ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  tour={{ skipTour: true, reason: "Clear control inside the rest popover" }}
                  className="mt-2 w-full text-xs text-muted-foreground"
                  onClick={() => controller.setRestAll(null)}
                >
                  Clear rest
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
        ) : (
          <span
            {...tourAttrs({ id: "builderExercise.restMixed", label: "Per-set rest", help: "Each set's rest is edited on its own row below.", order: 240, hint: true })}
            className="flex h-8 flex-none items-center rounded-full border border-border bg-card px-3 text-xs font-bold tabular-nums"
          >
            {restPerSet ? "per set" : restAll != null ? `${restAll} s` : "–"}
          </span>
        )}
        <button
          type="button"
          {...tourAttrs({ id: "builderExercise.restNone", label: "Rest: none", help: "Skip the rest timer for this exercise entirely.", order: 250 })}
          role="switch"
          aria-checked={view.restNone}
          aria-label="Rest: none for this exercise"
          onClick={() => controller.patchExercise({ restNone: !view.restNone })}
          className={cn(
            "flex h-8 flex-none items-center gap-1 rounded-full border px-2.5 text-[11px] font-bold transition-colors",
            view.restNone
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground",
          )}
        >
          <TimerOff className="h-3.5 w-3.5" aria-hidden />
          None
        </button>
      </div>

      {/* ---------- set table: header 32 + SetRow template rows 40 ---------- */}
      <div
        data-row
        role="group"
        aria-label={`Set table for ${view.name}`}
        className="mt-1 grid h-8 items-center overflow-hidden whitespace-nowrap px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
        style={{ gridTemplateColumns: grid.template }}
      >
        {grid.keys.map((key) => (
          <div key={key} className="flex h-full min-w-0 items-center justify-center overflow-hidden">
            {key === "index"
              ? "Set"
              : key === "setType"
                ? "Type"
                : key === "f1"
                  ? headerLabel(fields[0])
                  : key === "f2"
                    ? headerLabel(fields[1] ?? "reps")
                    : key === "rest"
                      ? "Rest"
                      : ""}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {cardSets.map((s) => {
          const invalid = invalidSetIds.has(s.id);
          return (
            <motion.div
              key={s.id}
              animate={shakeId === s.id && !reducedMotion ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
              transition={{ duration: 0.4 }}
              style={invalid ? { boxShadow: "inset 4px 0 0 0 var(--destructive)" } : undefined}
              className="rounded-lg"
            >
              <SetRow
                mode="template"
                exercise={cardExercise}
                set={s}
                visibleColumns={TABLE_COLUMNS}
                fieldsOverride={fields}
                onAction={handleCardAction}
              />
            </motion.div>
          );
        })}
      </div>

      {/* ---------- + Add set (duplicates the last) ---------- */}
      <button
        type="button"
        data-row
        {...tourAttrs({ id: "builderExercise.addSet", label: "Add set", help: "Append another set that copies the last one.", order: 260 })}
        aria-label={`Add a set to ${view.name}`}
        onClick={() => controller.addSet()}
        className="mt-1 flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
      >
        <Plus className="h-4 w-4 flex-none" aria-hidden />
        <span className="truncate">Add set</span>
      </button>

      {/* §4.8 helper — rendered by the parent when a delete was blocked; the
          shake itself lives above. Kept here as aria-live status for a11y. */}
      <p className="sr-only" aria-live="polite">
        {shakeId ? "Each exercise needs at least one set." : ""}
      </p>
      <p className="sr-only" aria-live="polite">
        {invalidSetIds.size > 0 ? "Reps required — enter a number or make the set AMRAP." : ""}
      </p>
    </div>
  );
}

// ---------- custom rest input (m:ss or seconds) ----------

function RestCustomInput({ onCommit }: { onCommit: (sec: number | null) => void }) {
  const [custom, setCustom] = useState("");
  const apply = () => {
    const sec = parseDurationInput(custom);
    if (sec == null) {
      toast.info("Enter rest as seconds or m:ss");
      return;
    }
    onCommit(sec);
    setCustom("");
  };
  return (
    <div className="mt-2 flex items-center gap-1">
      <Input
        value={custom}
        aria-label="Custom rest duration"
        {...tourAttrs({ skipTour: true, reason: "Custom rest field inside the rest popover" })}
        onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply()}
        placeholder="m:ss"
        className="h-8 min-w-0 flex-1"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        tour={{ skipTour: true, reason: "Apply inside the rest popover" }}
        className="h-8 rounded-lg text-xs font-bold"
        onClick={apply}
      >
        Set
      </Button>
    </div>
  );
}

