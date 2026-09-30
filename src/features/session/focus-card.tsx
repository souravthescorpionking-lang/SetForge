"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FocusCard — Part 10 §3.1: the sticky top-of-scroll "what you're lifting now"
// card on #/session. ONE SetRow in its `focus` variant (L2) renders R5; the
// card is presentation only — every mutation flows through the screen's
// onAction (the same SetRow action contract the Overview cards use).
//
//   R6 (optional) 16:9 media ABOVE R1 when exercise.videoUrl exists and the
//        user hasn't collapsed it (per-exercise localStorage). Speed chip in
//        the corner → ActionList 0.5×…1.5× → UserSettings.videoSpeed (§3.1).
//   R1 40  "{Series label} · {A1}" left · "{n}/{N} sets" right
//   R2 48  exercise name (truncate) · 📝 when a note exists · … live menu
//   R3 40  "{SetType label} · target {reps} reps" · "Max logged {v}{unit}" right
//   R4 32  "Tempo {x/x/x/x}" / "Tempo none" — hidden when showTempo=false
//   R5 56  the focus SetRow (bigger inputs, no index column)
//
// Collapsed (scroll > 80px): a single 56px row "{A1} {name} · {n}/{N}" —
// tap scrolls back to the top (§3.1). Colour = the exercise's category colour
// on the 4px left bar (L4).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, StickyNote, Video as VideoIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import { hapticTap } from "@/lib/client/haptics";
import { SET_TYPE_META, type SetType } from "@/lib/constants";
import { MediaBlock } from "@/components/shared/media-block";
import { SetRow } from "@/components/set-row/set-row";
import { toCardSet, type CardAction, type CardExercise, type CardSet, type CardVisibleColumns, type GroupMenuItem } from "@/components/group-card";
import { useExerciseMax } from "@/lib/client/query";
import { round1 } from "@/lib/client/format";
import type { SetDTO, SettingsDTO, WorkoutExerciseDTO } from "@/lib/types";
import { useWorkoutSettings } from "./use-workout-settings";

const R1 = "flex h-10 items-center gap-2 px-3";
const R2 = "flex h-12 items-center gap-1 px-3";
const R3 = "flex h-10 items-center gap-2 px-3";
const R4 = "flex h-8 items-center gap-2 px-3";

/** Per-exercise "video collapsed" flag (§3.1 R6) — localStorage IS the
 *  persistence layer (Dexie is absent in this sandbox; see plan deviations). */
function videoHiddenKey(exerciseId: string): string {
  return `sf-live-video:${exerciseId}`;
}

export function FocusCard({
  we,
  set,
  code,
  seriesLabel,
  note,
  cardExercise,
  cardSet,
  sessionTotals,
  collapsed,
  onExpand,
  settings,
  visibleColumns,
  onAction,
  menuItems,
  onMenuAction,
}: {
  /** The focus exercise (null when every set is done → all-done state). */
  we: WorkoutExerciseDTO | null;
  /** The focus set (null → all-done presentation). */
  set: SetDTO | null;
  /** Series code, e.g. "A1". */
  code: string;
  /** "Single" | "Superset" | "Triset" | "Giant set" (group size). */
  seriesLabel: string;
  /** DayOverride note for the exercise (📝 indicator). */
  note: string | null;
  /** Pre-converted CardExercise (the screen's toCardExercise). */
  cardExercise: CardExercise | null;
  /** Pre-converted CardSet of the focus set (index = set position). */
  cardSet: CardSet | null;
  /** §3.1 all-done presentation: session-wide {done, total} (we = null). */
  sessionTotals: { done: number; total: number } | null;
  collapsed: boolean;
  /** Tap on the collapsed row → scroll back to top (expand). */
  onExpand: () => void;
  settings: SettingsDTO | null;
  visibleColumns: CardVisibleColumns;
  /** SetRow action dispatcher for the focus set (R5). */
  onAction: (action: CardAction) => void;
  /** The live ⋮ menu items (Note · Reorder · Replace · Save as session …). */
  menuItems: GroupMenuItem[];
  onMenuAction: (action: CardAction) => void;
}) {
  const ex = we?.exercise ?? null;
  const doneCount = we ? we.sets.filter((s) => s.isComplete).length : 0;
  const totalSets = we ? we.sets.length : 0;
  const { settings: liveSettings, patch } = useWorkoutSettings();
  const maxQuery = useExerciseMax(ex?.id ?? null);

  // §3.1 R6 media collapse flag (per exercise, localStorage).
  const [videoHidden, setVideoHidden] = useState<boolean>(() => {
    if (typeof window === "undefined" || !ex) return false;
    try {
      return window.localStorage.getItem(videoHiddenKey(ex.id)) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined" || !ex) return;
    try {
      window.localStorage.setItem(videoHiddenKey(ex.id), videoHidden ? "1" : "0");
    } catch {
      /* storage blocked */
    }
  }, [videoHidden, ex?.id]);

  if (!we || !ex) {
    return (
      <section
        aria-label="Focus set"
        className="overflow-hidden rounded-lg border bg-card"
      >
        <div className="flex h-14 items-center gap-2 px-3">
          <span className="text-sm font-semibold text-muted-foreground">All sets logged</span>
          {sessionTotals ? (
            <span className="text-sm font-bold tabular-nums text-primary">
              {sessionTotals.done}/{sessionTotals.total}
            </span>
          ) : null}
        </div>
      </section>
    );
  }

  // ---- collapsed state: single 56px row (§3.1) ----
  if (collapsed) {
    return (
      <button
        type="button"
        {...tourAttrs({ id: "focusCard.collapsed", label: "Focus summary", help: "Tap to scroll back to the full focus card.", order: 80 })}
        aria-label={`Focus ${code} ${ex.name} — ${doneCount} of ${totalSets} sets. Tap to expand.`}
        className="flex h-14 w-full items-center gap-2 overflow-hidden rounded-lg border bg-card px-3 text-left whitespace-nowrap transition-colors hover:bg-accent/40"
        onClick={onExpand}
      >
        <span className="text-xs font-bold tabular-nums leading-none text-muted-foreground">{code}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{ex.name}</span>
        <span className="flex-none text-xs font-bold tabular-nums leading-none text-primary">
          {doneCount}/{totalSets}
        </span>
      </button>
    );
  }

  // ---- expanded rows ----
  const typeMeta = set?.setType ? SET_TYPE_META[set.setType as SetType] : null;
  const maxWeight = maxQuery.data?.maxWeight ?? null;
  const unit = cardExercise?.unit ?? "kg";
  const tempo = set?.tempo ?? null;
  const showTempo = settings?.showTempo ?? true;
  const showVideo = !!ex.videoUrl && (settings?.showVideoPanel ?? true) && !videoHidden;

  return (
    <section aria-label="Focus set" className="flex overflow-hidden rounded-lg border bg-card">
      {/* L4: colour = 4px left bar (the focus exercise's category colour) */}
      <div
        aria-hidden
        className="w-1 flex-none"
        style={{ backgroundColor: ex.category?.colour ?? "#f97316" }}
      />
      <div className="min-w-0 flex-1 py-1">
        {/* R6 — optional 16:9 media ABOVE R1 (§3.1) */}
        {showVideo ? (
          <div className="relative mx-2 mt-1">
            <MediaBlock
              videoUrl={ex.videoUrl}
              thumbnailUrl={ex.thumbnailUrl ?? null}
              aspectVideo
              speedControl={{
                speed: liveSettings.videoSpeed,
                onChange: (s) => void patch({ videoSpeed: s }),
                tour: { id: "focusCard.speed", label: "Video speed", help: "Play the demo at 0.5× to 1.5× — saved for every session.", order: 50 },
              }}
            />
            <button
              type="button"
              {...tourAttrs({ id: "focusCard.videoHide", label: "Hide video", help: "Collapse this exercise's demo video for the session.", order: 60 })}
              aria-label="Hide the demo video"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-black/70 text-white backdrop-blur transition-colors hover:bg-black/85"
              onClick={() => {
                hapticTap();
                setVideoHidden(true);
              }}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : ex.videoUrl && (settings?.showVideoPanel ?? true) ? (
          <button
            type="button"
            data-row
            {...tourAttrs({ id: "focusCard.videoShow", label: "Show video", help: "Bring back this exercise's demo video.", order: 70 })}
            className={cn(R4, "mx-2 mt-1 w-[calc(100%-1rem)] gap-2 rounded-md border border-dashed text-xs font-medium text-muted-foreground transition-colors hover:text-foreground")}
            onClick={() => {
              hapticTap();
              setVideoHidden(false);
            }}
          >
            <VideoIcon className="h-4 w-4 flex-none" aria-hidden />
            Show demo video
          </button>
        ) : null}

        {/* R1 40 — series label · member code · set progress */}
        <div data-row className={cn(R1, "whitespace-nowrap")}>
          <span className="flex-none text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {seriesLabel}
          </span>
          <span className="flex-none text-xs font-bold leading-none text-muted-foreground">·</span>
          <span className="flex-none text-xs font-bold tabular-nums leading-none text-foreground">{code}</span>
          <span className="ml-auto flex-none text-xs font-bold tabular-nums leading-none text-muted-foreground">
            {doneCount}/{totalSets} sets
          </span>
        </div>

        {/* R2 48 — name · 📝 · … live menu */}
        <div data-row className={cn(R2, "whitespace-nowrap")}>
          <h3 className="min-w-0 flex-1 truncate text-base font-semibold leading-none">{ex.name}</h3>
          {note ? (
            <span className="flex flex-none items-center gap-1 text-xs leading-none text-muted-foreground" aria-label="Has a note">
              <StickyNote className="h-3.5 w-3.5" aria-hidden />
            </span>
          ) : null}
          <span className="flex flex-none" onClick={(ev) => ev.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  tour={{ id: "focusCard.menu", label: "Exercise menu", help: "Note, reorder, group, replace, save as session, transition rest, add exercise.", order: 40 }}
                  className="h-11 w-11 p-0"
                  aria-label={`Actions for ${ex.name}`}
                >
                  <MoreVertical className="h-5 w-5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {menuItems.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    className={item.destructive ? "text-destructive focus:text-destructive" : undefined}
                    onClick={() => onMenuAction(item.action)}
                  >
                    <item.icon className="h-4 w-4" aria-hidden />
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>

        {/* R3 40 — set type · target reps · max logged (§3.1) */}
        <div data-row className={cn(R3, "whitespace-nowrap")}>
          <span className="min-w-0 flex-1 truncate text-xs font-medium leading-none text-muted-foreground">
            {typeMeta ? typeMeta.label : "Set"}
            <span className="mx-1">·</span>
            target {set?.reps != null ? set.reps : "–"} reps
          </span>
          <span className="flex-none text-xs font-bold leading-none tabular-nums text-muted-foreground">
            Max logged{" "}
            {maxWeight != null ? (
              <span className="text-foreground">
                {round1(maxWeight)} {unit}
              </span>
            ) : (
              "—"
            )}
          </span>
        </div>

        {/* R4 32 — tempo (hidden when showTempo=false) */}
        {showTempo ? (
          <div data-row className={cn(R4, "whitespace-nowrap")}>
            <span className="min-w-0 flex-1 truncate text-xs font-medium leading-none text-muted-foreground">
              Tempo {tempo ? tempo.replace(/-/g, "/") : "none"}
            </span>
          </div>
        ) : null}

        {/* R5 56 — the focus SetRow (L2: ONE SetRow, focus variant) */}
        {cardSet && cardExercise ? (
          <div className="px-1">
            <SetRow
              mode="log"
              variant="focus"
              exercise={cardExercise}
              set={cardSet}
              visibleColumns={visibleColumns}
              current
              onAction={onAction}
            />
          </div>
        ) : (
          <div data-row className={cn(R3, "whitespace-nowrap text-muted-foreground")}>
            <span className="min-w-0 flex-1 truncate text-xs font-medium leading-none">
              Every set logged — End workout to finish
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

/** Convert a focus SetDTO into the CardSet contract (distance km→m like the
 *  Overview cards; index = the set's 1-based position). */
export function focusCardSet(set: SetDTO, indexOneBased: number): CardSet {
  return toCardSet(
    { ...set, distance: set.distance != null ? set.distance * 1000 : null },
    indexOneBased,
  );
}
