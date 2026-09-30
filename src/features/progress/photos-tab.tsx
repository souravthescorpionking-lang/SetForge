"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PhotosTab — the §8.1 Photos tab: 3-column grid grouped by pose label
// (Front · Back · Left · Right — the schema's slot enum). Tap a photo → the
// existing Part 6 photo timeline (#/body?tab=timeline). Empty: one sentence
// + the Log action (photos attach to weigh-ins via #/progress/log).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ImageOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { mediaApi, photosApi } from "@/lib/client/api";
import { formatDayShort } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import type { ProgressPhotoDTO } from "@/lib/types";

const SLOTS = ["FRONT", "BACK", "LEFT", "RIGHT"] as const;
const SLOT_LABELS: Record<(typeof SLOTS)[number], string> = {
  FRONT: "Front",
  BACK: "Back",
  LEFT: "Left",
  RIGHT: "Right",
};

export function PhotosTab() {
  const navigate = useApp((s) => s.navigate);
  const photosQuery = useQuery({
    queryKey: ["photos", "progress"],
    queryFn: () => photosApi.list(),
    staleTime: 30_000,
  });
  const photos = useMemo(() => photosQuery.data?.photos ?? [], [photosQuery.data]);

  const bySlot = useMemo(() => {
    const map = new Map<string, ProgressPhotoDTO[]>();
    for (const p of photos) {
      map.set(p.slot, [...(map.get(p.slot) ?? []), p]);
    }
    return map;
  }, [photos]);

  if (photosQuery.isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading progress photos">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div
        data-row
        className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-sm text-muted-foreground"
      >
        <span className="min-w-0 flex-1 truncate">No progress photos yet.</span>
        <button
          type="button"
          {...tourAttrs({ id: "progress.photosLog", label: "Log", help: "Add photos with your next weigh-in.", order: 10 })}
          onClick={() => navigate("/progress/log")}
          className="flex h-9 flex-none items-center rounded-md px-3 text-sm font-semibold text-primary transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Log
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {SLOTS.map((slot) => {
        const slotPhotos = bySlot.get(slot) ?? [];
        if (slotPhotos.length === 0) return null;
        return (
          <section key={slot} aria-label={`${SLOT_LABELS[slot]} photos`} className="flex flex-col gap-1.5">
            <p className="flex h-6 flex-none items-center overflow-hidden whitespace-nowrap px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span className="truncate">
                {SLOT_LABELS[slot]} · {slotPhotos.length}
              </span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {slotPhotos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  data-row
                  {...tourAttrs({
                    id: "progress.photoTile",
                    label: "Progress photo",
                    help: "A progress photo for this pose. Tap to open the photo timeline.",
                    order: 20,
                  })}
                  onClick={() => navigate("/body?tab=timeline")}
                  aria-label={`${SLOT_LABELS[slot]} photo from ${formatDayShort(photo.recordDate)}`}
                  className={cn(
                    "relative flex h-[104px] min-w-0 items-center justify-center overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/40",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  )}
                >
                  <img
                    src={mediaApi.url(photo.thumbKey ?? photo.mediaKey)}
                    alt={`${SLOT_LABELS[slot]} pose photo from ${formatDayShort(photo.recordDate)}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <span className="absolute inset-x-0 bottom-0 flex h-6 items-center justify-center bg-background/80 text-[10px] font-semibold tabular-nums text-foreground backdrop-blur-sm">
                    {formatDayShort(photo.recordDate)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <button
        type="button"
        {...tourAttrs({ id: "progress.photosTimeline", label: "Photo timeline", help: "Open the full photo timeline and compare view.", order: 30 })}
        onClick={() => navigate("/body?tab=timeline")}
        className="flex h-10 w-full items-center justify-center gap-1 rounded-lg text-sm font-semibold text-primary transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ImageOff className="h-4 w-4" aria-hidden />
        <span className="truncate">Photo timeline &amp; compare</span>
        <ChevronRight className="h-4 w-4 flex-none" aria-hidden />
      </button>
    </div>
  );
}
