"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LogWeighInScreen — #/progress/log?date= (Part 10 §8.2).
//
//   TopBar (56)   [◀] "Log weigh-in" | [Save]
//   ScrollBody    Week strip (7 × 40 cells Mon-Sun, ◀ ▶ paging, future days
//                 dimmed + toast) + Yesterday · Today chips (week-strip.tsx)
//                 Weight numeric input + unit chip (the measurement's unit)
//                 "Photos (optional)" — 4 slots (Front · Back · Left · Right;
//                 Add → ActionList Take photo / Choose from library → native
//                 file input (capture=environment for take-photo) → media
//                 adapter upload → preview + ✕ remove)
//
// Save upserts the weight MeasurementRecord for the date (the existing
// measurement upsert path: update the day's record or create one) and attaches
// the pending photos (ProgressPhoto rows with slot). WeighInDays only feeds
// notifications later — a no-op here.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { ActionList } from "@/components/shared/action-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, Check, Loader2, Plus, X } from "lucide-react";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { useInvalidate } from "@/lib/client/query";
import { ApiError, mediaApi, measurementsApi, photosApi } from "@/lib/client/api";
import { formatDayLabel, round1 } from "@/lib/client/format";
import { hapticSuccess } from "@/lib/client/haptics";
import { errorMessage } from "@/features/routines/screen-helpers";
import { dateInputToIso } from "@/features/body/body-util";
import { PHOTO_SLOTS, SLOT_LABELS, type PhotoSlot } from "@/features/body/photo-slots";
import { invalidatePhotos, photosKeys } from "@/features/body/photo-keys";
import { useBodyWeight, localDayKey } from "@/features/body/use-body-weight";
import { replaceHash, useHashRoute } from "@/features/shell/router";
import { WeekStrip } from "./week-strip";
import { cn } from "@/lib/utils";
import type { MediaUploadResultDTO } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

function todayLocalKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** One pending (not yet attached) photo upload. */
type PendingPhoto = {
  slot: PhotoSlot;
  key: string;
  thumbKey: string;
  width: number;
  height: number;
};

export default function LogWeighInScreen() {
  const navigate = useApp((s) => s.navigate);
  const route = useHashRoute();
  const invalidate = useInvalidate();
  const qc = useQueryClient();

  // ?date= (local day key; future dates clamp to today — the guard is §8.2)
  const dateParam = route.name === "progress-log" ? route.query.get("date") : null;
  const initialDate =
    dateParam && DATE_RE.test(dateParam) && dateParam <= todayLocalKey() ? dateParam : todayLocalKey();
  const [date, setDate] = useState(initialDate);

  const { measurement, records, unit, loading } = useBodyWeight();

  // The record bound to the selected date (null = none yet) — the upsert target.
  const record = useMemo(
    () => records.find((r) => localDayKey(r.recordedAt) === date) ?? null,
    [records, date],
  );

  // Existing photos for that record (removable inline).
  const photosQuery = useQuery({
    queryKey: photosKeys.record(record?.id ?? ""),
    queryFn: () => photosApi.list({ recordId: record!.id }),
    enabled: !!record,
  });
  const existingPhotos = useMemo(() => photosQuery.data?.photos ?? [], [photosQuery.data]);

  // Weight input — prefilled from the day's record when one exists.
  const [value, setValue] = useState<string>("");
  useEffect(() => {
    setValue(record ? String(round1(record.value)) : "");
  }, [record]);

  // Pending uploads (uploaded to the media adapter, attached on Save).
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [uploadingSlot, setUploadingSlot] = useState<PhotoSlot | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Two hidden inputs per slot: capture (Take photo) + plain (Choose from library).
  const captureRefs = useRef<Record<PhotoSlot, HTMLInputElement | null>>({
    FRONT: null, BACK: null, LEFT: null, RIGHT: null,
  });
  const libraryRefs = useRef<Record<PhotoSlot, HTMLInputElement | null>>({
    FRONT: null, BACK: null, LEFT: null, RIGHT: null,
  });

  useEffect(() => {
    // drop pending uploads when the date changes (they belong to the old day)
    setPending([]);
  }, [date]);

  const previewOf = (slot: PhotoSlot): { url: string; pending: boolean } | null => {
    const existing = existingPhotos.find((p) => p.slot === slot);
    if (existing) return { url: mediaApi.url(existing.thumbKey ?? existing.mediaKey), pending: false };
    const p = pending.find((x) => x.slot === slot);
    if (p) return { url: mediaApi.url(p.thumbKey), pending: true };
    return null;
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
      const up: MediaUploadResultDTO = await mediaApi.upload(file);
      setPending((prev) => [
        ...prev.filter((x) => x.slot !== slot),
        { slot, key: up.key, thumbKey: up.thumbKey, width: up.width, height: up.height },
      ]);
      hapticSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.code === "MEDIA_DISABLED") {
        toast.error("Photo uploads are disabled on this server");
      } else {
        toast.error(err instanceof ApiError ? err.message : "Could not upload photo");
      }
    } finally {
      setUploadingSlot(null);
    }
  };

  const removePending = (slot: PhotoSlot) => {
    setPending((prev) => prev.filter((x) => x.slot !== slot));
  };

  const removeExisting = async (photoId: string) => {
    if (removingKey) return;
    setRemovingKey(photoId);
    try {
      await photosApi.remove(photoId);
      invalidatePhotos(qc);
      toast.success("Photo removed");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRemovingKey(null);
    }
  };

  const save = async () => {
    if (saving || !measurement) return;
    const n = Number(value);
    if (value.trim() === "" || !Number.isFinite(n) || n <= 0) {
      toast.error("Enter a valid weight");
      return;
    }
    setSaving(true);
    try {
      const recordedAt = dateInputToIso(date) ?? new Date().toISOString();
      // Upsert the weight record for the date (the existing measurement path).
      const savedRecord = record
        ? await measurementsApi.updateRecord(measurement.id, record.id, { value: n, recordedAt })
        : await measurementsApi.addRecord(measurement.id, { value: n, recordedAt });
      // Attach the pending photos (one ProgressPhoto per slot).
      for (const p of pending) {
        await photosApi.attach(measurement.id, savedRecord.id, {
          slot: p.slot,
          mediaKey: p.key,
          width: p.width,
          height: p.height,
        });
      }
      invalidate.measurements();
      invalidatePhotos(qc);
      hapticSuccess();
      toast.success(`Weigh-in saved — ${round1(n)} ${unit}`);
      navigate("/progress");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const weightParsed = Number(value);
  const weightValid = value.trim() !== "" && Number.isFinite(weightParsed) && weightParsed > 0;

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/progress" label="Back" />}
          title="Log weigh-in"
          actions={
            <Button
              type="button"
              className="h-11 px-4 font-semibold"
              disabled={saving || loading || !measurement || !weightValid}
              tour={{
                id: "progressLog.save",
                label: "Save",
                help: "Store the weigh-in for the picked day (photos included).",
                order: 70,
              }}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save
            </Button>
          }
        />
      }
    >
      <ScrollBody>
        {/* Week strip + Yesterday · Today chips */}
        <div className="flex w-full flex-none flex-col gap-1.5">
          <p className="flex h-6 flex-none items-center overflow-hidden whitespace-nowrap px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <span className="truncate">{formatDayLabel(date)}</span>
          </p>
          <WeekStrip selected={date} onSelect={setDate} />
        </div>

        {/* Weight row 56: numeric input + unit chip */}
        <div className="flex h-14 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3">
          <span className="w-[64px] flex-none truncate text-sm font-medium">Weight</span>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            className="h-11 min-w-0 flex-1 rounded-lg text-base font-semibold tabular-nums"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={loading ? "…" : record ? String(round1(record.value)) : "e.g. 80"}
            aria-label={`Weight in ${unit ?? "kg"}`}
            aria-invalid={!weightValid}
            {...tourAttrs({ id: "progressLog.weight", label: "Weight", help: "The weight you measured for the picked day.", order: 40 })}
          />
          <span
            className="flex h-9 flex-none items-center rounded-full border bg-muted/40 px-3 text-sm font-semibold leading-none text-muted-foreground"
            aria-label={`Unit: ${unit ?? "kg"}`}
          >
            {unit ?? "kg"}
          </span>
        </div>

        {/* Photos (optional) — 4 slots */}
        <section aria-label="Optional progress photos" className="flex flex-none flex-col gap-1.5 rounded-lg border bg-muted/20 p-2">
          <div className="flex h-5 items-center justify-between overflow-hidden">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Photos (optional)
            </span>
            <span className="truncate text-[11px] text-muted-foreground">{formatDayLabel(date)}</span>
          </div>
          {loading ? (
            <div className="flex flex-wrap gap-2">
              {PHOTO_SLOTS.map((s) => (
                <Skeleton key={s} className="h-[72px] w-[72px] rounded-lg" aria-hidden />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {PHOTO_SLOTS.map((slot) => {
                const preview = previewOf(slot);
                const uploading = uploadingSlot === slot;
                const label = SLOT_LABELS[slot];
                return (
                  <div key={slot} className="flex w-[72px] flex-none flex-col items-center gap-1">
                    <div className="relative h-[72px] w-[72px] flex-none">
                      <ActionList
                        label={preview ? `Options for ${label} photo` : `Add ${label} photo`}
                        trigger={
                          <button
                            type="button"
                            disabled={uploading || saving}
                            aria-label={preview ? `Replace ${label} photo` : `Add ${label} photo`}
                            {...tourAttrs({ id: "progressLog.photoSlot", label: "Photo slot", help: "Attach a progress photo for this pose via camera or library.", order: 50 })}
                            className={cn(
                              "flex h-full w-full items-center justify-center overflow-hidden rounded-lg transition-colors",
                              preview
                                ? "border border-border bg-card"
                                : "border border-dashed border-border bg-card/50 hover:border-primary/60 hover:bg-primary/5",
                              (uploading || saving) && "opacity-60",
                            )}
                          >
                            {uploading ? (
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
                            ) : preview ? (
                              <img
                                src={preview.url}
                                alt={`${label} pose photo`}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <Plus className="h-5 w-5 text-muted-foreground" aria-hidden />
                            )}
                          </button>
                        }
                        items={[
                          {
                            id: "take",
                            label: "Take photo",
                            onSelect: () => captureRefs.current[slot]?.click(),
                          },
                          {
                            id: "library",
                            label: "Choose from library",
                            onSelect: () => libraryRefs.current[slot]?.click(),
                          },
                        ]}
                      />
                      {preview && !uploading ? (
                        <button
                          type="button"
                          aria-label={`Remove ${label} photo`}
                          disabled={saving || (preview.pending ? false : removingKey != null)}
                          {...tourAttrs({ skipTour: true, reason: "Per-slot photo remove glyph on filled slots" })}
                          onClick={() => {
                            if (preview.pending) removePending(slot);
                            else {
                              const existing = existingPhotos.find((p) => p.slot === slot);
                              if (existing) void removeExisting(existing.id);
                            }
                          }}
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
                        captureRefs.current[slot] = el;
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
                    <input
                      ref={(el) => {
                        libraryRefs.current[slot] = el;
                      }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
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
          )}
          <p className="flex items-center gap-1 px-1 text-[11px] leading-snug text-muted-foreground">
            <Camera className="h-3 w-3 flex-none" aria-hidden />
            Photos attach to this weigh-in; each pose keeps the latest shot.
          </p>
        </section>

        {/* Save confirmation hint (mirror of the TopBar Save for tall screens) */}
        <div data-row className="flex h-10 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap px-1 text-xs text-muted-foreground">
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 flex-none animate-spin" aria-hidden />
              <span className="min-w-0 flex-1 truncate">Saving…</span>
            </>
          ) : weightValid ? (
            <>
              <Check className="h-3.5 w-3.5 flex-none text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {round1(weightParsed)} {unit} for {formatDayLabel(date)}
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate">Enter a weight to save.</span>
          )}
        </div>
      </ScrollBody>
    </Screen>
  );
}
