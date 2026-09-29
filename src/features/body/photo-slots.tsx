"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PhotoSlots — §4.14 progress-photo section of the Track inline editor.
//
//   • 4 fixed 72px slot squares (FRONT / BACK / LEFT / RIGHT — the schema's
//     slot enum) under a muted mini header. Filled slot = thumbnail
//     (thumbKey ?? mediaKey) + tap-to-replace + floating × remove; empty slot =
//     dashed Camera placeholder + tap-to-upload.
//   • Upload = one hidden <input type=file capture=environment> PER SLOT
//     (slot-bound onChange, data-photo-slot attr) → mediaApi.upload →
//     photosApi.attach (UPSERT per slot). Per-slot spinner while in flight.
//   • Photos attach to a MeasurementRecord. The editor binds its selected date
//     to a record (parent-owned records query); when none exists yet, tapping a
//     slot first creates the entry with the editor's current value (the same
//     thing "Save entry" does) so a weigh-in + photo is one flow.
//   • MEDIA_PROVIDER=none → upload 403 MEDIA_DISABLED → toast explains, UI
//     stays visible (per the Part 6 media contract).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2, X } from "lucide-react";
import { tourAttrs } from "@/lib/tour/attrs";
import { ApiError, measurementsApi, mediaApi, photosApi } from "@/lib/client/api";
import { hapticSuccess } from "@/lib/client/haptics";
import { useInvalidate } from "@/lib/client/query";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDayLabel } from "@/lib/client/format";
import type { MeasurementDTO, MeasurementRecordDTO, ProgressPhotoDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { dateInputToIso } from "./body-util";
import { invalidatePhotos, photosKeys } from "./photo-keys";

export const PHOTO_SLOTS = ["FRONT", "BACK", "LEFT", "RIGHT"] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

export const SLOT_LABELS: Record<PhotoSlot, string> = {
  FRONT: "Front",
  BACK: "Back",
  LEFT: "Left",
  RIGHT: "Right",
};

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

type Props = {
  measurement: MeasurementDTO;
  /** The record bound to the editor's selected date (null = none yet). */
  record: MeasurementRecordDTO | null;
  recordsLoading: boolean;
  /** Current editor value/date — used to auto-create the record on upload. */
  value: string;
  date: string;
};

export function PhotoSlots({ measurement: m, record, recordsLoading, value, date }: Props) {
  const qc = useQueryClient();
  const inv = useInvalidate();
  const fileRefs = useRef<Record<PhotoSlot, HTMLInputElement | null>>({
    FRONT: null,
    BACK: null,
    LEFT: null,
    RIGHT: null,
  });
  const [uploadingSlot, setUploadingSlot] = useState<PhotoSlot | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // Record auto-created by an upload while the parent query catches up — reuse
  // it for further slot taps instead of creating a second record.
  const createdIdRef = useRef<string | null>(null);

  useEffect(() => {
    createdIdRef.current = null;
  }, [date]);

  const photosQuery = useQuery({
    queryKey: photosKeys.record(record?.id ?? ""),
    queryFn: () => photosApi.list({ recordId: record!.id }),
    enabled: !!record,
  });
  const photos = useMemo(() => photosQuery.data?.photos ?? [], [photosQuery.data]);
  const bySlot = useMemo(() => {
    const map = new Map<string, ProgressPhotoDTO>();
    for (const p of photos) map.set(p.slot, p);
    return map;
  }, [photos]);

  const busy = uploadingSlot != null || removingId != null;

  const pick = (slot: PhotoSlot) => {
    if (busy) return;
    fileRefs.current[slot]?.click();
  };

  const onFile = async (slot: PhotoSlot, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Unsupported file — use a JPEG, PNG or WebP image");
      return;
    }

    setUploadingSlot(slot);
    try {
      // Resolve the target record (existing on this date, the one an earlier
      // upload just created, or a fresh one created with the editor's value).
      let recordId = record?.id ?? createdIdRef.current;
      let createdRecord = false;
      if (!recordId) {
        const n = Number(value);
        if (value.trim() === "" || !Number.isFinite(n) || n < 0) {
          toast.error("Enter a valid value first");
          return;
        }
        const recordedAt = dateInputToIso(date);
        const created = await measurementsApi.addRecord(m.id, {
          value: n,
          ...(recordedAt ? { recordedAt } : {}),
        });
        recordId = created.id;
        createdIdRef.current = created.id;
        createdRecord = true;
      }

      const up = await mediaApi.upload(file);
      await photosApi.attach(m.id, recordId, {
        slot,
        mediaKey: up.key,
        width: up.width,
        height: up.height,
      });
      hapticSuccess();
      toast.success("Photo saved");
      if (createdRecord) inv.measurements();
      invalidatePhotos(qc);
    } catch (err) {
      if (err instanceof ApiError && err.code === "MEDIA_DISABLED") {
        toast.error("Photo uploads are disabled on this server");
      } else {
        toast.error(err instanceof ApiError ? err.message : "Could not save photo");
      }
    } finally {
      setUploadingSlot(null);
    }
  };

  const remove = async (photo: ProgressPhotoDTO) => {
    if (busy) return;
    setRemovingId(photo.id);
    try {
      await photosApi.remove(photo.id);
      hapticSuccess();
      toast.success("Photo removed");
      invalidatePhotos(qc);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove photo");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <section aria-label={`Progress photos for ${m.name}`} className="flex flex-none flex-col gap-1.5 rounded-lg border bg-muted/20 p-2">
      <div className="flex h-5 items-center justify-between overflow-hidden">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Progress photos</span>
        <span className="truncate text-[11px] text-muted-foreground">{formatDayLabel(date)}</span>
      </div>

      {recordsLoading || (record != null && photosQuery.isLoading) ? (
        <div className="flex flex-wrap gap-2">
          {PHOTO_SLOTS.map((s) => (
            <div key={s} className="flex w-[72px] flex-none flex-col items-center gap-1">
              <Skeleton className="h-[72px] w-[72px] rounded-lg" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {SLOT_LABELS[s]}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <>
          {record == null ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              No {m.name} entry on this date yet — adding a photo logs one with the value above.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {PHOTO_SLOTS.map((slot) => {
              const photo = bySlot.get(slot);
              const uploading = uploadingSlot === slot;
              const label = SLOT_LABELS[slot];
              return (
                <div key={slot} className="flex w-[72px] flex-none flex-col items-center gap-1">
                  <div className="relative h-[72px] w-[72px] flex-none">
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={photo ? `Replace ${label} photo` : `Add ${label} photo`}
                      {...tourAttrs({ id: "body.photoSlot", label: "Photo slot", help: "Tap to attach a progress photo for this pose.", order: 80 })}
                      onClick={() => pick(slot)}
                      className={cn(
                        "flex h-full w-full items-center justify-center overflow-hidden rounded-lg transition-colors",
                        photo
                          ? "border border-border bg-card"
                          : "border border-dashed border-border bg-card/50 hover:border-primary/60 hover:bg-primary/5",
                        busy && "opacity-60",
                      )}
                    >
                      {uploading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
                      ) : photo ? (
                        <img
                          src={mediaApi.url(photo.thumbKey ?? photo.mediaKey)}
                          alt={`${label} pose photo`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Camera className="h-5 w-5 text-muted-foreground" aria-hidden />
                      )}
                    </button>
                    {photo && !uploading ? (
                      <button
                        type="button"
                        aria-label={`Remove ${label} photo`}
                        disabled={busy}
                        {...tourAttrs({ skipTour: true, reason: "Per-slot photo remove glyph on filled slots" })}
                        onClick={() => void remove(photo)}
                        className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </span>
                  <input
                    ref={(el) => {
                      fileRefs.current[slot] = el;
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    data-photo-slot={slot}
                    className="hidden"
                    aria-hidden
                    tabIndex={-1}
                    onChange={(e) => void onFile(slot, e)}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
