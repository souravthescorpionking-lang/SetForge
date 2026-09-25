"use client";

// SetTable — the Part 2 single-row set entry table. One set = one row of
// inline-editable cells (# / type tag / values / RPE / tempo / rest / ✓ / …).
// Used by the training screen. An "add set" ghost row at the bottom carries
// last-time placeholders; Enter on a cell commits and moves on.
import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, MessageSquareText, Plus, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRestSec, fieldsForType, SET_TYPE_META, type SetField, type SetType } from "@/lib/constants";
import type { SetDTO } from "@/lib/types";
import { NumericCell, RpeCell, RestCell, SetTypeTag, TempoCell } from "./cells";
import { RowSheet } from "./row-sheet";

export type VisibleCols = { setType: boolean; rpe: boolean; tempo: boolean; rest: boolean };

export type AddRowDraft = {
  weight: number | null;
  reps: number | null;
  distance: number | null;
  timeSec: number | null;
};

type Props = {
  sets: SetDTO[];
  exerciseType: string;
  cols: VisibleCols;
  weightStep: number;
  unit: string;
  /** Last session's top set — renders as muted placeholder ghosts in the add row. */
  ghost?: { weight: number | null; reps: number | null; distance: number | null; timeSec: number | null; rpe: number | null; tempo: string | null; restPlannedSec: number | null } | null;
  /** Exercise-level defaults for new sets. */
  defaults?: { setType?: string | null; rpe?: number | null; tempo?: string | null; restPlannedSec?: number | null };
  restRowId?: string | null;
  restRemainingSec?: number | null;
  markSetsComplete: boolean;
  onPatchSet: (id: string, patch: Record<string, unknown>) => void;
  onAddSet: (values: {
    weight: number | null;
    reps: number | null;
    distance: number | null;
    timeSec: number | null;
    setType?: string;
    rpe?: number | null;
    tempo?: string | null;
    restPlannedSec?: number | null;
    isComplete?: boolean;
  }) => Promise<void>;
  onDuplicateSet: (set: SetDTO) => void;
  onDeleteSet: (set: SetDTO) => void;
  onReorder: (ids: string[]) => void;
  onStartRest: (sec: number, setId: string) => void;
  onToggleComplete: (set: SetDTO) => void;
  onUseAsPrefill: (set: SetDTO) => void;
  focusSignal?: number;
  /** Controlled add-row draft (lift state to feed live delta bars). */
  draft?: AddRowDraft;
  onDraftChange?: (d: AddRowDraft) => void;
};

const FIELD_LABELS: Record<SetField, string> = {
  weight: "WEIGHT",
  reps: "REPS",
  distance: "DIST",
  timeSec: "TIME",
};

export function SetTable({
  sets,
  exerciseType,
  cols,
  weightStep,
  unit,
  ghost,
  defaults,
  restRowId,
  restRemainingSec,
  markSetsComplete,
  onPatchSet,
  onAddSet,
  onDuplicateSet,
  onDeleteSet,
  onReorder,
  onStartRest,
  onToggleComplete,
  onUseAsPrefill,
  focusSignal,
  draft,
  onDraftChange,
}: Props) {
  const fields = useMemo(() => fieldsForType(exerciseType), [exerciseType]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );
  const sorted = useMemo(() => [...sets].sort((a, b) => a.sortOrder - b.sortOrder), [sets]);
  const ids = useMemo(() => sorted.map((s) => s.id), [sorted]);

  const [sheetSet, setSheetSet] = useState<SetDTO | null>(null);
  const [internalDraft, setInternalDraft] = useState<AddRowDraft>({ weight: null, reps: null, distance: null, timeSec: null });
  const addDraft = draft ?? internalDraft;
  const setAddDraft = (d: AddRowDraft) => {
    if (onDraftChange) onDraftChange(d);
    else setInternalDraft(d);
  };
  const addRef = useRef<HTMLButtonElement>(null);

  // external "focus the add row" signal (keyboard shortcut N)
  const lastFocus = useRef<number>(0);
  useEffect(() => {
    if (focusSignal != null && focusSignal !== lastFocus.current) {
      lastFocus.current = focusSignal;
      const t = setTimeout(() => addRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [focusSignal]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  // grid template: fixed small cols + flexible value cols
  const templateParts: string[] = ["2rem"];
  if (cols.setType) templateParts.push("2.25rem");
  for (const _f of fields) templateParts.push("minmax(0,1fr)");
  if (cols.rpe) templateParts.push("2.9rem");
  if (cols.tempo) templateParts.push("3.75rem");
  if (cols.rest) templateParts.push("3.4rem");
  templateParts.push("2.5rem"); // ✓ — always present (checkbox or done toggle)
  templateParts.push("2.25rem");
  const gridTemplate = templateParts.join(" ");

  const headerLabels = (
    <>
      <span className="text-center text-[10px] font-bold tracking-wider text-muted-foreground">#</span>
      {cols.setType && <span className="text-center text-[10px] font-bold tracking-wider text-muted-foreground">SET</span>}
      {fields.map((f) => (
        <span key={f} className="truncate text-center text-[10px] font-bold tracking-wider text-muted-foreground">
          {f === "weight" ? unit.toUpperCase() : FIELD_LABELS[f]}
        </span>
      ))}
      {cols.rpe && <span className="text-center text-[10px] font-bold tracking-wider text-muted-foreground">RPE</span>}
      {cols.tempo && <span className="text-center text-[10px] font-bold tracking-wider text-muted-foreground">TEMPO</span>}
      {cols.rest && <span className="text-center text-[10px] font-bold tracking-wider text-muted-foreground">REST</span>}
      <span className="text-center text-[10px] font-bold tracking-wider text-muted-foreground">✓</span>
      <span />
    </>
  );

  // fresh-draft mirror: Enter handlers read this instead of stale props.
  // Synced in an effect — the commit→setTimeout(0) macrotask always runs after it.
  const draftRef = useRef(addDraft);
  useEffect(() => {
    draftRef.current = addDraft;
  }, [addDraft]);

  const submitAdd = async (override?: Partial<AddRowDraft>) => {
    const d = { ...draftRef.current, ...override };
    const hasValue = fields.some((f) => d[f] != null);
    if (!hasValue) return;
    await onAddSet({
      weight: fields.includes("weight") ? d.weight : null,
      reps: fields.includes("reps") ? d.reps : null,
      distance: fields.includes("distance") ? d.distance : null,
      timeSec: fields.includes("timeSec") ? d.timeSec : null,
      setType: defaults?.setType ?? undefined,
      rpe: ghost?.rpe ?? defaults?.rpe ?? undefined,
      tempo: ghost?.tempo ?? defaults?.tempo ?? undefined,
      restPlannedSec: ghost?.restPlannedSec ?? defaults?.restPlannedSec ?? undefined,
    });
    setAddDraft({ weight: null, reps: null, distance: null, timeSec: null });
  };

  return (
    <div role="grid" aria-label="Sets" className="select-none">
      {/* header */}
      <div
        role="row"
        className="grid items-center gap-1 border-b border-border/70 pb-1"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {headerLabels}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div role="rowgroup" className="relative">
            {sorted.map((s, i) => (
              <SetTableRow
                key={s.id}
                set={s}
                index={i}
                prevType={i > 0 ? (sorted[i - 1].setType ?? "NORMAL") : null}
                fields={fields}
                gridTemplate={gridTemplate}
                cols={cols}
                weightStep={weightStep}
                unit={unit}
                restRowId={restRowId}
                restRemainingSec={restRowId === s.id ? restRemainingSec ?? null : null}
                markSetsComplete={markSetsComplete}
                onPatchSet={onPatchSet}
                onOpenSheet={setSheetSet}
                onToggleComplete={onToggleComplete}
                onStartRest={onStartRest}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* add-set ghost row */}
      <div
        role="row"
        aria-label="Add set"
        className="mt-1 grid items-center gap-1 rounded-xl border border-dashed border-border/80 bg-muted/20 px-1 py-1"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <button
          ref={addRef}
          type="button"
          aria-label="Add set"
          onClick={() => void submitAdd()}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/10"
        >
          <Plus className="h-4.5 w-4.5" />
        </button>
        {cols.setType && (
          <span className="flex items-center justify-center">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/60 text-[11px] font-bold text-muted-foreground/60">
              {(defaults?.setType ?? "NORMAL") === "NORMAL" ? "N" : SET_TYPE_META[(defaults?.setType ?? "NORMAL") as SetType].letter}
            </span>
          </span>
        )}
        {fields.map((f) => (
          <div key={f} className="min-w-0">
            <AddDraftCell
              field={f}
              draft={addDraft}
              weightStep={weightStep}
              unit={unit}
              ghost={ghost}
              onChange={(v) => setAddDraft({ ...addDraft, [f]: v })}
              onEnter={(v) => void submitAdd({ [f]: v })}
            />
          </div>
        ))}
        {cols.rpe && (
          <span className="flex h-8 items-center justify-center text-sm font-semibold tabular-nums text-muted-foreground/40">
            {ghost?.rpe ?? "–"}
          </span>
        )}
        {cols.tempo && (
          <span className="flex h-8 items-center justify-center text-xs font-semibold tabular-nums text-muted-foreground/40">
            {ghost?.tempo ?? "–"}
          </span>
        )}
        {cols.rest && (
          <span className="flex h-8 items-center justify-center text-xs font-semibold tabular-nums text-muted-foreground/40">
            {ghost?.restPlannedSec ? formatRestSec(ghost.restPlannedSec) : "–"}
          </span>
        )}
        {markSetsComplete && <span />}
        <span />
      </div>

      <RowSheet
        set={sheetSet}
        open={!!sheetSet}
        onOpenChange={(o) => !o && setSheetSet(null)}
        onPatch={onPatchSet}
        onDuplicate={onDuplicateSet}
        onDelete={onDeleteSet}
        onUseAsPrefill={(s) => {
          setAddDraft({
            weight: fields.includes("weight") ? s.weight : null,
            reps: fields.includes("reps") ? s.reps : null,
            distance: fields.includes("distance") ? s.distance : null,
            timeSec: fields.includes("timeSec") ? s.timeSec : null,
          });
        }}
      />
    </div>
  );
}

// ---------- row ----------

function SetTableRow({
  set,
  index,
  prevType,
  fields,
  gridTemplate,
  cols,
  weightStep,
  unit,
  restRowId,
  restRemainingSec,
  markSetsComplete,
  onPatchSet,
  onOpenSheet,
  onToggleComplete,
  onStartRest,
}: {
  set: SetDTO;
  index: number;
  prevType: string | null;
  fields: SetField[];
  gridTemplate: string;
  cols: VisibleCols;
  weightStep: number;
  unit: string;
  restRowId?: string | null;
  restRemainingSec: number | null;
  markSetsComplete: boolean;
  onPatchSet: (id: string, patch: Record<string, unknown>) => void;
  onOpenSheet: (set: SetDTO) => void;
  onToggleComplete: (set: SetDTO) => void;
  onStartRest: (sec: number, setId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: set.id });
  const type = (set.setType ?? (set.isWarmup ? "WARMUP" : "NORMAL")) as SetType;
  const isDrop = type === "DROP" && prevType != null;
  const resting = restRowId === set.id;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, gridTemplateColumns: gridTemplate }}
      role="row"
      aria-label={`Set ${index + 1}`}
      className={cn(
        "group/row relative grid items-center gap-1 rounded-xl border border-transparent px-1 transition-colors",
        "hover:border-border/70 hover:bg-muted/25",
        set.isComplete && "opacity-70",
        type === "FAILURE" && "bg-destructive/5",
        isDrop && "bg-violet-500/5",
        resting && "bg-primary/5 ring-1 ring-primary/30",
        isDragging && "z-10 opacity-80 shadow-xl ring-2 ring-primary/60",
      )}
    >
      {/* drop-set connector: thin line to previous row */}
      {isDrop && (
        <span aria-hidden className="absolute top-0 left-[1.05rem] z-0 h-full w-0.5 rounded bg-violet-400/60" />
      )}

      {/* # — drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Set ${index + 1} — drag to reorder`}
        className={cn(
          "flex h-9 w-8 cursor-grab touch-none items-center justify-center rounded-lg text-xs font-bold tabular-nums text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing",
          set.isWarmup && "text-amber-600/80 dark:text-amber-400/80",
        )}
      >
        {index + 1}
      </button>

      {cols.setType && (
        <SetTypeTag value={type} onChange={(t) => onPatchSet(set.id, { setType: t })} />
      )}

      {fields.map((f) => {
        const key = f === "timeSec" ? "timeSec" : f;
        return (
          <div key={f} className="min-w-0">
            {f === "timeSec" ? (
              <TimeValueCell
                value={set.timeSec}
                onChange={(v) => onPatchSet(set.id, { timeSec: v })}
                amrap={type === "AMRAP"}
              />
            ) : (
              <NumericCell
                value={set[key as "weight" | "reps" | "distance"]}
                onChange={(v) => onPatchSet(set.id, { [key]: v })}
                step={f === "weight" ? weightStep : f === "reps" ? 1 : 0.5}
                decimals={f === "reps" ? 0 : f === "weight" ? 2 : 2}
                suffix={f === "weight" ? unit : f === "distance" ? "km" : undefined}
                amrapSuffix={type === "AMRAP" && f === "reps"}
                ariaLabel={`${FIELD_LABELS[f].toLowerCase()} set ${index + 1}`}
              />
            )}
          </div>
        );
      })}

      {cols.rpe && (
        <RpeCell value={set.rpe ?? null} onChange={(rpe) => onPatchSet(set.id, { rpe })} />
      )}
      {cols.tempo && (
        <TempoCell value={set.tempo ?? null} onChange={(tempo) => onPatchSet(set.id, { tempo })} />
      )}
      {cols.rest && (
        <RestCell
          plannedSec={set.restPlannedSec ?? null}
          remainingSec={restRemainingSec ?? null}
          onChange={(restPlannedSec) => onPatchSet(set.id, { restPlannedSec })}
          onStartNow={(sec) => onStartRest(sec, set.id)}
        />
      )}

      {markSetsComplete ? (
        <div className="flex justify-center">
          <Checkbox
            aria-label={`Mark set ${index + 1} complete`}
            checked={set.isComplete}
            onCheckedChange={() => onToggleComplete(set)}
            className="h-5.5 w-5.5"
          />
        </div>
      ) : (
        <div className="flex justify-center">
          <button
            type="button"
            aria-label={`Set ${index + 1} done — starts rest`}
            onClick={() => onToggleComplete(set)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-all active:scale-90",
              set.isComplete
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground/40 hover:bg-accent hover:text-foreground",
            )}
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
        </div>
      )}

      {/* … cell: markers + overflow */}
      <button
        type="button"
        aria-label={`Set ${index + 1} options`}
        onClick={() => onOpenSheet(set)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
      >
        {set.newPr && (
          <Trophy className="absolute top-0.5 right-0.5 h-3 w-3 text-amber-500" aria-label="personal record" />
        )}
        {set.comment && (
          <MessageSquareText className="absolute bottom-0.5 left-0.5 h-3 w-3 text-muted-foreground/80" aria-label="has note" />
        )}
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------- time value cell ----------

function TimeValueCell({
  value,
  onChange,
  amrap,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  amrap?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const display = value != null ? formatRestSec(value) : null;

  const parseTime = (raw: string): number | null => {
    const t = raw.trim().replace(/[^\d:.]/g, "");
    if (!t) return null;
    const parts = t.split(":").map(Number);
    if (parts.some((n) => Number.isNaN(n))) return null;
    if (parts.length === 1) return parts[0]; // seconds
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  };

  if (!editing) {
    return (
      <button
        type="button"
        role="gridcell"
        aria-label={`time: ${value ?? "not set"}`}
        onClick={() => { setDraft(""); setEditing(true); }}
        className={cn(
          "flex h-8 w-full min-w-0 items-center justify-center gap-0.5 rounded-md px-1 text-sm font-semibold tabular-nums transition-colors hover:bg-accent",
          value == null ? "text-muted-foreground/50" : "text-foreground",
        )}
      >
        {display ? (
          <>
            <span className="truncate">{display}</span>
            {amrap && <span className="text-primary font-bold">+</span>}
          </>
        ) : (
          <span className="text-xs font-medium italic text-muted-foreground/50">–</span>
        )}
      </button>
    );
  }

  return (
    <input
      autoFocus
      aria-label="time"
      value={draft}
      placeholder="1:30"
      onChange={(e) => setDraft(e.target.value.slice(0, 8))}
      onBlur={() => {
        const v = parseTime(draft);
        if (v != null && v !== value) onChange(Math.min(900000, Math.max(0, Math.round(v))));
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const v = parseTime(draft);
          if (v != null && v !== value) onChange(Math.min(900000, Math.max(0, Math.round(v))));
          setEditing(false);
        }
        if (e.key === "Escape") setEditing(false);
      }}
      className="h-8 w-full min-w-0 rounded-md border border-primary/60 bg-background text-center text-sm font-semibold tabular-nums outline-none ring-2 ring-primary/30"
    />
  );
}

// ---------- add-row draft cell ----------

function AddDraftCell({
  field,
  draft,
  weightStep,
  unit,
  ghost,
  onChange,
  onEnter,
}: {
  field: SetField;
  draft: AddRowDraft;
  weightStep: number;
  unit: string;
  ghost?: Props["ghost"];
  onChange: (v: number | null) => void;
  onEnter: (committed: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const value = draft[field];
  const ghostValue = ghost?.[field] ?? null;
  const placeholderText =
    ghostValue != null
      ? field === "distance"
        ? `${ghostValue} km`
        : field === "timeSec"
          ? formatRestSec(ghostValue)
          : field === "reps"
            ? `${ghostValue}`
            : `${ghostValue} ${unit}`
      : "–";

  if (!editing) {
    return (
      <button
        type="button"
        role="gridcell"
        aria-label={`new set ${field}${ghostValue != null ? `, last time ${placeholderText}` : ""}`}
        onClick={() => { setText(value != null ? String(value) : ""); setEditing(true); }}
        className={cn(
          "flex h-8 w-full min-w-0 items-center justify-center gap-0.5 rounded-md px-1 text-sm font-semibold tabular-nums transition-colors hover:bg-accent",
          value == null
            ? ghostValue != null ? "text-muted-foreground/60" : "text-muted-foreground/40"
            : "text-foreground",
        )}
      >
        {value != null ? (
          <>
            <span className="truncate">{value}</span>
            {field === "weight" && <span className="text-[10px] font-medium text-muted-foreground">{unit}</span>}
            {field === "distance" && <span className="text-[10px] font-medium text-muted-foreground">km</span>}
          </>
        ) : (
          <span className="truncate text-xs font-medium italic">{placeholderText}</span>
        )}
      </button>
    );
  }

  const commit = () => {
    const t = text.trim();
    if (t !== "") {
      const parsed = Number(t);
      if (!Number.isNaN(parsed)) onChange(Math.max(0, parsed));
    }
    setEditing(false);
  };

  return (
    <input
      autoFocus
      aria-label={`new set ${field}`}
      inputMode="decimal"
      value={text}
      placeholder={placeholderText}
      onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const t = text.trim();
          const parsed = t === "" ? null : Number(t);
          const committed = parsed != null && !Number.isNaN(parsed) ? Math.max(0, parsed) : value;
          commit();
          setTimeout(() => onEnter(committed), 0);
        }
        if (e.key === "Escape") setEditing(false);
      }}
      className="h-8 w-full min-w-0 rounded-md border border-primary/60 bg-background text-center text-sm font-semibold tabular-nums outline-none ring-2 ring-primary/30"
    />
  );
}
