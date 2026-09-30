"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BodyTimelineTab — Part 8 §6.7 photo timeline.
//
//   Large slot view (4 slots stacked, 160px each: FRONT/BACK/LEFT/RIGHT)
//   Horizontal scrub strip (56px thumbs, one per weigh-in with photos)
//   Tap/scrub a thumb → the slot view shows that date's photos.
//   `Compare` stays on the compare screen (link row).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { photosApi, mediaApi } from "@/lib/client/api";
import { tourAttrs } from "@/lib/tour/attrs";
import type { TourDecl } from "@/lib/tour/types";
import { cn } from "@/lib/utils";

const SLOTS = ["FRONT", "BACK", "LEFT", "RIGHT"] as const;

/** Static per-slot tour declarations (codegen reads literals only). */
const SLOT_TOUR: Record<(typeof SLOTS)[number], TourDecl> = {
  FRONT: { id: "bodyTimeline.slotFront", label: "Front photo", help: "Front progress photo for the selected date.", order: 10 },
  BACK: { id: "bodyTimeline.slotBack", label: "Back photo", help: "Back progress photo for the selected date.", order: 10 },
  LEFT: { id: "bodyTimeline.slotLeft", label: "Left photo", help: "Left-side progress photo for the selected date.", order: 10 },
  RIGHT: { id: "bodyTimeline.slotRight", label: "Right photo", help: "Right-side progress photo for the selected date.", order: 10 },
};
const SLOT_LABEL: Record<(typeof SLOTS)[number], string> = {
  FRONT: "Front",
  BACK: "Back",
  LEFT: "Left",
  RIGHT: "Right",
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function BodyTimelineTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["photos", "timeline"],
    queryFn: () => photosApi.list(),
  });
  const photos = useMemo(() => data?.photos ?? [], [data]);

  // One entry per record date that has photos, newest first.
  const dates = useMemo(() => {
    const byDate = new Map<string, typeof photos>();
    for (const p of photos) {
      const k = dayKey(p.recordDate);
      byDate.set(k, [...(byDate.get(k) ?? []), p]);
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [photos]);

  const [selected, setSelected] = useState<string | null>(null);
  const activeKey = selected ?? dates[0]?.[0] ?? null;
  const active = dates.find(([k]) => k === activeKey)?.[1] ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading photo timeline">
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  if (dates.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
        <ImageOff className="h-6 w-6 text-muted-foreground" aria-hidden />
        <p className="px-6 text-xs text-muted-foreground">
          Add progress photos from Track to build your photo timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 4 large slots stacked, 160px each */}
      <div className="flex flex-col gap-2">
        {SLOTS.map((slot) => {
          const photo = active.find((p) => p.slot === slot);
          return (
            <div
              key={slot}
              {...tourAttrs(SLOT_TOUR[slot])}
              className="relative flex h-40 items-center justify-center overflow-hidden rounded-lg border bg-muted/40"
              aria-label={`${SLOT_LABEL[slot]} photo ${activeKey ?? ""}`}
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaApi.url(photo.thumbKey || photo.mediaKey)}
                  alt={`${SLOT_LABEL[slot]} — ${activeKey}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs text-muted-foreground">No {SLOT_LABEL[slot].toLowerCase()} photo</span>
              )}
              <span className="absolute left-2 top-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                {SLOT_LABEL[slot]}
              </span>
            </div>
          );
        })}
      </div>

      {/* horizontal scrub strip — 56px thumbs, one per dated entry */}
      <div
        data-row
        role="listbox"
        aria-label="Photo timeline dates"
        {...tourAttrs({ id: "bodyTimeline.strip", label: "Timeline strip", help: "One thumbnail per photo day — tap to scrub the timeline.", order: 20 })}
        className="no-scrollbar flex h-14 w-full items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-lg border bg-card px-2"
      >
        {dates.map(([k, dayPhotos]) => {
          const thumb = dayPhotos[0];
          const isActive = k === activeKey;
          return (
            <button
              key={k}
              type="button"
              role="option"
              aria-selected={isActive}
              onClick={() => setSelected(k)}
              className={cn(
                "relative h-11 w-11 flex-none overflow-hidden rounded-md border-2 transition-colors",
                isActive ? "border-primary" : "border-transparent opacity-80 hover:opacity-100",
              )}
              aria-label={`Photos from ${k}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaApi.url(thumb.thumbKey || thumb.mediaKey)}
                alt={k}
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-x-0 bottom-0 bg-background/80 text-center text-[8px] font-semibold tabular-nums text-muted-foreground">
                {k.slice(5)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Compare view entry (kept from Part 6) */}
      <Button
        type="button"
        variant="outline"
        tour={{ id: "bodyTimeline.compare", label: "Compare", help: "Compare any two dates side by side.", order: 30 }}
        className="h-14 w-full justify-between"
        onClick={() => {
          window.location.hash = "#/body/compare";
        }}
      >
        Compare two dates
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
