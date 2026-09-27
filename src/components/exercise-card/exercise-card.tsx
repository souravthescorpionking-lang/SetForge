"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ExerciseCard — THE single source of truth exercise card (Part 3 §EXERCISE
// CARD). Composes SetRow rows under a 56px header:
//
//   |▌ 4px category/group colour bar (full card height)
//   | chevron 24px (collapsible only) · name (truncate) · meta 120px · ⋮ 44px
//   | 1px divider · SetRow ×N (40px each) · "+ Add set" (40px, edit only)
//
// Laws honoured here: rounded-lg + 1px border + bg-card; header exactly 56px,
// single line; header never holds buttons except ⋮; card never scrolls and
// never contains inner cards; card width = container width (never side-by-side
// on mobile — desktop grids are the consumer's job, allowed in summary mode).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Boxes,
  ChevronDown,
  ListChecks,
  Maximize2,
  MessageSquareText,
  MoreVertical,
  Plus,
  Timer,
  Trash2,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { rowBase } from "@/lib/ui/tokens";
import { useApp } from "@/lib/client/store";
import { hapticSuccess } from "@/lib/client/haptics";
import { fieldsForType, formatRestSec, type SetField } from "@/lib/constants";
import { SetRow } from "../set-row/set-row";
import {
  formatDistanceM,
  trimNum,
  type ApplyToAllFields,
  type CardAction,
  type CardExercise,
  type CardMode,
  type CardSet,
  type CardVisibleColumns,
} from "./card-types";

export type {
  CardAction,
  CardExercise,
  CardMode,
  CardSet,
  CardVisibleColumns,
  ToCardSetInput,
  ApplyToAllFields,
} from "./card-types";
export { toCardSet } from "./card-types";

// ---------- ⋮ menu (per-mode subsets) ----------

/** Stagger between apply-to-all fan-out dispatches (§4.10d) — see dispatchAction. */
const APPLY_FANOUT_STAGGER_MS = 300;

type MenuSpec = { icon: LucideIcon; label: string; action: CardAction; destructive?: boolean };

function menuForMode(mode: CardMode): MenuSpec[] {
  switch (mode) {
    case "edit":
      return [
        // p3-4 extension: the edit-mode menu surfaces the existing "open"
        // CardAction so Today's "Focus view" navigation (#/today/{weId}) can
        // fire from the card itself (fixes the p3-3 gap).
        { icon: Maximize2, label: "Focus view", action: { type: "open" } },
        { icon: MessageSquareText, label: "Notes", action: { type: "notes" } },
        { icon: Timer, label: "Rest timer", action: { type: "rest-timer" } },
        { icon: ArrowUp, label: "Move up", action: { type: "move-up" } },
        { icon: ArrowDown, label: "Move down", action: { type: "move-down" } },
        { icon: Boxes, label: "Add to group", action: { type: "add-to-group" } },
        { icon: ArrowLeftRight, label: "Replace", action: { type: "replace" } },
        { icon: Trash2, label: "Remove", action: { type: "remove" }, destructive: true },
        { icon: ListChecks, label: "Select", action: { type: "select" } },
      ];
    case "template":
      return [
        { icon: MessageSquareText, label: "Notes", action: { type: "notes" } },
        { icon: Timer, label: "Rest timer", action: { type: "rest-timer" } },
        { icon: ArrowUp, label: "Move up", action: { type: "move-up" } },
        { icon: ArrowDown, label: "Move down", action: { type: "move-down" } },
        { icon: Boxes, label: "Add to group", action: { type: "add-to-group" } },
        { icon: ArrowLeftRight, label: "Replace", action: { type: "replace" } },
        { icon: Trash2, label: "Remove", action: { type: "remove" }, destructive: true },
        { icon: ListChecks, label: "Select", action: { type: "select" } },
      ];
    case "read":
      return [
        { icon: MessageSquareText, label: "Notes", action: { type: "notes" } },
        { icon: Maximize2, label: "Open", action: { type: "open" } },
      ];
    case "preview":
      return [
        { icon: MessageSquareText, label: "Notes", action: { type: "notes" } },
        { icon: ListChecks, label: "Select", action: { type: "select" } },
        { icon: Maximize2, label: "Open", action: { type: "open" } },
      ];
    case "summary":
      return [{ icon: Maximize2, label: "Open", action: { type: "open" } }];
  }
}

// ---------- header meta ("3×5 · 100 kg") ----------

function formatCardMeta(exercise: CardExercise, sets: CardSet[], fields: SetField[]): string {
  const n = sets.length;
  if (n === 0) return "0 sets";

  const has = (f: SetField) => fields.includes(f);
  const maxOf = (f: SetField): number | null => {
    let max: number | null = null;
    for (const s of sets) {
      const v =
        f === "weight" ? s.weightKg : f === "reps" ? s.reps : f === "distance" ? s.distanceM : s.timeSec;
      if (v != null && (max == null || v > max)) max = v;
    }
    return max;
  };

  let core = `${n}`;
  const maxReps = has("reps") ? maxOf("reps") : null;
  const maxDist = has("distance") ? maxOf("distance") : null;
  const maxTime = has("timeSec") ? maxOf("timeSec") : null;
  if (maxReps != null) core = `${n}×${trimNum(maxReps)}`;
  else if (maxDist != null) core = `${n}× ${formatDistanceM(maxDist)}`;
  else if (maxTime != null) core = `${n}× ${formatRestSec(maxTime)}`;

  const maxWeight = has("weight") ? maxOf("weight") : null;
  if (maxWeight != null) core += ` · ${trimNum(maxWeight)} ${exercise.unit ?? "kg"}`;

  if (core === `${n}`) core = `${n} sets`;
  return core;
}

// ---------- ExerciseCard ----------

export interface ExerciseCardProps {
  /** edit=Today · read=History/Calendar · preview=Copy/Log-day · template=Routine editor · summary=collapsed one-liner. */
  mode: CardMode;
  exercise: CardExercise;
  sets: CardSet[];
  /** Collapsed (header only). Prop-controlled; read consumers default it to true. */
  collapsed?: boolean;
  /** Settings-driven column visibility (defaults to all on). */
  visibleColumns?: CardVisibleColumns;
  /** Group colour — replaces the category bar colour when grouped. */
  groupColour?: string;
  /** Group label for the header chip + meta tooltip (spec: "group name shown in meta on hover/tap"). */
  groupName?: string;
  /** Omit → the card renders fully read-only (no inputs/menus even in edit mode). */
  onAction?: (action: CardAction) => void;
  /** Rows-only card: no 56px header, no collapse chevron, no ⋮ — the parent
   * renders its own title bar; onAction still flows for rows/add-set. */
  hideHeader?: boolean;
  /** Optional leading slot inside the header (before the chevron/name) —
   * e.g. the 24px drag handle on template cards in edit mode. Ignored when
   * hideHeader is set. */
  headerLeading?: ReactNode;
  /** Part 6 (§4.10): derived group code ("A1") — 32px chip before the name. */
  groupCode?: string;
  /** Part 6 (§4.11): extra meta line under the summary (e.g. "Best 110×5"), 12px tabular. */
  metaExtra?: ReactNode;
  /** Part 6 (§4.11): flow element rendered under the header, above rows
   * (guided-mode MediaBlock / trainer-tip row). 0-height when null. */
  underHeader?: ReactNode;
  /** Part 6 (§4.10e): tempo presets ("2-0-2-0"…) for the tempo editors.
   * Omitted → falls back to settings.tempoPresets from the app store. */
  tempoPresets?: string[];
  className?: string;
}

export function ExerciseCard({
  mode,
  exercise,
  sets,
  collapsed = false,
  visibleColumns,
  groupColour,
  groupName,
  onAction,
  hideHeader = false,
  headerLeading,
  groupCode,
  metaExtra,
  underHeader,
  tempoPresets,
  className,
}: ExerciseCardProps) {
  const storeTempoPresets = useApp((s) => s.settings)?.tempoPresets;
  const effectiveTempoPresets = tempoPresets ?? storeTempoPresets;
  const cols: CardVisibleColumns =
    visibleColumns ?? { setType: true, rpe: true, tempo: true, rest: true };
  const fields = useMemo(() => fieldsForType(exercise.modality), [exercise.modality]);
  const ordered = useMemo(() => [...sets].sort((a, b) => a.index - b.index), [sets]);

  const hasActions = onAction != null;
  const menu = hasActions ? menuForMode(mode) : [];
  const hasPr = ordered.some((s) => s.isNewPr);
  const hasMoreGlyph = ordered.some((s) => s.isNewPr || (s.note != null && s.note !== ""));
  const summary = mode === "summary";
  const collapsible = ordered.length > 0 && !summary && hasActions && !hideHeader;
  const rowsVisible = !summary && !(collapsible && collapsed);
  // template mode (routine editors) also offers the "+ Add set" row — the
  // predefined-set editor needs it to grow a template.
  const addSetRow = hasActions && (mode === "edit" || mode === "template");
  const meta = formatCardMeta(exercise, ordered, fields);
  const barColour = groupColour ?? exercise.categoryColour;

  // §4.10d “Apply to all sets” is handled INSIDE the card: the row-level action
  // fans out into one update-set per sibling set, so consumers never change.
  // Undo restores the pre-apply snapshot captured from this render's props.
  // The fan-out is STAGGERED (~300ms): consumers fire one PATCH per dispatch,
  // and N simultaneous set PATCHes contend on the SQLite write lock (PR
  // recompute runs inside each transaction) — sequential dispatches keep every
  // request fast and green while the UI updates progressively.
  const fanOutUpdates = (patches: Array<{ setId: string; patch: ApplyToAllFields }>): void => {
    patches.forEach((p, i) => {
      const dispatch = () => onAction?.({ type: "update-set", setId: p.setId, patch: { ...p.patch } });
      if (i === 0) dispatch();
      else window.setTimeout(dispatch, i * APPLY_FANOUT_STAGGER_MS);
    });
  };
  const dispatchAction = (action: CardAction): void => {
    if (action.type !== "apply-to-all") {
      onAction?.(action);
      return;
    }
    const keys = Object.keys(action.fields) as Array<keyof ApplyToAllFields>;
    if (keys.length === 0 || ordered.length === 0) return;
    const snapshot = ordered.map((s) => ({
      id: s.id,
      prev: Object.fromEntries(keys.map((k) => [k, s[k] ?? null])) as ApplyToAllFields,
    }));
    fanOutUpdates(ordered.map((s) => ({ setId: s.id, patch: action.fields })));
    hapticSuccess();
    toast.success(`Applied to ${ordered.length} set${ordered.length === 1 ? "" : "s"}`, {
      action: {
        label: "Undo",
        onClick: () => {
          fanOutUpdates(snapshot.map((s) => ({ setId: s.id, patch: s.prev })));
        },
      },
    });
  };

  const headerInner = (
    <>
      {headerLeading ? <span className="flex flex-none items-center">{headerLeading}</span> : null}
      {collapsible ? (
        <Button
          type="button"
          variant="ghost"
          className="h-6 w-6 flex-none p-0"
          onClick={() => onAction?.({ type: "toggle-collapse" })}
          aria-label={collapsed ? `Expand ${exercise.name}` : `Collapse ${exercise.name}`}
          aria-expanded={!collapsed}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")}
            aria-hidden
          />
        </Button>
      ) : null}
      {groupColour ? (
        <span
          className="flex-none rounded px-1 py-0.5 text-[10px] font-bold uppercase leading-none"
          style={{ backgroundColor: `${groupColour}26`, color: groupColour }}
          title={groupName ?? "Grouped"}
        >
          {groupName ?? "Group"}
        </span>
      ) : null}
      {groupCode ? (
        <span className="flex h-6 w-8 flex-none items-center justify-center rounded bg-muted/60 text-[10px] font-bold tabular-nums" title={`Group code ${groupCode}`}>
          {groupCode}
        </span>
      ) : null}
      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{exercise.name}</h3>
      <div
        className="flex w-[120px] flex-none flex-col items-end justify-center gap-0.5 text-right text-xs tabular-nums text-muted-foreground"
        title={groupColour ? (groupName ?? "Grouped") : undefined}
      >
        <span className="flex w-full items-center justify-end gap-1 leading-none">
          {hasPr ? <Trophy className="h-3.5 w-3.5 flex-none text-amber-400" role="img" aria-label="New personal record" /> : null}
          <span className="truncate">{meta}</span>
        </span>
        {metaExtra != null ? <span className="w-full truncate text-[11px] leading-none">{metaExtra}</span> : null}
      </div>
      {hasActions && menu.length > 0 ? (
        // stopPropagation keeps the summary-mode header "open" action from
        // firing when the ⋮ menu is the actual click target.
        <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-11 p-0"
                aria-label={`Actions for ${exercise.name}`}
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {menu.map((item) => (
                <DropdownMenuItem
                  key={item.label}
                  onClick={() => onAction?.(item.action)}
                  className={item.destructive ? "text-destructive focus:text-destructive" : undefined}
                >
                  <item.icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ) : null}
    </>
  );

  const header = summary ? (
    <div
      data-row
      role="button"
      tabIndex={hasActions ? 0 : undefined}
      aria-label={`Open ${exercise.name}`}
      onClick={hasActions ? () => onAction?.({ type: "open" }) : undefined}
      onKeyDown={
        hasActions
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAction?.({ type: "open" });
              }
            }
          : undefined
      }
      className={cn(
        "flex h-14 select-none items-center gap-1 overflow-hidden whitespace-nowrap pl-2",
        hasActions && "cursor-pointer transition-colors hover:bg-accent/50",
      )}
    >
      {headerInner}
    </div>
  ) : (
    <header data-row className="flex h-14 items-center gap-1 overflow-hidden whitespace-nowrap pl-2">
      {headerInner}
    </header>
  );

  return (
    <article className={cn("flex overflow-hidden rounded-lg border bg-card", className)} aria-label={exercise.name}>
      <div aria-hidden className="w-1 flex-none" style={{ backgroundColor: barColour }} />
      <div className="min-w-0 flex-1">
        {hideHeader ? null : header}
        {underHeader != null ? underHeader : null}
        {rowsVisible && (ordered.length > 0 || addSetRow) ? (
          <div className={hideHeader ? undefined : "border-t border-border"}>
            {ordered.map((s) => (
              <SetRow
                key={s.id}
                mode={mode}
                exercise={exercise}
                set={s}
                visibleColumns={cols}
                moreTrack={mode === "read" || mode === "preview" ? hasMoreGlyph : undefined}
                onAction={onAction != null ? dispatchAction : undefined}
                tempoPresets={effectiveTempoPresets}
              />
            ))}
            {addSetRow ? (
              <button
                type="button"
                data-row
                aria-label={`Add set to ${exercise.name}`}
                className={cn(
                  rowBase,
                  "w-full gap-2 px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50",
                )}
                onClick={() => onAction?.({ type: "add-set" })}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add set
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
