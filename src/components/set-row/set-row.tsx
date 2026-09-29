"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SetRow — THE single source of truth set row (Part 3 §SET ROW).
//
// One 40px CSS-grid row for every mode (edit / read / preview / template).
// The grid template is COMPUTED, never styled ad hoc:
//   • spec track widths:  #24 · type32 · f1:72 · f2:56 · rpe:52 · tempo:64 ·
//                          rest:56 · done:40 · more:32
//   • missing modality fields or settings-hidden columns REMOVE tracks from
//     the template (they are never "hidden" cells).
//   • <468px viewport: rpe + tempo tracks are REMOVED — their values/editors
//     move into the `more` ⋯ popover. (PLATFORM ADAPTATION: the spec's bottom
//     sheet is forbidden here; an anchored popover — shadcn Popover on
//     Floating UI with collision flip — is the allowed replacement.)
//   • <360px viewport: f1/f2 drop their floors to spec−16 (minmax) so the row
//     still fits a 320px screen. All small tracks stay exact px.
//   • f1/f2 carry `minmax(spec, 1fr)` so value columns fill leftover card width
//     at every viewport — the row can never overflow its card and never leaves
//     a dead right margin.
//
// Grid math (weight+reps modality, all columns on):
//   wide fixed tracks 24+32+72+56+52+64+56+40+32 = 428px
//   mobile (<468, rpe+tempo dropped)             = 312px ≤ 328px (360−32 law)
//   320px viewport floors 24+32+56+40+56+40+32   = 280px ≤ 282px available
//   (The spec contract names 460 as the wide threshold; the corrected value is
//   468 — 428px of tracks + 32px page gutters + 6px card chrome (border×2 +
//   4px colour bar) need ≥466px, so the wide layout only engages at 468.)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, ChevronDown, Copy, Minus, MoreHorizontal, Plus, RotateCcw, StickyNote, Timer, Trash2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { rowGrid } from "@/lib/ui/tokens";
import { tourAttrs } from "@/lib/tour/attrs";
import { hapticTap } from "@/lib/client/haptics";
import {
  fieldsForType,
  formatRestSec,
  normaliseTempo,
  SET_TYPES,
  SET_TYPE_META,
  type SetField,
  type SetType,
} from "@/lib/constants";
import { useViewportWidth } from "./viewport";
import {
  FIELD_LABEL,
  FIELD_TO_KEY,
  formatFieldValue,
  formatRpe,
  parseDurationInput,
  parseFieldValue,
  stepForField,
  trimNum,
  type ApplyToAllFields,
  type CardAction,
  type CardExercise,
  type CardMode,
  type CardSet,
  type CardVisibleColumns,
} from "../exercise-card/card-types";

// ---------- grid engine ----------

/** Spec track widths in px — the single source of truth for the row grid. */
const TRACK = { index: 24, setType: 32, f1: 72, f2: 56, rpe: 52, tempo: 64, rest: 56, done: 40, more: 32 } as const;

/** Viewport at which rpe/tempo tracks return to the grid (see file header). */
const WIDE_VIEWPORT = 468;

/** Tap→cycle order for the set-type chip. */
const TYPE_CYCLE: SetType[] = ["NORMAL", "WARMUP", "DROP", "FAILURE", "AMRAP"];

/** Rest presets (sec) — spec list. */
const REST_PRESETS = [30, 60, 90, 120, 150, 180];

/** RPE chip scale: 1–10 in half steps (spec). */
const RPE_CHIPS: number[] = [];
for (let v = 1; v <= 10; v += 0.5) RPE_CHIPS.push(v);

type TrackKey = "index" | "setType" | "f1" | "f2" | "rpe" | "tempo" | "rest" | "done" | "more";

type GridSpec = { keys: TrackKey[]; template: string };

function buildGrid(
  fields: SetField[],
  visible: CardVisibleColumns,
  mode: CardMode,
  vw: number,
  moreTrack: boolean,
): GridSpec {
  const keys: TrackKey[] = [];
  const parts: string[] = [];
  const push = (key: TrackKey, css: string) => {
    keys.push(key);
    parts.push(css);
  };

  push("index", `${TRACK.index}px`);
  if (visible.setType) push("setType", `${TRACK.setType}px`);

  // Value tracks: spec floor (−16 below 360px — documented adaptation so the
  // fixed small tracks still fit a 320px screen) + 1fr growth to fill the card.
  const narrow = vw < 360;
  if (fields[0]) push("f1", `minmax(${TRACK.f1 - (narrow ? 16 : 0)}px, 1fr)`);
  if (fields[1]) push("f2", `minmax(${TRACK.f2 - (narrow ? 16 : 0)}px, 1fr)`);

  if (visible.rpe && vw >= WIDE_VIEWPORT) push("rpe", `${TRACK.rpe}px`);
  if (visible.tempo && vw >= WIDE_VIEWPORT) push("tempo", `${TRACK.tempo}px`);
  if (visible.rest) push("rest", `${TRACK.rest}px`);

  // `done` never applies to routine templates → track removed.
  if (mode !== "template") push("done", `${TRACK.done}px`);
  if (mode === "edit" || mode === "template") push("more", `${TRACK.more}px`);
  else if (moreTrack) push("more", `${TRACK.more}px`);

  return { keys, template: parts.join(" ") };
}

/** Row state tint — background/border only, never size. Precedence documented. */
function rowTint(set: CardSet): string {
  if (set.selected) return "bg-primary/10";
  if (set.setType === "FAILURE") return "bg-red-500/10 ring-1 ring-inset ring-red-500/25";
  if (set.setType === "DROP") return "bg-violet-500/10";
  if (set.done) return "bg-emerald-500/10";
  return "";
}

/** Shared cell shell: a grid item that can shrink (min-w-0) and never wraps. */
const CELL = "flex h-full min-w-0 items-center overflow-hidden";

const cellButtonBase =
  "flex h-8 w-full items-center justify-center rounded-md px-1 text-xs font-semibold tabular-nums transition-colors hover:bg-accent";

// ---------- popover editors (shared by grid cells + the more ⋯ popover) ----------

function RpeEditor({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <p className="pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        RPE <span className="font-medium normal-case">(1 = easy · 10 = max)</span>
      </p>
      <div className="grid grid-cols-4 gap-1">
        {RPE_CHIPS.map((r) => (
          <Button
            key={r}
            type="button"
            variant={value === r ? "default" : "outline"}
            size="sm"
            tour={{ skipTour: true, reason: "RPE value chips inside the RPE popover" }}
            className="h-8 rounded-lg px-0 text-xs font-bold tabular-nums"
            onClick={() => onChange(value === r ? null : r)}
          >
            {formatRpe(r)}
          </Button>
        ))}
      </div>
      {value != null ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          tour={{ skipTour: true, reason: "Clear control inside the RPE popover" }}
          className="mt-2 w-full text-xs text-muted-foreground"
          onClick={() => onChange(null)}
        >
          Clear RPE
        </Button>
      ) : null}
    </div>
  );
}

function TempoEditor({
  value,
  onChange,
  presets,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  /** §4.10e tempo presets from settings ("2-0-2-0"…) — optional chip row above the segments. */
  presets?: string[];
}) {
  const initial = (value ?? "").split("-");
  const [parts, setParts] = useState<[string, string, string, string]>([
    initial[0] ?? "",
    initial[1] ?? "",
    initial[2] ?? "",
    initial[3] ?? "",
  ]);
  const labels = ["Ecc", "Pause", "Con", "Pause"];
  const fillPreset = (preset: string) => {
    hapticTap();
    const seg = preset.split("-");
    setParts([seg[0] ?? "", seg[1] ?? "", seg[2] ?? "", seg[3] ?? ""]);
  };
  return (
    <div>
      <p className="pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Tempo <span className="font-medium normal-case">(sec: ecc-pause-con-pause)</span>
      </p>
      {presets && presets.length > 0 ? (
        <div
          data-chip-scroller
          role="group"
          aria-label="Tempo presets"
          className="no-scrollbar mb-2 flex h-10 items-center gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap"
        >
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              {...tourAttrs({ skipTour: true, reason: "Tempo presets inside the tempo popover" })}
              aria-label={`Use tempo preset ${p}`}
              className={cn(
                "flex h-8 flex-none items-center rounded-full border px-3 text-xs font-bold tabular-nums transition-colors",
                p === value
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              onClick={() => fillPreset(p)}
            >
              {p}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-1">
        {parts.map((p, i) => (
          <div key={i} className="min-w-0 flex-1">
            <span className="mb-1 block text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {labels[i]}
            </span>
            <input
              aria-label={`Tempo ${labels[i]} seconds`}
              {...tourAttrs({ skipTour: true, reason: "Tempo segment inputs inside the popover" })}
              inputMode="numeric"
              value={p}
              onChange={(e) => {
                const next = [...parts] as [string, string, string, string];
                next[i] = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
                setParts(next);
              }}
              placeholder="0"
              className="h-9 w-full rounded-md border border-input bg-background text-center text-sm font-semibold tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          size="sm"
          tour={{ skipTour: true, reason: "Save control inside the tempo popover" }}
          className="h-8 flex-1 rounded-lg text-xs font-bold"
          onClick={() => {
            const joined = parts.map((p) => p || "0").join("-");
            const norm = normaliseTempo(joined);
            if (norm) onChange(norm);
          }}
        >
          Save
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            tour={{ skipTour: true, reason: "Clear control inside the tempo popover" }}
            className="h-8 rounded-lg text-xs text-muted-foreground"
            onClick={() => onChange(null)}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function RestEditor({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [custom, setCustom] = useState("");
  const applyCustom = () => {
    const sec = parseDurationInput(custom);
    if (sec != null && sec > 0) onChange(sec);
  };
  return (
    <div>
      <p className="pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Rest</p>
      <div className="grid grid-cols-3 gap-1">
        {REST_PRESETS.map((sec) => (
          <Button
            key={sec}
            type="button"
            variant={value === sec ? "default" : "outline"}
            size="sm"
            tour={{ skipTour: true, reason: "Rest presets inside the rest popover" }}
            className="h-8 rounded-lg px-0 text-xs font-bold tabular-nums"
            onClick={() => onChange(sec)}
          >
            {formatRestSec(sec)}
          </Button>
        ))}
      </div>
      <div className="mt-2 flex gap-1">
        <input
          aria-label="Custom rest duration"
          {...tourAttrs({ skipTour: true, reason: "Custom rest field inside the rest popover" })}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyCustom();
          }}
          placeholder="m:ss"
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          tour={{ skipTour: true, reason: "Apply control inside the rest popover" }}
          className="h-8 rounded-lg text-xs font-bold"
          onClick={applyCustom}
        >
          Set
        </Button>
      </div>
      {value != null ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          tour={{ skipTour: true, reason: "Clear control inside the rest popover" }}
          className="mt-2 w-full text-xs text-muted-foreground"
          onClick={() => onChange(null)}
        >
          Clear rest
        </Button>
      ) : null}
    </div>
  );
}

// ---------- cells ----------

function IndexCell({ set, mode, onAction }: { set: CardSet; mode: CardMode; onAction?: (a: CardAction) => void }) {
  if (mode === "preview" && onAction) {
    return (
      <Checkbox
        checked={!!set.selected}
        {...tourAttrs({ skipTour: true, reason: "Preview-mode selection; the index cell is anchored" })}
        onCheckedChange={() => onAction({ type: "toggle-select", setId: set.id })}
        className="h-4 w-4"
        aria-label={`Select set ${set.index}`}
      />
    );
  }
  return (
    <span
      {...tourAttrs({ id: "setRow.index", label: "Set number", help: "This set's position in the exercise.", order: 100 })}
      className="w-full truncate text-center text-xs tabular-nums text-muted-foreground"
      title={`Set ${set.index}`}
    >
      {set.index}
    </span>
  );
}

function TypeCell({
  set,
  mode,
  editable,
  onAction,
}: {
  set: CardSet;
  mode: CardMode;
  editable: boolean;
  onAction?: (a: CardAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  const endHold = () => {
    if (holdRef.current) clearTimeout(holdRef.current);
    holdRef.current = null;
    startRef.current = null;
  };

  useEffect(() => () => endHold(), []);

  const value = set.setType ?? null;
  const meta = value ? SET_TYPE_META[value as SetType] : null;
  const templateBlank = mode === "template" && value == null;

  // read / preview / read-only fallback → static glyph
  if (!editable || !onAction) {
    if (meta) {
      return (
        <span
          className={cn("flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold", meta.className)}
          title={`${meta.label} — ${meta.description}`}
        >
          {meta.letter}
        </span>
      );
    }
    return (
      <span className="text-xs text-muted-foreground/40" title="Set type not set">
        –
      </span>
    );
  }

  const cycle = () => {
    const current = (value ?? "NORMAL") as SetType;
    const next = TYPE_CYCLE[(TYPE_CYCLE.indexOf(current) + 1) % TYPE_CYCLE.length];
    onAction({ type: "update-set", setId: set.id, patch: { setType: next } });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          {...tourAttrs({ id: "setRow.type", label: "Set type", help: "Tap to cycle; hold to open the picker.", order: 110 })}
          aria-label={
            meta
              ? `Set type ${meta.label}. Tap to cycle, hold for picker`
              : "Set type not set. Tap to choose"
          }
          title={meta ? `${meta.label} — ${meta.description}` : "Choose set type"}
          onClick={(e) => {
            // Fully controlled popover: preventDefault suppresses Radix's own
            // click-toggle (composeEventHandlers skips when defaultPrevented),
            // so tap = cycle · hold / right-click / Enter = picker.
            e.preventDefault();
            if (longPressed.current) {
              longPressed.current = false;
              return;
            }
            if (templateBlank) {
              setOpen(true);
              return;
            }
            cycle();
          }}
          onPointerDown={(e) => {
            startRef.current = { x: e.clientX, y: e.clientY };
            longPressed.current = false;
            holdRef.current = setTimeout(() => {
              longPressed.current = true;
              setOpen(true);
            }, 420);
          }}
          onPointerMove={(e) => {
            const s = startRef.current;
            if (s && (Math.abs(e.clientX - s.x) > 8 || Math.abs(e.clientY - s.y) > 8)) endHold();
          }}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onPointerLeave={endHold}
          onContextMenu={(e) => {
            e.preventDefault();
            endHold();
            setOpen(true);
          }}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold transition-transform active:scale-95",
            templateBlank ? "border border-dashed border-border text-muted-foreground" : meta?.className,
          )}
        >
          {templateBlank ? "–" : (meta?.letter ?? "–")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 p-2">
        <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Set type</p>
        <div className="flex flex-col gap-1">
          {SET_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              {...tourAttrs({ skipTour: true, reason: "Set-type choices inside the type popover" })}
              onClick={() => {
                onAction({ type: "update-set", setId: set.id, patch: { setType: t } });
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-accent"
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
                  SET_TYPE_META[t].className,
                )}
              >
                {SET_TYPE_META[t].letter}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-tight">{SET_TYPE_META[t].label}</span>
                <span className="block text-[11px] leading-tight text-muted-foreground">
                  {SET_TYPE_META[t].description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ValueCell({
  field,
  set,
  exercise,
  mode,
  editable,
  onAction,
}: {
  field: SetField;
  set: CardSet;
  exercise: CardExercise;
  mode: CardMode;
  editable: boolean;
  onAction?: (a: CardAction) => void;
}) {
  const key = FIELD_TO_KEY[field];
  const value = (set[key] as number | null | undefined) ?? null;
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const step = stepForField(field, exercise);
  const templateBlank = mode === "template" && value == null;
  const label = FIELD_LABEL[field];

  if (!editable || !onAction) {
    return (
      <span
        className="w-full truncate px-1 text-right text-sm tabular-nums text-foreground"
        title={formatFieldValue(field, value, exercise.unit)}
      >
        {formatFieldValue(field, value, exercise.unit)}
      </span>
    );
  }

  const display = draft ?? (value == null ? "" : trimNum(value));

  const commit = () => {
    if (draft != null) {
      const parsed = parseFieldValue(field, draft);
      if (parsed !== undefined && parsed !== value) {
        onAction({ type: "update-set", setId: set.id, patch: { [key]: parsed } as Partial<CardSet> });
      }
    }
    setDraft(null);
  };

  const stepBy = (dir: 1 | -1) => {
    const parsedDraft = draft != null ? parseFieldValue(field, draft) : undefined;
    const base = (parsedDraft != null ? parsedDraft : value) ?? 0;
    const next = Math.max(0, Math.round((base + dir * step) * 100) / 100);
    onAction({ type: "update-set", setId: set.id, patch: { [key]: next } as Partial<CardSet> });
    setDraft(null);
  };

  const stepperButton = (dir: 1 | -1) => (
    <button
      type="button"
      aria-label={dir < 0 ? `Decrease ${label}` : `Increase ${label}`}
      // Keep focus on the input so the steppers don't unmount before click.
      onMouseDown={(e) => e.preventDefault()}
      {...tourAttrs(
        dir === -1
          ? { id: "setRow.stepper", label: "Stepper", help: "Tap −/+ to nudge the focused value.", order: 190, hint: true }
          : { skipTour: true, reason: "The + half of the focused-cell stepper pair" },
      )}
      onClick={() => stepBy(dir)}
      className="flex h-8 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {dir < 0 ? <Minus className="h-3 w-3" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />}
    </button>
  );

  // Grid keyboard navigation (audit D6/M2): Enter/↓ → same column one row down
  // (Enter on the last row adds a set); ↑ → one row up.
  const moveFocus = (dir: 1 | -1, input: HTMLInputElement): boolean => {
    const cell = input.parentElement?.parentElement;
    const row = cell?.parentElement;
    if (!cell || !row || !row.parentElement) return false;
    const colIndex = Array.prototype.indexOf.call(row.children, cell);
    const rows = Array.from(row.parentElement.querySelectorAll<HTMLElement>("[data-row]"));
    const rowIndex = rows.indexOf(row);
    const target = rows[rowIndex + dir];
    if (!target) return false;
    const targetCell = target.children[colIndex] as HTMLElement | undefined;
    const focusable = targetCell?.querySelector<HTMLElement>("input, button");
    if (focusable) {
      focusable.focus();
      return true;
    }
    return false;
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      commit();
      moveFocus(-1, e.currentTarget);
    } else if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      commit();
      const input = e.currentTarget;
      if (!moveFocus(1, input)) {
        // Last row: Enter adds a new set (prefilled by the card) and focuses it.
        onAction({ type: "add-set" });
        requestAnimationFrame(() => {
          const row = input.parentElement?.parentElement?.parentElement;
          const rows = row?.parentElement
            ? Array.from(row.parentElement.querySelectorAll<HTMLElement>("[data-row]"))
            : [];
          const cell = input.parentElement?.parentElement;
          const colIndex = cell && row ? Array.prototype.indexOf.call(row.children, cell) : -1;
          const last = rows[rows.length - 1];
          const focusable =
            colIndex >= 0 ? (last?.children[colIndex] as HTMLElement | undefined)?.querySelector<HTMLElement>("input") : null;
          focusable?.focus();
        });
      }
    }
  };

  return (
    <div className="flex h-full min-w-0 items-center">
      {/* template blank: ↺ = copy-last (typed value replaces it) */}
      {templateBlank && !focused ? (
        <button
          type="button"
          {...tourAttrs({ skipTour: true, reason: "Copy-previous shortcut on blank template cells" })}
          aria-label={`Copy previous set ${label.toLowerCase()}`}
          title="Copy previous set"
          onClick={() => onAction({ type: "copy-last", setId: set.id })}
          className="flex h-8 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
      {/* focused: inline steppers inside the cell ([− 20px | input | + 20px]) */}
      {focused ? stepperButton(-1) : null}
      <input
        aria-label={label}
        {...tourAttrs({ skipTour: true, reason: "Input covered by the setRow.field cell anchor" })}
        inputMode={field === "reps" ? "numeric" : "decimal"}
        value={display}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          commit();
          setFocused(false);
        }}
        onKeyDown={onInputKeyDown}
        onChange={(e) => setDraft(e.target.value)}
        className="h-full min-w-0 flex-1 truncate rounded-sm border-0 bg-transparent px-1 text-right text-sm tabular-nums text-foreground outline-none focus:bg-muted/40"
      />
      {focused ? stepperButton(1) : null}
    </div>
  );
}

function RpeCell({ set, editable, onAction }: { set: CardSet; editable: boolean; onAction?: (a: CardAction) => void }) {
  const [open, setOpen] = useState(false);
  const value = set.rpe ?? null;
  if (!editable || !onAction) {
    return (
      <span
        className={cn(
          "w-full truncate text-center text-xs font-semibold tabular-nums",
          value != null ? "text-foreground" : "text-muted-foreground/50",
        )}
        title={value != null ? `RPE ${formatRpe(value)}` : "RPE not set"}
      >
        {value != null ? formatRpe(value) : "–"}
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          {...tourAttrs({ id: "setRow.rpe", label: "RPE", help: "Effort rating; tap to pick 1–10.", order: 140 })}
          aria-label={value != null ? `RPE ${formatRpe(value)}, tap to change` : "RPE not set, tap to choose"}
          className={cellButtonBase}
        >
          {value != null ? formatRpe(value) : <span className="text-muted-foreground/50">–</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 p-3">
        <RpeEditor
          value={value}
          onChange={(v) => {
            onAction({ type: "update-set", setId: set.id, patch: { rpe: v } });
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function TempoCell({
  set,
  editable,
  onAction,
  tempoPresets,
}: {
  set: CardSet;
  editable: boolean;
  onAction?: (a: CardAction) => void;
  tempoPresets?: string[];
}) {
  const [open, setOpen] = useState(false);
  const value = set.tempo ?? null;
  if (!editable || !onAction) {
    return (
      <span
        className={cn(
          "w-full truncate text-center text-xs font-semibold tabular-nums",
          value ? "text-foreground" : "text-muted-foreground/50",
        )}
        title={value ? `Tempo ${value}` : "Tempo not set"}
      >
        {value ?? "–"}
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          {...tourAttrs({ id: "setRow.tempo", label: "Tempo", help: "Lift tempo, e.g. 3-0-1-0; tap to edit.", order: 150 })}
          aria-label={value ? `Tempo ${value}, tap to change` : "Tempo not set, tap to edit"}
          className={cellButtonBase}
        >
          {value ?? <span className="text-muted-foreground/50">–</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 p-3">
        <TempoEditor
          value={value}
          presets={tempoPresets}
          onChange={(v) => onAction({ type: "update-set", setId: set.id, patch: { tempo: v } })}
        />
      </PopoverContent>
    </Popover>
  );
}

function RestCell({ set, editable, onAction }: { set: CardSet; editable: boolean; onAction?: (a: CardAction) => void }) {
  const [open, setOpen] = useState(false);
  const planned = set.restPlannedSec ?? null;
  const actual = set.restActualSec ?? null;
  const text =
    planned != null && planned > 0
      ? actual != null
        ? `${formatRestSec(planned)} → ${actual}s`
        : formatRestSec(planned)
      : "–";
  if (!editable || !onAction) {
    return (
      <span
        className={cn(
          "w-full truncate text-center text-xs font-semibold tabular-nums",
          planned ? "text-foreground" : "text-muted-foreground/50",
        )}
        title={text}
      >
        {text}
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          {...tourAttrs({ id: "setRow.rest", label: "Rest", help: "Planned rest after this set; tap to edit.", order: 160 })}
          aria-label={planned ? `Planned rest ${formatRestSec(planned)}, tap to change` : "Rest not set, tap to edit"}
          className={cellButtonBase}
        >
          {planned ? text : <span className="text-muted-foreground/50">–</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-52 p-3">
        <RestEditor
          value={planned}
          onChange={(v) => {
            onAction({ type: "update-set", setId: set.id, patch: { restPlannedSec: v } });
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function DoneCell({ set, mode, onAction }: { set: CardSet; mode: CardMode; onAction?: (a: CardAction) => void }) {
  if ((mode === "edit" || mode === "preview") && onAction) {
    return (
      <Checkbox
        checked={!!set.done}
        {...tourAttrs({ id: "setRow.done", label: "Done", help: "Tick to complete the set and start rest.", order: 170 })}
        onCheckedChange={() => onAction({ type: "toggle-done", setId: set.id })}
        className="h-5 w-5"
        aria-label={`Mark set ${set.index} ${set.done ? "not done" : "done"}`}
      />
    );
  }
  return set.done ? (
    <Check className="h-4 w-4 text-emerald-500" role="img" aria-label="Completed" />
  ) : (
    <Check className="h-4 w-4 text-muted-foreground/30" aria-hidden />
  );
}

// ---------- apply-to-all field chips (§4.10d) ----------

/** One selectable field in the ⋯ popover's "Apply to all sets" expander. */
type ApplyField = { key: keyof ApplyToAllFields; label: string; enabled: boolean };

function applyFieldsFor(exercise: CardExercise, set: CardSet): ApplyField[] {
  const fields = fieldsForType(exercise.modality);
  const out: ApplyField[] = fields.map((f) => ({
    key: FIELD_TO_KEY[f] as keyof ApplyToAllFields,
    label: FIELD_LABEL[f],
    enabled: (set[FIELD_TO_KEY[f]] as number | null | undefined) != null,
  }));
  out.push({ key: "restPlannedSec", label: "Rest", enabled: set.restPlannedSec != null });
  out.push({ key: "tempo", label: "Tempo", enabled: !!set.tempo });
  out.push({ key: "rpe", label: "RPE", enabled: set.rpe != null });
  return out;
}

function ApplyToAllSection({
  exercise,
  set,
  onAction,
}: {
  exercise: CardExercise;
  set: CardSet;
  onAction: (a: CardAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fields = applyFieldsFor(exercise, set);
  const anyEnabled = fields.some((f) => f.enabled);

  const toggle = (key: string) => {
    hapticTap();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const apply = () => {
    // keys are constrained to keyof ApplyToAllFields by applyFieldsFor, so the
    // record-then-cast keeps each property's value type sound.
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      if (!selected.has(f.key) || !f.enabled) continue;
      // copy the value straight off the source row (undefined → null = clear)
      out[f.key] = set[f.key] ?? null;
    }
    onAction({ type: "apply-to-all", fields: out as ApplyToAllFields });
  };

  if (!anyEnabled) {
    return (
      <p className="text-[11px] leading-snug text-muted-foreground/70">
        Fill weight, reps, rest, tempo or RPE on this set to copy it to every set.
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        {...tourAttrs({ id: "setRow.applyAll", label: "Apply to all", help: "Copy this set's fields onto every set.", order: 200, hint: true })}
        aria-label="Apply to all sets"
        onClick={() => {
          hapticTap();
          setOpen((o) => !o);
        }}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Copy className="h-3.5 w-3.5 flex-none" aria-hidden />
        <span className="min-w-0 flex-1">Apply to all sets</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 flex-none transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="pt-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Fields to apply">
            {fields.map((f) => {
              const on = selected.has(f.key);
              return (
                <button
                  key={f.key}
                  type="button"
                  disabled={!f.enabled}
                  {...tourAttrs({ skipTour: true, reason: "Field chips inside the apply-to-all section" })}
                  aria-pressed={on}
                  aria-disabled={!f.enabled}
                  aria-label={`Apply ${f.label}${f.enabled ? "" : " — no value on this set"}`}
                  className={cn(
                    "flex h-8 items-center rounded-full border px-3 text-xs font-bold transition-colors",
                    on
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    !f.enabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground",
                  )}
                  onClick={() => toggle(f.key)}
                >
                  {f.label}
                  {on ? <Check className="ml-1 h-3 w-3" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
          <Button
            type="button"
            size="sm"
            tour={{ skipTour: true, reason: "Apply action inside the apply-to-all section" }}
            className="mt-2 h-8 w-full rounded-lg text-xs font-bold"
            disabled={selected.size === 0}
            onClick={apply}
          >
            Apply to all sets
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function MoreCell({
  set,
  exercise,
  editable,
  showRpeEditor,
  showTempoEditor,
  allowRemoveSet,
  tempoPresets,
  onAction,
}: {
  set: CardSet;
  exercise: CardExercise;
  editable: boolean;
  showRpeEditor: boolean;
  showTempoEditor: boolean;
  /** template mode: predefined sets can be deleted from the row ⋯ popover. */
  allowRemoveSet?: boolean;
  tempoPresets?: string[];
  onAction?: (a: CardAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);

  // read / preview: PR/note glyph (inline — the preferred PR badge spot)
  if (!editable || !onAction) {
    if (set.isNewPr) return <Trophy className="h-3.5 w-3.5 text-amber-400" role="img" aria-label="New personal record" />;
    if (set.note) return <StickyNote className="h-3.5 w-3.5 text-muted-foreground" role="img" aria-label="Has note" />;
    return null;
  }

  const commitNote = () => {
    if (noteDraft != null && noteDraft !== (set.note ?? "")) {
      onAction({ type: "update-set", setId: set.id, patch: { note: noteDraft } });
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) commitNote();
    setOpen(next);
    if (next) setNoteDraft(null);
  };

  const dropped = showRpeEditor || showTempoEditor;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          {...tourAttrs({ id: "setRow.more", label: "More", help: "Note, copy last, rest timer and apply-to-all.", order: 180 })}
          aria-label={`More options for set ${set.index}`}
          className="flex h-10 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        {dropped ? (
          <div className="flex flex-col gap-3">
            {showRpeEditor ? (
              <RpeEditor
                value={set.rpe ?? null}
                onChange={(v) => onAction({ type: "update-set", setId: set.id, patch: { rpe: v } })}
              />
            ) : null}
            {showTempoEditor ? (
              <div className="border-t border-border pt-3">
                <TempoEditor
                  value={set.tempo ?? null}
                  presets={tempoPresets}
                  onChange={(v) => onAction({ type: "update-set", setId: set.id, patch: { tempo: v } })}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={cn(dropped && "border-t border-border pt-3")}>
          <p className="pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Note</p>
          <textarea
            aria-label="Set note"
            rows={2}
            {...tourAttrs({ skipTour: true, reason: "Set note field inside the ⋯ popover" })}
            value={noteDraft ?? set.note ?? ""}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={commitNote}
            placeholder="Set note…"
            className="w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring/40"
          />
          <div className="mt-2 flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              tour={{ skipTour: true, reason: "Copy-last action inside the ⋯ popover" }}
              className="h-8 flex-1 rounded-lg text-xs"
              onClick={() => onAction({ type: "copy-last", setId: set.id })}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Copy last
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              tour={{ skipTour: true, reason: "Rest-timer action inside the ⋯ popover" }}
              className="h-8 flex-1 rounded-lg text-xs"
              onClick={() => {
                onAction({ type: "rest-timer", setId: set.id });
                handleOpenChange(false);
              }}
            >
              <Timer className="h-3.5 w-3.5" aria-hidden /> Rest
            </Button>
          </div>
          <div className="mt-2 border-t border-border pt-2">
            <ApplyToAllSection exercise={exercise} set={set} onAction={onAction} />
          </div>
          {allowRemoveSet ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              tour={{ skipTour: true, reason: "Remove-set action inside the ⋯ popover" }}
              className="mt-2 h-8 w-full rounded-lg text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                onAction({ type: "remove-set", setId: set.id });
                handleOpenChange(false);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove set
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- SetRow ----------

export interface SetRowProps {
  /** Render mode — see CardMode. */
  mode: CardMode;
  exercise: CardExercise;
  set: CardSet;
  visibleColumns: CardVisibleColumns;
  /**
   * read/preview: whether the card shows the more track (ExerciseCard computes
   * "any set has a PR/note"). Standalone default: this set has a PR/note.
   */
  moreTrack?: boolean;
  /** Omit → the row renders fully read-only (no inputs/menus, even in edit mode). */
  onAction?: (action: CardAction) => void;
  /** §4.10e tempo presets ("2-0-2-0"…) shown as chips in the tempo editors. */
  tempoPresets?: string[];
  className?: string;
}

export function SetRow({
  mode,
  exercise,
  set,
  visibleColumns,
  moreTrack,
  onAction,
  tempoPresets,
  className,
}: SetRowProps) {
  const vw = useViewportWidth();
  const fields = useMemo(() => fieldsForType(exercise.modality), [exercise.modality]);
  const editable = onAction != null && (mode === "edit" || mode === "template" || mode === "preview");
  const effectiveMoreTrack =
    moreTrack ?? (mode === "read" || mode === "preview" ? !!(set.isNewPr || set.note) : true);
  const grid = useMemo(
    () => buildGrid(fields, visibleColumns, mode, vw, effectiveMoreTrack),
    [fields, visibleColumns, mode, vw, effectiveMoreTrack],
  );

  // rpe/tempo editors move into the more ⋯ popover below the wide threshold
  const rpeDropped = visibleColumns.rpe && vw < WIDE_VIEWPORT;
  const tempoDropped = visibleColumns.tempo && vw < WIDE_VIEWPORT;
  const typeEditable = editable && (mode === "edit" || mode === "template");
  const moreEditable = editable && (mode === "edit" || mode === "template");

  const cells: Record<TrackKey, ReactNode> = {
    index: <IndexCell set={set} mode={mode} onAction={editable ? onAction : undefined} />,
    setType: <TypeCell set={set} mode={mode} editable={typeEditable} onAction={typeEditable ? onAction : undefined} />,
    f1: fields[0] ? (
      <ValueCell
        field={fields[0]}
        set={set}
        exercise={exercise}
        mode={mode}
        editable={editable}
        onAction={editable ? onAction : undefined}
      />
    ) : null,
    f2: fields[1] ? (
      <ValueCell
        field={fields[1]}
        set={set}
        exercise={exercise}
        mode={mode}
        editable={editable}
        onAction={editable ? onAction : undefined}
      />
    ) : null,
    rpe: <RpeCell set={set} editable={editable} onAction={editable ? onAction : undefined} />,
    tempo: (
      <TempoCell
        set={set}
        editable={editable}
        onAction={editable ? onAction : undefined}
        tempoPresets={tempoPresets}
      />
    ),
    rest: <RestCell set={set} editable={editable} onAction={editable ? onAction : undefined} />,
    done: <DoneCell set={set} mode={mode} onAction={onAction} />,
    more: (
      <MoreCell
        set={set}
        exercise={exercise}
        editable={moreEditable}
        showRpeEditor={rpeDropped}
        showTempoEditor={tempoDropped}
        allowRemoveSet={mode === "template"}
        tempoPresets={tempoPresets}
        onAction={moreEditable ? onAction : undefined}
      />
    ),
  };

  return (
    <div
      data-row
      role="group"
      aria-label={`Set ${set.index}`}
      className={cn(rowGrid, rowTint(set), className)}
      style={{ gridTemplateColumns: grid.template }}
    >
      {grid.keys.map((key) => (
        <div
          key={key}
          className={cn(CELL, key !== "f1" && key !== "f2" && "justify-center")}
          // Part 7 — the two value cells are anchored at the CELL level (the
          // editable input inside is a shared component across f1/f2, so the
          // anchor lives here where the track identity is known).
          {...(key === "f1"
            ? tourAttrs({ id: "setRow.field1", label: "Main value", help: "Type the weight, time or primary value.", order: 120 })
            : key === "f2"
              ? tourAttrs({ id: "setRow.field2", label: "Second value", help: "Type reps, distance or the second value.", order: 130 })
              : {})}
        >
          {cells[key]}
        </div>
      ))}
    </div>
  );
}
