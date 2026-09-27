"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ExerciseDetailBody — the §4.2 detail content shared by the library entry
// screen (#/library/{key}) and the exercise-overview "About" tab (§4.2b).
//
//   MediaBlock   180px mobile / 240px ≥lg (video w/ speed chips | thumbnail |
//                0px when no URL — never a blank box)
//   TileRow 72   "Setup" | "Target" tiles (12px uppercase label + 2-line
//                clamp); tap → inline expand (0fr→1fr grid) to the full text,
//                capped at 160px (scrollable)
//   ChipRows 40  Primary muscles · Secondary muscles (empty or
//                showMuscleChips=false → 0px) · Equipment (showEquipmentChips)
//   TipRow 56    "Trainer tip" + 1-line ellipsis; tap → inline expand capped
//                at 120px. Hidden when trainerTip is null.
//
// Every section collapses to 0px when its data is absent — an exercise with no
// catalog metadata renders a single 96px placeholder instead of empty boxes.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { hapticTap } from "@/lib/client/haptics";
import { MediaBlock } from "@/components/shared/media-block";
import { EQUIPMENT_LABELS, MUSCLE_LABELS, muscleColour, type Equipment, type Muscle } from "@/lib/constants";
import { ChipScroller, useMediaQuery } from "./library-shared";

export interface ExerciseDetailData {
  setupNotes?: string | null;
  targetNotes?: string | null;
  trainerTip?: string | null;
  primaryMuscles?: readonly string[];
  secondaryMuscles?: readonly string[];
  equipment?: readonly string[];
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
}

const muscleLabel = (m: string) => MUSCLE_LABELS[m as Muscle] ?? m.replace(/_/g, " ").toLowerCase();
const equipmentLabel = (e: string) => EQUIPMENT_LABELS[e as Equipment] ?? e.replace(/_/g, " ").toLowerCase();

/** 12px uppercase leading label rendered INSIDE the 40px chip scroller (MuscleChipRow visual). */
function DetailChipRow({
  label,
  values,
  format,
  dot,
  secondary,
}: {
  label: string;
  values: readonly string[];
  format: (v: string) => string;
  dot?: (v: string) => string;
  secondary?: boolean;
}) {
  return (
    <ChipScroller label={label}>
      <span className="flex-none text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {values.map((v) => (
        <span
          key={v}
          title={secondary ? `${format(v)} (secondary)` : format(v)}
          className={cn(
            "flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 text-xs font-semibold",
            secondary ? "bg-muted/30 text-muted-foreground" : "bg-card",
          )}
        >
          {dot ? <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: dot(v) }} aria-hidden /> : null}
          {format(v)}
        </span>
      ))}
    </ChipScroller>
  );
}

type TileKey = "setup" | "target";

export function ExerciseDetailBody({ data }: { data: ExerciseDetailData }) {
  const settings = useApp((s) => s.settings);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [expandedTile, setExpandedTile] = useState<TileKey | null>(null);
  const [tipOpen, setTipOpen] = useState(false);

  const showMuscleChips = settings?.showMuscleChips ?? true;
  const showEquipmentChips = settings?.showEquipmentChips ?? true;

  const tiles: Array<{ key: TileKey; label: string; text: string }> = [];
  if (data.setupNotes?.trim()) tiles.push({ key: "setup", label: "Setup", text: data.setupNotes.trim() });
  if (data.targetNotes?.trim()) tiles.push({ key: "target", label: "Target", text: data.targetNotes.trim() });

  const primary = data.primaryMuscles ?? [];
  const secondary = data.secondaryMuscles ?? [];
  const equipment = data.equipment ?? [];
  const tip = data.trainerTip?.trim() || null;
  const expandedTileText = tiles.find((t) => t.key === expandedTile)?.text ?? null;

  const hasMedia = Boolean(data.videoUrl || data.thumbnailUrl);
  const hasAny =
    hasMedia ||
    tiles.length > 0 ||
    (showMuscleChips && (primary.length > 0 || secondary.length > 0)) ||
    (showEquipmentChips && equipment.length > 0) ||
    tip != null;

  if (!hasAny) {
    return (
      <div className="flex h-[96px] flex-none flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center">
        <p className="text-sm font-semibold">No details yet</p>
        <p className="text-xs text-muted-foreground">This exercise has no catalog metadata.</p>
      </div>
    );
  }

  return (
    <>
      <MediaBlock
        videoUrl={data.videoUrl ?? null}
        thumbnailUrl={data.thumbnailUrl ?? null}
        height={isDesktop ? 240 : 180}
        showVideoPanel={settings?.showVideoPanel ?? true}
      />

      {tiles.length > 0 ? (
        <div className="flex flex-none flex-col">
          <div className={cn("grid gap-2", tiles.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
            {tiles.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-expanded={expandedTile === t.key}
                aria-label={`${t.label} notes${expandedTile === t.key ? " (expanded)" : ""}`}
                onClick={() => {
                  hapticTap();
                  setExpandedTile((prev) => (prev === t.key ? null : t.key));
                }}
                className="flex h-18 flex-col items-start justify-start gap-1 overflow-hidden rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex-none text-xs font-bold uppercase leading-none tracking-wider text-muted-foreground">
                  {t.label}
                </span>
                <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-tight">{t.text}</span>
              </button>
            ))}
          </div>
          {/* 0fr→1fr inline expansion — the full text, capped at 160px */}
          <div
            className="grid flex-none transition-[grid-template-rows] duration-200 ease-out"
            style={{ gridTemplateRows: expandedTileText ? "1fr" : "0fr" }}
          >
            <div className="min-h-0 overflow-hidden">
              {expandedTileText ? (
                <div className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border bg-card px-4 py-3">
                  <span className="flex-none text-xs font-bold uppercase leading-none tracking-wider text-muted-foreground">
                    {tiles.find((t) => t.key === expandedTile)?.label}
                  </span>
                  <p className="min-w-0 text-sm leading-relaxed whitespace-pre-wrap">{expandedTileText}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showMuscleChips && primary.length > 0 ? (
        <DetailChipRow label="Primary muscles" values={primary} format={muscleLabel} dot={muscleColour} />
      ) : null}
      {showMuscleChips && secondary.length > 0 ? (
        <DetailChipRow label="Secondary muscles" values={secondary} format={muscleLabel} dot={muscleColour} secondary />
      ) : null}
      {showEquipmentChips && equipment.length > 0 ? (
        <DetailChipRow label="Equipment" values={equipment} format={equipmentLabel} />
      ) : null}

      {tip ? (
        <div className="flex flex-none flex-col">
          <button
            type="button"
            data-row
            aria-expanded={tipOpen}
            aria-label={`Trainer tip${tipOpen ? " (expanded)" : ""}`}
            onClick={() => {
              hapticTap();
              setTipOpen((v) => !v);
            }}
            className="flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Lightbulb className="h-4 w-4 flex-none text-primary" aria-hidden />
            <span className="flex-none text-xs font-bold uppercase tracking-wider text-muted-foreground">Trainer tip</span>
            <span className="min-w-0 flex-1 truncate text-sm">{tip}</span>
            <ChevronDown
              className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", tipOpen && "rotate-180")}
              aria-hidden
            />
          </button>
          {/* 0fr→1fr inline expansion — the full tip, capped at 120px */}
          <div
            className="grid flex-none transition-[grid-template-rows] duration-200 ease-out"
            style={{ gridTemplateRows: tipOpen ? "1fr" : "0fr" }}
          >
            <div className="min-h-0 overflow-hidden">
              {tipOpen ? (
                <div className="mt-2 flex max-h-[120px] flex-col gap-1 overflow-y-auto rounded-lg border bg-card px-4 py-3">
                  <span className="flex-none text-xs font-bold uppercase leading-none tracking-wider text-muted-foreground">
                    Trainer tip
                  </span>
                  <p className="min-w-0 text-sm leading-relaxed whitespace-pre-wrap">{tip}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
