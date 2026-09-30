"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ExerciseDetailBody — the §4.2/§5.3 detail content shared by the library entry
// screen (#/library/{key}) and the exercise-overview "About" tab (§4.2b/§5.3).
//
// Part 9 §5.3 presentation (single component, reused by the library):
//   MediaBlock 16:9   video (speed chips) | thumbnail | 0px when no URL —
//                     never a blank box
//   ChipRows 40       Primary muscles · Secondary muscles (muscle chips) ·
//                     Equipment chips (settings-gated glance rows)
//   Rows 48           COLLAPSIBLE: Setup · Position · Target · Equipment
//                     (single-line label + 1-line preview + chevron; tap →
//                     0fr→1fr inline expansion, prose exempt from nowrap,
//                     capped at 160px scrollable). Absent sections → 0px.
//   TipRow 56         "Trainer tip" + 1-line ellipsis; tap → inline expand
//                     capped at 120px. Hidden when trainerTip is null.
//
// Every section collapses to 0px when its data is absent — an exercise with no
// catalog metadata renders a single 96px placeholder instead of empty boxes.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { ChevronDown, Lightbulb, Wrench } from "lucide-react";
import { tourAttrs, type TourAttrs } from "@/lib/tour/attrs";
import type { TourDecl } from "@/lib/tour/types";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { hapticTap } from "@/lib/client/haptics";
import { MediaBlock } from "@/components/shared/media-block";
import { EQUIPMENT_LABELS, MUSCLE_LABELS, muscleColour, type Equipment, type Muscle } from "@/lib/constants";
import { ChipScroller, useMediaQuery } from "./library-shared";

export interface ExerciseDetailData {
  setupNotes?: string | null;
  position?: string | null;
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

type RowKey = "setup" | "position" | "target" | "equipment";

/** One §5.3 collapsible 48px row: label · 1-line preview · chevron. The tour
 *  declaration is passed in by the parent so it stays a STATIC literal. */
function DetailRow({
  rowKey,
  label,
  preview,
  icon,
  tour,
  open,
  onToggle,
  children,
}: {
  rowKey: RowKey;
  label: string;
  preview: string;
  icon?: React.ReactNode;
  tour: TourDecl;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const tourSpread: TourAttrs = tourAttrs(tour);
  return (
    <div className="flex flex-none flex-col">
      <button
        type="button"
        data-row
        aria-expanded={open}
        aria-label={`${label} notes${open ? " (expanded)" : ""}`}
        {...tourSpread}
        onClick={() => {
          hapticTap();
          onToggle();
        }}
        className="flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {icon}
        <span className="flex-none text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="min-w-0 flex-1 truncate text-sm">{preview}</span>
        <ChevronDown className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {/* 0fr→1fr inline expansion — the full content, capped at 160px */}
      <div
        className="grid flex-none transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          {open ? (
            <div
              data-testid={`exercise-detail-${rowKey}-expanded`}
              className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border bg-card px-4 py-3"
            >
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ExerciseDetailBody({ data }: { data: ExerciseDetailData }) {
  const settings = useApp((s) => s.settings);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [expandedRow, setExpandedRow] = useState<RowKey | null>(null);
  const [tipOpen, setTipOpen] = useState(false);

  const showMuscleChips = settings?.showMuscleChips ?? true;
  const showEquipmentChips = settings?.showEquipmentChips ?? true;

  const primary = data.primaryMuscles ?? [];
  const secondary = data.secondaryMuscles ?? [];
  const equipment = data.equipment ?? [];
  const tip = data.trainerTip?.trim() || null;
  const setup = data.setupNotes?.trim() || null;
  const position = data.position?.trim() || null;
  const target = data.targetNotes?.trim() || null;

  const hasMedia = Boolean(data.videoUrl || data.thumbnailUrl);
  const hasAny =
    hasMedia ||
    setup != null ||
    position != null ||
    target != null ||
    equipment.length > 0 ||
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

  const toggleRow = (k: RowKey) => setExpandedRow((prev) => (prev === k ? null : k));

  return (
    <>
      {/* §5.3: video 16:9 (Part 6 media adapter, speed chips) */}
      <MediaBlock
        videoUrl={data.videoUrl ?? null}
        thumbnailUrl={data.thumbnailUrl ?? null}
        height={isDesktop ? 240 : 180}
        aspectVideo
        showVideoPanel={settings?.showVideoPanel ?? true}
      />

      {/* header muscle chips */}
      {showMuscleChips && primary.length > 0 ? (
        <DetailChipRow label="Primary muscles" values={primary} format={muscleLabel} dot={muscleColour} />
      ) : null}
      {showMuscleChips && secondary.length > 0 ? (
        <DetailChipRow label="Secondary muscles" values={secondary} format={muscleLabel} dot={muscleColour} secondary />
      ) : null}
      {/* header equipment chips (glance) */}
      {showEquipmentChips && equipment.length > 0 ? (
        <DetailChipRow label="Equipment" values={equipment} format={equipmentLabel} />
      ) : null}

      {/* §5.3 collapsible 48px rows — prose exempt from nowrap */}
      {setup != null ? (
        <DetailRow
          rowKey="setup"
          label="Setup"
          preview={setup}
          tour={{ id: "exerciseDetail.setupRow", label: "Setup row", help: "How to set up for this exercise; tap to expand.", order: 100 }}
          open={expandedRow === "setup"}
          onToggle={() => toggleRow("setup")}
        >
          <span className="flex-none text-xs font-bold uppercase leading-none tracking-wider text-muted-foreground">Setup</span>
          <p className="min-w-0 text-sm leading-relaxed whitespace-pre-wrap">{setup}</p>
        </DetailRow>
      ) : null}
      {position != null ? (
        <DetailRow
          rowKey="position"
          label="Position"
          preview={position}
          tour={{ id: "exerciseDetail.positionRow", label: "Position row", help: "Body position cues for this exercise; tap to expand.", order: 110 }}
          open={expandedRow === "position"}
          onToggle={() => toggleRow("position")}
        >
          <span className="flex-none text-xs font-bold uppercase leading-none tracking-wider text-muted-foreground">Position</span>
          <p className="min-w-0 text-sm leading-relaxed whitespace-pre-wrap">{position}</p>
        </DetailRow>
      ) : null}
      {target != null ? (
        <DetailRow
          rowKey="target"
          label="Target"
          preview={target}
          tour={{ id: "exerciseDetail.targetRow", label: "Target row", help: "What this exercise targets; tap to expand.", order: 120 }}
          open={expandedRow === "target"}
          onToggle={() => toggleRow("target")}
        >
          <span className="flex-none text-xs font-bold uppercase leading-none tracking-wider text-muted-foreground">Target</span>
          <p className="min-w-0 text-sm leading-relaxed whitespace-pre-wrap">{target}</p>
        </DetailRow>
      ) : null}
      {equipment.length > 0 ? (
        <DetailRow
          rowKey="equipment"
          label="Equipment"
          preview={`${equipment.length} ${equipment.length === 1 ? "item" : "items"}`}
          icon={<Wrench className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />}
          tour={{ id: "exerciseDetail.equipmentRow", label: "Equipment row", help: "The gear this exercise needs; tap to list it.", order: 130 }}
          open={expandedRow === "equipment"}
          onToggle={() => toggleRow("equipment")}
        >
          <span className="flex-none text-xs font-bold uppercase leading-none tracking-wider text-muted-foreground">Equipment</span>
          <ul className="flex min-w-0 flex-col gap-1">
            {equipment.map((e) => (
              <li key={e} className="text-sm leading-relaxed">
                {equipmentLabel(e)}
              </li>
            ))}
          </ul>
        </DetailRow>
      ) : null}

      {tip ? (
        <div className="flex flex-none flex-col">
          <button
            type="button"
            data-row
            aria-expanded={tipOpen}
            aria-label={`Trainer tip${tipOpen ? " (expanded)" : ""}`}
            {...tourAttrs({ id: "exerciseDetail.tip", label: "Trainer tip", help: "Tap to expand the full coaching tip.", order: 110 })}
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
