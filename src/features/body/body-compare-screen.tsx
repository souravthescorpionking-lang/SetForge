"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BodyCompareScreen — #/body/compare (Part 6 §4.14).
//
// Side-by-side progress-photo comparison, primitives-only per the screen laws:
//
//   TopBar (56) : "Compare photos" + default back button.
//   ScrollBody  : slot chip row (40px, All | Front | Back | Left | Right)
//                 → A/B date Selects (distinct photo record dates, desc;
//                 auto-swap keeps A ≠ B) → grid-cols-2 comparison panels
//                 (full images, object-contain, max-h 60vh; placeholder panel
//                 when the slot has no photo on a picked date) → delta line
//                 ("N days apart" + the Body Weight values on those dates).
//
// Data: photosApi.list() (ALL user photos; key family ["photos"] — invalidated
// by the Track tab's attach/remove via photo-keys.ts). Empty state routes to
// Body → Track where photos are added.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CameraOff, ImageIcon } from "lucide-react";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { measurementsApi, mediaApi, photosApi } from "@/lib/client/api";
import { hapticSelection } from "@/lib/client/haptics";
import { qk, useMeasurements } from "@/lib/client/query";
import { dayKeyOf, formatDayShort, parseDayKey, round2 } from "@/lib/client/format";
import { replaceHash } from "@/features/shell/router";
import type { ProgressPhotoDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { signedDelta } from "./body-util";
import { photosKeys } from "./photo-keys";
import { PHOTO_SLOTS, SLOT_LABELS, type PhotoSlot } from "./photo-slots";

type SlotFilter = "ALL" | PhotoSlot;

/** "26 Sep 2026" — day-key to compact full label (years matter when comparing). */
function fullDateLabel(key: string): string {
  return `${formatDayShort(key)} ${parseDayKey(key).getUTCFullYear()}`;
}

const chipClass = (active: boolean) =>
  cn(
    "flex h-10 flex-none items-center rounded-full border px-4 text-sm font-semibold transition-colors",
    active
      ? "border-primary/60 bg-primary/10 text-primary"
      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
  );

export default function BodyCompareScreen() {
  const [slot, setSlot] = useState<SlotFilter | null>(null);
  const [dateA, setDateA] = useState<string | null>(null);
  const [dateB, setDateB] = useState<string | null>(null);

  const photosQuery = useQuery({
    queryKey: photosKeys.all,
    queryFn: () => photosApi.list(),
  });
  const photos = useMemo(() => photosQuery.data?.photos ?? [], [photosQuery.data]);

  // Distinct photo record dates, newest first (slot-independent: picking a date
  // the current slot has no photo for renders the placeholder panel).
  const dates = useMemo(() => {
    const set = new Set(photos.map((p) => p.recordDate));
    return [...set].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [photos]);

  // Default slot: FRONT, else the first slot that has photos (before data
  // arrives the derived value holds so there is no flash of the wrong chip).
  const defaultSlot = useMemo(
    () => (photos.length > 0 ? (PHOTO_SLOTS.find((s) => photos.some((p) => p.slot === s)) ?? "ALL") : "ALL"),
    [photos],
  );
  const activeSlot: SlotFilter = slot ?? defaultSlot;

  // A = oldest photo date, B = newest; stick to the user's pick while it still
  // exists, fall back to defaults after removals change the date list.
  const a = dateA != null && dates.includes(dateA) ? dateA : (dates.at(-1) ?? null);
  const b = dateB != null && dates.includes(dateB) ? dateB : (dates[0] ?? null);

  // Auto-swap keeps A ≠ B (picking one side's date onto the other swaps them).
  const pickA = (d: string) => {
    if (d === b) setDateB(a);
    setDateA(d);
  };
  const pickB = (d: string) => {
    if (d === a) setDateA(b);
    setDateB(d);
  };

  const photoFor = (date: string | null): ProgressPhotoDTO | null => {
    if (!date) return null;
    // photos are createdAt-desc → the first match is the newest for that slot.
    return (
      photos.find((p) => p.recordDate === date && (activeSlot === "ALL" || p.slot === activeSlot)) ?? null
    );
  };
  const photoA = photoFor(a);
  const photoB = b !== a ? photoFor(b) : null; // same date = nothing to compare on B

  const daysApart =
    a != null && b != null && a !== b
      ? Math.abs(Math.round((parseDayKey(b).getTime() - parseDayKey(a).getTime()) / 86_400_000))
      : null;

  // ---- optional nicety: the Body Weight values on the two dates ----
  const { data: measurementsData } = useMeasurements();
  const bodyWeight = useMemo(
    () => measurementsData?.measurements.find((m) => m.name.toLowerCase() === "body weight") ?? null,
    [measurementsData],
  );
  const weightQuery = useQuery({
    queryKey: qk.measurementRecords(bodyWeight?.id ?? ""),
    queryFn: () => measurementsApi.records(bodyWeight!.id),
    enabled: !!bodyWeight,
  });
  const weightFor = (date: string | null): number | null => {
    if (!date || !bodyWeight) return null;
    const rec = (weightQuery.data?.records ?? []).find((r) => dayKeyOf(r.recordedAt) === date);
    return rec?.value ?? null;
  };
  const weightA = a != null && a !== b ? weightFor(a) : null;
  const weightB = b != null && a !== b ? weightFor(b) : null;
  const unitName = bodyWeight?.unit.name ?? "";

  // ---- render ----

  if (photosQuery.isLoading) {
    return (
      <Screen topBar={<TopBar title="Compare photos" actions={<TopBarHelp />} />}>
        <ScrollBody>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-full" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-11 rounded-lg" />
              <Skeleton className="h-11 rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-2 gap-2">
              <Skeleton className="h-72 rounded-lg h-72" />
              <Skeleton className="h-72 rounded-lg h-72" />
            </div>
          </div>
        </ScrollBody>
      </Screen>
    );
  }

  if (photosQuery.isError) {
    return (
      <Screen topBar={<TopBar title="Compare photos" actions={<TopBarHelp />} />}>
        <ScrollBody>
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-10 text-center">
            <p className="text-sm font-semibold">Could not load photos</p>
            <p className="text-xs text-muted-foreground">Check your connection and try again.</p>
            <Button type="button" variant="outline" className="h-11 px-5" tour={{ skipTour: true, reason: "Error-state retry button for the photo query" }} onClick={() => void photosQuery.refetch()}>
              Retry
            </Button>
          </div>
        </ScrollBody>
      </Screen>
    );
  }

  if (photos.length === 0) {
    return (
      <Screen topBar={<TopBar title="Compare photos" actions={<TopBarHelp />} />}>
        <ScrollBody>
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-12 text-center">
            <CameraOff className="h-10 w-10 text-muted-foreground/60" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">Nothing to compare yet</p>
              <p className="text-xs text-muted-foreground">
                No progress photos yet — add them from Body → Track
              </p>
            </div>
            <Button
              type="button"
              className="h-11 px-5 font-semibold"
              tour={{ id: "bodyCompare.goTrack", label: "Go to Track", help: "Jump to the Track tab to add progress photos.", order: 40, when: ["empty"] }}
              onClick={() => replaceHash("#/body?tab=track")}
            >
              Go to Track
            </Button>
          </div>
        </ScrollBody>
      </Screen>
    );
  }

  return (
    <Screen topBar={<TopBar title="Compare photos" actions={<TopBarHelp />} />}>
      <ScrollBody>
        <div className="flex flex-col gap-3">
          {/* slot filter — 40px chips, horizontally scrollable */}
          <div
            data-row
            data-chip-scroller
            role="group"
            aria-label="Filter photos by pose slot"
            className="no-scrollbar flex h-10 w-full flex-none items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
          >
            {(["ALL", ...PHOTO_SLOTS] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={activeSlot === s}
                className={chipClass(activeSlot === s)}
                {...tourAttrs({ id: "bodyCompare.slot", label: "Pose filter", help: "Show one pose or all poses across both dates.", order: 10 })}
                onClick={() => {
                  hapticSelection();
                  setSlot(s);
                }}
              >
                {s === "ALL" ? "All" : SLOT_LABELS[s]}
              </button>
            ))}
          </div>

          {/* A / B date pickers */}
          <div className="grid grid-cols-2 gap-2">
            <Select value={a ?? ""} onValueChange={pickA} {...tourAttrs({ skipTour: true, reason: "Date-A select root renders no DOM node" })}>
              <SelectTrigger
                className="h-11 w-full rounded-lg"
                aria-label="Date A"
                {...tourAttrs({ id: "bodyCompare.dateA", label: "Date A", help: "Pick the earlier photo's date.", order: 20 })}
              >
                <span className="mr-1 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  A
                </span>
                <SelectValue placeholder="Date A" />
              </SelectTrigger>
              <SelectContent>
                {dates.map((d) => (
                  <SelectItem key={d} value={d}>
                    {fullDateLabel(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={b ?? ""} onValueChange={pickB} {...tourAttrs({ skipTour: true, reason: "Date-B select root renders no DOM node" })}>
              <SelectTrigger
                className="h-11 w-full rounded-lg"
                aria-label="Date B"
                {...tourAttrs({ id: "bodyCompare.dateB", label: "Date B", help: "Pick the later photo's date.", order: 30 })}
              >
                <span className="mr-1 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  B
                </span>
                <SelectValue placeholder="Date B" />
              </SelectTrigger>
              <SelectContent>
                {dates.map((d) => (
                  <SelectItem key={d} value={d}>
                    {fullDateLabel(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* side-by-side comparison — grid-cols-2 everywhere; larger on ≥lg */}
          <div className="grid grid-cols-2 gap-2 gap-2">
            <ComparePanel side="A" date={a} photo={photoA} slotLabel={slotLabelFor(activeSlot, photoA)} />
            <ComparePanel side="B" date={b} photo={photoB} slotLabel={slotLabelFor(activeSlot, photoB)} />
          </div>

          {/* delta line */}
          {daysApart != null ? (
            <p className="flex min-h-8 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {daysApart} {daysApart === 1 ? "day" : "days"} apart
              </span>
              {weightA != null && weightB != null ? (
                <span className="tabular-nums">
                  {round2(weightA)} {unitName} → {round2(weightB)} {unitName}{" "}
                  <span className="font-semibold text-foreground">{signedDelta(weightB - weightA)}</span>
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </ScrollBody>
    </Screen>
  );
}

/** Panel caption slot label: the picked slot, or the photo's own slot in All mode. */
function slotLabelFor(slot: SlotFilter, photo: ProgressPhotoDTO | null): string {
  if (slot !== "ALL") return SLOT_LABELS[slot];
  const s = photo?.slot as PhotoSlot | undefined;
  return s != null ? (SLOT_LABELS[s] ?? s) : "—";
}

function ComparePanel({
  side,
  date,
  photo,
  slotLabel,
}: {
  side: "A" | "B";
  date: string | null;
  photo: ProgressPhotoDTO | null;
  slotLabel: string;
}) {
  const dateLabel = date != null ? fullDateLabel(date) : "—";
  return (
    <figure className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      {photo ? (
        <img
          src={mediaApi.url(photo.mediaKey)}
          alt={`${slotLabel} body pose on ${dateLabel}`}
          className="max-h-[60vh] w-full object-contain"
          loading="lazy"
        />
      ) : (
        <div className="flex h-64 items-center justify-center border-b border-dashed bg-muted/30 h-64">
          <div className="flex flex-col items-center gap-1 px-4 text-center text-muted-foreground">
            <ImageIcon className="h-6 w-6" aria-hidden />
            <span className="text-xs font-semibold">
              {date != null && side === "B" ? "Pick a different date to compare" : `No ${slotLabel} photo`}
            </span>
            <span className="text-[11px]">{dateLabel}</span>
          </div>
        </div>
      )}
      <figcaption className="flex h-10 flex-none items-center justify-between gap-2 border-t px-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
            {side}
          </span>
          <span className="truncate text-xs font-semibold tabular-nums">{dateLabel}</span>
        </span>
        <span className="flex-none text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {slotLabel}
        </span>
      </figcaption>
    </figure>
  );
}
