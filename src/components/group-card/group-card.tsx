"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GroupCard — THE single source of truth group card (Part 8 §2). One card per
// GROUP (a superset group, or an ungrouped exercise as its own group of 1):
//
//   |▌ 4px colour bar full height (group colour; category colour on singletons)
//   | A1                Superset | 32  code (12px bold muted) · label right
//   | Deadlift                   | 40  name 16px
//   | Reps:  5  5  5     💡 …    | 40  per-set reps tabular · tip · options
//   | Tempo: 4/0/1/0              | 32  hidden when no tempo anywhere
//   | ⏱ ›                        | 40  collapsed rest (toggle remembered)
//   |    3× · Rest sec: 90 90 90 | 40  expanded rest row
//   |                              12  gap between exercises inside group (no line)
//
// Modes (§2.3):
//   view — Program detail / Session detail: Reps / Tempo / ⏱ rows.
//   read — Log detail: SetRow list read-only ("100 · 5 🏆").
//   edit — Builder editors: view layout, fields tappable, ≡ drag replaces 💡.
//   log  — Logging screen: Tempo row + SetRow list + "+ set"; collapsed
//          exercises show "0/3" right.
//
// Laws honoured: ONE border per GROUP; colour = the 4px bar ONLY (Law 7);
// rows 56/48/40/32, single line, nowrap + ellipsis (Law 4); card never
// scrolls and never contains inner cards; width = container width.
// Divider BETWEEN groups (16px gap + 1px 30%-muted line) is rendered by
// <GroupCardStack> — never inside the card, never after the last group.
// ─────────────────────────────────────────────────────────────────────────────

import { Children, useState, isValidElement, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  ChevronDown,
  History,
  Info,
  Lightbulb,
  Maximize2,
  MessageSquareText,
  MoreVertical,
  PencilRuler,
  Plus,
  Replace,
  StickyNote,
  Timer,
  Trash2,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { rowBase } from "@/lib/ui/tokens";
import { tourAttrs } from "@/lib/tour/attrs";
import { SetRow } from "../set-row/set-row";
import { fieldsForType, type SetField } from "@/lib/constants";
import { Term } from "@/components/shared/term";
import {
  trimNum,
  type CardAction,
  type CardExercise,
  type CardMode,
  type CardSet,
  type CardVisibleColumns,
} from "./group-types";

export type {
  CardAction,
  CardExercise,
  CardMode,
  CardSet,
  CardVisibleColumns,
  ToCardSetInput,
  ApplyToAllFields,
} from "./group-types";
export { toCardSet } from "./group-types";

// ---------- entries & group ----------

export interface GroupCardEntry {
  exercise: CardExercise;
  sets: CardSet[];
  /** Derived series code, e.g. "A1" (empty for legacy solo usage). */
  code: string;
  /** Trainer tip (💡) — inline-expands to max 3 lines, 150ms. */
  tip?: string | null;
  /** Per-exercise coaching note (📝 §5.4) — 32px single-line row under the
   *  name; tap expands the full text (prose, exempt from nowrap). */
  note?: string | null;
  /** Part 9 §5: SeriesExercise-level “Rest: none” flag (rest row label). */
  restNone?: boolean;
  /** log mode: collapsed shows "0/3" right and hides the SetRow list. */
  collapsed?: boolean;
  /** edit mode: drag affordance replacing 💡. */
  dragHandle?: ReactNode;
  /** Guided pointer: this entry holds the current set (3px accent bar rows). */
  currentSetIndex?: number;
  /** Part 9 §8 (log detail): extra rows rendered at the bottom of THIS entry
   *  (performed table · max weight · rest expand · edit history). The consumer
   *  owns the content — the card only anchors it below the mode bodies, so
   *  multi-exercise groups keep each exercise's rows attached to it. */
  footer?: ReactNode;
}

export interface GroupCardGroup {
  /** Group letter ("A"; empty for solo groups). */
  code: string;
  /** "" | "Superset" | "Triset" | "Giant set". */
  label: string;
  /** 4px bar colour; falls back to the first entry's category colour. */
  colour?: string;
}

export interface GroupCardProps {
  mode: CardMode;
  group: GroupCardGroup;
  entries: GroupCardEntry[];
  /** Omit → fully read-only (no menus/inputs even in log/edit mode). */
  onAction?: (action: CardAction, entryIndex: number) => void;
  /** Global column fallback; per-exercise showRpe/showTempo/showRest win. */
  visibleColumns?: CardVisibleColumns;
  /** ⏱ rest-row expanded (remembered per card for the session — parent state). */
  restExpanded?: boolean;
  onToggleRest?: () => void;
  /** Part 9 §5: screen-provided … menu (REPLACES the per-mode default; e.g. the
   *  day overview passes Rearrange/Replace/Exercise info/Notes). Icons and
   *  actions follow the same GroupMenuItem contract as the built-ins. */
  menuItems?: GroupMenuItem[];
  className?: string;
}

// ---------- … menu (per-mode, §2.2) ----------

export interface GroupMenuItem {
  icon: LucideIcon;
  label: string;
  action: CardAction;
  destructive?: boolean;
}

const NAV_ITEMS: GroupMenuItem[] = [
  { icon: Info, label: "Exercise detail", action: { type: "detail", exerciseId: "" } },
  { icon: History, label: "History", action: { type: "history", exerciseId: "" } },
  { icon: BarChart3, label: "Graph", action: { type: "graph", exerciseId: "" } },
  { icon: Trophy, label: "Records", action: { type: "records", exerciseId: "" } },
  { icon: MessageSquareText, label: "Notes", action: { type: "notes" } },
];

function menuForMode(mode: CardMode): GroupMenuItem[] {
  switch (mode) {
    case "edit":
      return [
        ...NAV_ITEMS,
        { icon: PencilRuler, label: "Edit sets", action: { type: "edit-sets", exerciseId: "" } },
        { icon: Trash2, label: "Remove", action: { type: "remove" }, destructive: true },
      ];
    case "log":
      return [
        ...NAV_ITEMS,
        { icon: Replace, label: "Replace", action: { type: "replace" } },
        { icon: PencilRuler, label: "Edit sets", action: { type: "edit-sets", exerciseId: "" } },
        { icon: Trash2, label: "Remove", action: { type: "remove" }, destructive: true },
      ];
    case "read":
      return [
        { icon: MessageSquareText, label: "Notes", action: { type: "notes" } },
        { icon: Maximize2, label: "Open", action: { type: "open" } },
      ];
    default:
      return NAV_ITEMS;
  }
}

// ---------- reps cell text (§2.2 markers) ----------

function repsCellText(set: CardSet, fields: Array<"weight" | "reps" | "distance" | "timeSec">): string {
  // Part 9 §5: AMRAP prescribed sets spell out "AMRAP" (tap → Term definition).
  // Part 9 §8: performed AMRAP sets carry their actual reps → "AMRAP→{n}".
  const reps =
    set.setType === "AMRAP"
      ? set.reps == null
        ? "AMRAP"
        : `AMRAP→${set.reps}`
      : set.reps == null
        ? "∞"
        : String(set.reps);
  if (!fields.includes("weight")) {
    if (fields.includes("distance") && set.distanceM != null) return `${trimNum(set.distanceM)} m · ${reps}`;
    if (fields.includes("timeSec") && set.timeSec != null) return `${set.timeSec}s · ${reps}`;
    return reps;
  }
  const weight =
    set.weightKind === "COPY_LAST"
      ? "↺"
      : set.weightKind === "PERCENT_1RM" && set.pct != null
        ? `${trimNum(set.pct)}%`
        : set.weightKg != null
          ? trimNum(set.weightKg)
          : "↺";
  return `${weight}·${reps}`;
}

// ---------- GroupCard ----------

const CODE_ROW = "flex h-8 items-center gap-2 px-3";
const NAME_ROW = "flex h-10 items-center gap-1 px-3";
const NOTE_ROW = "flex h-8 items-center gap-2 px-3";
const REPS_ROW = "flex h-10 items-center gap-1 px-3";
const TEMPO_ROW = "flex h-8 items-center gap-2 px-3";
const REST_ROW = "flex h-10 items-center gap-2 px-3";

export function GroupCard({
  mode,
  group,
  entries,
  onAction,
  visibleColumns,
  restExpanded = false,
  onToggleRest,
  menuItems,
  className,
}: GroupCardProps) {
  const [tipOpen, setTipOpen] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const hasActions = onAction != null;
  const barColour = group.colour ?? entries[0]?.exercise.categoryColour ?? "#f97316";
  const menu = hasActions ? (menuItems ?? menuForMode(mode)) : [];
  // Legacy Part 3 modes (template/preview/summary/edit-legacy) render through
  // their own SetRow list below — the Part 8 layout branches do not run.
  const isLegacyRows =
    mode === "template" || mode === "preview" || mode === "summary" || mode === "edit-legacy";
  const layoutMode: "view" | "read" | "edit" | "log" =
    mode === "view" || mode === "read" || mode === "edit" || mode === "log" ? mode : "read";

  // Rest row hidden entirely when no entry carries rest data (§5: restNone
  // exercises always show their "Rest: none" row).
  const anyRest = entries.some((e) => e.restNone || e.sets.some((s) => s.restPlannedSec != null));
  const anyTempo = entries.some((e) => e.sets.some((s) => s.tempo != null && s.tempo !== ""));

  const dispatch = (action: CardAction, entryIndex: number, exerciseId?: string) => {
    if (!onAction) return;
    // exerciseId-bearing actions get the concrete id injected here.
    const a =
      exerciseId && ("exerciseId" in action && (action as { exerciseId?: string }).exerciseId === "")
        ? ({ ...action, exerciseId } as CardAction)
        : action;
    onAction(a, entryIndex);
  };

  return (
    <article
      className={cn("flex overflow-hidden rounded-lg border bg-card", className)}
      aria-label={group.label ? `${group.label} ${group.code}` : (entries[0]?.exercise.name ?? "Group")}
    >
      <div aria-hidden className="w-1 flex-none" style={{ backgroundColor: barColour }} />
      <div className="min-w-0 flex-1 py-1">
        {entries.map((entry, i) => {
          const fields = fieldsForType(entry.exercise.modality) as Array<"weight" | "reps" | "distance" | "timeSec">;
          const e = entry.exercise;
          const collapsed = layoutMode === "log" && entry.collapsed;
          const doneCount = entry.sets.filter((s) => s.done).length;
          const menuForEntry = menu.map((item) => ({
            ...item,
            action:
              "exerciseId" in item.action && (item.action as { exerciseId?: string }).exerciseId === ""
                ? ({ ...item.action, exerciseId: e.id } as CardAction)
                : item.action,
          }));
          return (
            <div key={e.id} className={cn("min-w-0", i > 0 && "mt-3")}>
              {/* 32px code row */}
              <div {...tourAttrs({ id: "groupCard.code", label: "Series code", help: "Group letter and position, e.g. A1.", order: 100 })} className={CODE_ROW}>
                <span className="text-xs font-bold tabular-nums leading-none text-muted-foreground">{entry.code || group.code}</span>
                {group.label ? (
                  <span className="ml-auto text-xs leading-none text-muted-foreground">
                    <Term id={group.label as "Superset" | "Triset" | "Giant set"}>{group.label}</Term>
                  </span>
                ) : null}
              </div>

              {/* 40px name row */}
              <div {...tourAttrs({ id: "groupCard.name", label: "Exercise name", help: "Exercise name; long-press options via the menu.", order: 110 })} className={NAME_ROW}>
                <h3 className="min-w-0 flex-1 truncate text-base font-semibold leading-none">{e.name}</h3>
                {entry.note != null ? (
                  <span className="flex flex-none items-center gap-1 text-xs leading-none text-muted-foreground" aria-label="Has a note">
                    <StickyNote className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : null}
                {e.progressionDelta != null && e.progressionDelta !== 0 ? (
                  <span className="flex-none text-xs font-medium leading-none text-primary">
                    {e.progressionDeload ? "↓ deload" : `↑ +${trimNum(e.progressionDelta)} next`}
                  </span>
                ) : null}
                {collapsed ? (
                  <span className="flex-none text-xs tabular-nums leading-none text-muted-foreground">{doneCount}/{entry.sets.length}</span>
                ) : null}
                {hasActions && menuForEntry.length > 0 ? (
                  <span className="flex flex-none" onClick={(ev) => ev.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          tour={{ id: "groupCard.menu", label: "Options", help: "Detail, history, graph, records, notes, replace or remove.", order: 120 }}
                          className="h-11 w-11 p-0"
                          aria-label={`Options for ${e.name}`}
                        >
                          <MoreVertical className="h-5 w-5" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {menuForEntry.map((item) => (
                          <DropdownMenuItem
                            key={item.label}
                            onClick={() => dispatch(item.action, i)}
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
              </div>

              {/* 📝 note row (§5.4) — 32px single line under the header; tap
                  expands the full text (prose block, exempt from nowrap). */}
              {entry.note ? (
                <>
                  <button
                    type="button"
                    {...tourAttrs({ id: "groupCard.note", label: "Note", help: "Your coaching note for this exercise; tap to expand.", order: 120 })}
                    aria-expanded={noteOpen === e.id}
                    aria-label={`Note for ${e.name}`}
                    onClick={() => setNoteOpen((cur) => (cur === e.id ? null : e.id))}
                    className={cn(NOTE_ROW, "w-full gap-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground")}
                  >
                    <StickyNote className="h-3.5 w-3.5 flex-none text-primary" aria-hidden />
                    <span className="truncate">{noteOpen === e.id ? "Hide note" : "Note"}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground/70">{entry.note}</span>
                    <ChevronDown className={cn("h-3.5 w-3.5 flex-none text-muted-foreground/60 transition-transform", noteOpen !== e.id && "-rotate-90")} aria-hidden />
                  </button>
                  {noteOpen === e.id ? (
                    <p className="mx-3 mb-1 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      {entry.note}
                    </p>
                  ) : null}
                </>
              ) : null}

              {/* 💡 trainer tip toggle (edit mode: drag handle replaces it) */}
              {mode === "edit" && entry.dragHandle != null ? (
                <div className="flex h-8 items-center px-3">{entry.dragHandle}</div>
              ) : entry.tip ? (
                <>
                  <button
                    type="button"
                    {...tourAttrs({ id: "groupCard.tip", label: "Trainer tip", help: "Expand this exercise's trainer tip.", order: 130 })}
                    aria-expanded={tipOpen === e.id}
                    aria-label={`Trainer tip for ${e.name}`}
                    onClick={() => setTipOpen((cur) => (cur === e.id ? null : e.id))}
                    className={cn(TEMPO_ROW, "w-full gap-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground")}
                  >
                    <Lightbulb className="h-4 w-4 flex-none text-amber-500" aria-hidden />
                    <span className="truncate">{tipOpen === e.id ? "Hide tip" : "Trainer tip"}</span>
                  </button>
                  {tipOpen === e.id ? (
                    <p className="mx-3 mb-1 line-clamp-3 rounded-md bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground transition-all duration-150">
                      {entry.tip}
                    </p>
                  ) : null}
                </>
              ) : null}

              {/* mode bodies */}
              {(mode === "view" || mode === "edit") && !collapsed ? (
                <>
                  <div {...tourAttrs({ id: "groupCard.reps", label: "Reps row", help: "Planned reps per set; ↺ copies last time, % is 1RM-based.", order: 140 })} className={REPS_ROW}>
                    <span className="flex-none text-xs font-medium text-muted-foreground">Reps:</span>
                    <span className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto text-sm font-medium tabular-nums leading-none">
                      {entry.sets.map((s) => (
                        <span key={s.id} className="flex-none whitespace-nowrap">
                          {s.setType === "AMRAP" ? (
                            <Term id="AMRAP" className="tabular-nums">{repsCellText(s, fields)}</Term>
                          ) : (
                            repsCellText(s, fields)
                          )}
                        </span>
                      ))}
                      {entry.sets.length === 0 ? <span className="text-muted-foreground">–</span> : null}
                    </span>
                  </div>
                  {anyTempo ? (
                    <div {...tourAttrs({ id: "groupCard.tempo", label: "Tempo row", help: "Planned tempo, e.g. 4/0/1/0 — eccentric, pause, concentric, pause.", order: 150 })} className={TEMPO_ROW}>
                      <Term id="Tempo" className="flex-none text-xs font-medium text-muted-foreground"><span className="text-xs font-medium text-muted-foreground">Tempo:</span></Term>
                      <span className="truncate text-sm tabular-nums leading-none text-muted-foreground">
                        {entry.sets.find((s) => s.tempo)?.tempo?.replace(/-/g, "/") ?? "–"}
                      </span>
                    </div>
                  ) : null}
                  {anyRest ? (
                    <button
                      type="button"
                      {...tourAttrs({ id: "groupCard.rest", label: "Rest row", help: "Planned rest between sets; tap to expand per-set seconds.", order: 160 })}
                      onClick={() => onToggleRest?.()}
                      aria-expanded={restExpanded}
                      className={cn(REST_ROW, "w-full gap-2 text-left")}
                    >
                      <Timer className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
                      {entry.restNone ? (
                        <span className="truncate text-sm leading-none text-muted-foreground">Rest: none</span>
                      ) : restExpanded ? (
                        <span className="truncate text-sm tabular-nums leading-none text-muted-foreground">
                          {entry.sets.length}× · Rest sec: {entry.sets.map((s) => s.restPlannedSec ?? "–").join(" ")}
                        </span>
                      ) : (
                        <span className="text-sm leading-none text-muted-foreground">Rest {entry.sets[0]?.restPlannedSec ?? "–"}s</span>
                      )}
                      <ChevronDown className={cn("ml-auto h-4 w-4 flex-none text-muted-foreground transition-transform", !restExpanded && "-rotate-90")} aria-hidden />
                    </button>
                  ) : null}
                </>
              ) : null}

              {(mode === "read" || isLegacyRows) && mode !== "summary" ? (
                <div className="px-1 pb-1">
                  {entry.sets.map((s) => (
                    <SetRow key={s.id} mode={mode} exercise={e} set={s} visibleColumns={effectiveCols(e, visibleColumns)} />
                  ))}
                </div>
              ) : null}

              {(mode === "log" || mode === "template" || mode === "edit-legacy") && !collapsed ? (
                <div className="px-1">
                  {anyTempo ? (
                    <div className={cn(TEMPO_ROW, "px-2")}>
                      <span className="flex-none text-xs font-medium text-muted-foreground">Tempo:</span>
                      <span className="truncate text-sm tabular-nums leading-none text-muted-foreground">
                        {entry.sets.find((s) => s.tempo)?.tempo?.replace(/-/g, "/") ?? "–"}
                      </span>
                    </div>
                  ) : null}
                  {entry.sets.map((s) => (
                    <SetRow
                      key={s.id}
                      mode={mode === "log" ? "log" : mode}
                      exercise={e}
                      set={s}
                      visibleColumns={effectiveCols(e, visibleColumns)}
                      current={entry.currentSetIndex === s.index - 1}
                      onAction={onAction != null ? (a) => dispatch(a, i) : undefined}
                    />
                  ))}
                  {hasActions ? (
                    <button
                      type="button"
                      data-row
                      {...tourAttrs({ id: "groupCard.addSet", label: "Add set", help: "Append another set to this exercise.", order: 170 })}
                      aria-label={`Add set to ${e.name}`}
                      className={cn(rowBase, "w-full gap-2 px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50")}
                      onClick={() => dispatch({ type: "add-set" }, i)}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      Add set
                    </button>
                  ) : null}
                </div>
              ) : null}

              {/* log mode collapsed tap target */}
              {layoutMode === "log" && collapsed && hasActions ? (
                <button
                  type="button"
                  {...tourAttrs({ id: "groupCard.expand", label: "Expand", help: "Show this exercise's sets.", order: 180 })}
                  aria-label={`Expand ${e.name}`}
                  className={cn(REST_ROW, "w-full px-3 text-left text-sm font-medium text-muted-foreground")}
                  onClick={() => dispatch({ type: "toggle-collapse" }, i)}
                >
                  <ChevronDown className="h-4 w-4 -rotate-90" aria-hidden />
                  Expand sets
                </button>
              ) : null}

              {/* §8 per-entry footer — consumer-owned rows (performed data) */}
              {entry.footer != null ? <div className="mt-1">{entry.footer}</div> : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}

// ---------- helpers ----------

function effectiveCols(exercise: CardExercise, global?: CardVisibleColumns): CardVisibleColumns {
  const base: CardVisibleColumns = global ?? { setType: true, rpe: true, tempo: true, rest: true };
  return {
    setType: base.setType,
    rpe: exercise.showRpe == null ? base.rpe : exercise.showRpe,
    tempo: exercise.showTempo == null ? base.tempo : exercise.showTempo,
    rest: exercise.showRest == null ? base.rest : exercise.showRest,
  };
}

// ---------- GroupCardStack: groups + the between-groups divider (§2.2) ----------

function divideChildren(children: ReactNode): ReactNode[] {
  const items = Children.toArray(children).filter(isValidElement);
  return items.map((child, i) => (
    <div key={child.key ?? String(i)} className="flex flex-col gap-4">
      {i > 0 ? <div aria-hidden className="h-px flex-none bg-muted/30" /> : null}
      {child}
    </div>
  ));
}

/** 16px gap + 1px faded (30% muted) divider BETWEEN groups; none after last. */
export function GroupCardStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-4", className)}>{divideChildren(children)}</div>;
}


// ---------- SoloCard: single-exercise shorthand (migration + singleton groups) ----------

export interface SoloCardProps {
  mode: CardMode;
  exercise: CardExercise;
  sets: CardSet[];
  collapsed?: boolean;
  visibleColumns?: CardVisibleColumns;
  onAction?: (action: CardAction) => void;
  className?: string;
  /** ---- legacy GroupCard props (migration bridge; best-effort rendering) ---- */
  groupColour?: string;
  groupName?: string;
  groupCode?: string;
  hideHeader?: boolean;
  headerLeading?: ReactNode;
  metaExtra?: ReactNode;
  underHeader?: ReactNode;
  tempoPresets?: string[];
}

/**
 * A GroupCard for one exercise (its own group of 1) — the migration bridge
 * for screens that render a single exercise and the canonical way to render
 * any ungrouped exercise. Legacy GroupCard props are accepted so the
 * Part 3 → Part 8 screen migration is a rename.
 */
export function SoloCard({
  mode,
  exercise,
  sets,
  collapsed,
  visibleColumns,
  onAction,
  className,
  groupColour,
  groupCode,
  underHeader,
}: SoloCardProps) {
  return (
    <GroupCard
      mode={mode}
      group={{ code: groupCode ?? "", label: "", colour: groupColour ?? exercise.categoryColour }}
      entries={[{ exercise, sets, code: groupCode ?? "", collapsed }]}
      onAction={onAction != null ? (a) => onAction(a) : undefined}
      visibleColumns={visibleColumns}
      className={className}
    />
  );
}
