"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — MediaBlock (§2/§4.2/§4.11). Video (with speed chips) or thumbnail;
// collapses to ZERO height when no URL — never a blank box. All media optional.
//
// Part 10 §3.1 R6: `speedControl` swaps the built-in speed row for a corner
// chip that opens an ActionList (0.5×…1.5×) and PERSISTS the choice through
// the caller (UserSettings.videoSpeed) — the FocusCard media block.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { ActionList } from "@/components/shared/action-list";
import { tourAttrs } from "@/lib/tour/attrs";
import type { TourDecl } from "@/lib/tour/types";
import { cn } from "@/lib/utils";

const SPEEDS = [0.5, 0.75, 1, 1.5, 2] as const;

/** §3.1 speed chip list — persisted to UserSettings.videoSpeed. */
export const FOCUS_VIDEO_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;

export interface MediaBlockSpeedControl {
  /** Current playback rate (caller-owned — UserSettings.videoSpeed). */
  speed: number;
  /** Persisted when a new speed is picked. */
  onChange: (speed: number) => void;
  /** Tour declaration for the chip trigger (caller-owned id). */
  tour: TourDecl;
}

export interface MediaBlockProps {
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  /** px height of the block: 180 (mobile) / 240 (desktop) per spec; 0 when absent.
   *  Ignored when aspectVideo is set. */
  height?: number;
  showVideoPanel?: boolean; // setting gate (guided-mode video)
  /** Part 9 §5.3: render the media 16:9 (aspect-video, full width) instead of a
   *  fixed pixel height — the Exercise Info presentation. */
  aspectVideo?: boolean;
  /** Part 10 §3.1 R6: external, persisted speed control (corner chip). */
  speedControl?: MediaBlockSpeedControl;
  className?: string;
}

function speedLabel(s: number): string {
  return `${s.toFixed(2).replace(/0$/, "").replace(/\.$/, "")}×`;
}

export function MediaBlock({ videoUrl, thumbnailUrl, height = 180, showVideoPanel = true, aspectVideo = false, speedControl, className }: MediaBlockProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState<number>(1);
  const [playing, setPlaying] = useState(false);

  // External speed control: the <video> follows the caller-owned value.
  useEffect(() => {
    if (!speedControl || !videoRef.current) return;
    videoRef.current.playbackRate = speedControl.speed;
  }, [speedControl, videoUrl]);

  if (!videoUrl || !showVideoPanel) {
    if (!thumbnailUrl) return null; // 0px — collapsed, no blank box
    return (
      <div className={`flex-none overflow-hidden rounded-md border bg-muted/30 ${className ?? ""} ${aspectVideo ? "aspect-video w-full" : ""}`} style={aspectVideo ? undefined : { height }}>
        <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      </div>
    );
  }

  return (
    <div className={`flex-none overflow-hidden rounded-md border bg-muted/30 ${className ?? ""}`}>
      <div className={`relative ${aspectVideo ? "aspect-video w-full" : ""}`} style={aspectVideo ? undefined : { height }}>
        <video
          ref={videoRef}
          src={videoUrl}
          poster={thumbnailUrl ?? undefined}
          className="h-full w-full bg-black object-contain"
          playsInline
          controls
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        {!playing && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
              <Play className="h-5 w-5" aria-hidden />
            </span>
          </span>
        )}
        {speedControl ? (
          /* §3.1 R6: corner chip → ActionList speeds; persists via the caller. */
          <span className="absolute bottom-2 right-2">
            <ActionList
              label={`Video speed ${speedLabel(speedControl.speed)}`}
              align="end"
              trigger={
                <span
                  {...tourAttrs(speedControl.tour)}
                  role="button"
                  tabIndex={0}
                  className="flex h-8 items-center rounded-full border border-white/30 bg-black/70 px-3 text-xs font-bold tabular-nums text-white backdrop-blur transition-colors hover:bg-black/85"
                >
                  {speedLabel(speedControl.speed)}
                </span>
              }
              items={FOCUS_VIDEO_SPEEDS.map((s) => ({
                id: String(s),
                label: speedLabel(s),
                checked: s === speedControl.speed,
                onSelect: () => {
                  setSpeed(s);
                  speedControl.onChange(s);
                  if (videoRef.current) videoRef.current.playbackRate = s;
                },
              }))}
            />
          </span>
        ) : null}
      </div>
      {speedControl ? null : (
        <div className="flex h-10 items-center gap-2 border-t px-3" data-chip-scroller>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              {...tourAttrs({ skipTour: true, reason: "Playback-speed chips inside the media block" })}
              className={cn(
                "flex h-8 items-center rounded-full border px-3 text-xs font-bold tabular-nums transition-colors",
                speed === s ? "border-primary/60 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              aria-pressed={speed === s}
              onClick={() => {
                setSpeed(s);
                if (videoRef.current) videoRef.current.playbackRate = s;
              }}
            >
              {speedLabel(s)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
