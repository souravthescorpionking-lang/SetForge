"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — MediaBlock (§2/§4.2/§4.11). Video (with speed chips) or thumbnail;
// collapses to ZERO height when no URL — never a blank box. All media optional.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from "react";
import { Play } from "lucide-react";

const SPEEDS = [0.5, 0.75, 1, 1.5, 2] as const;

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
  className?: string;
}

export function MediaBlock({ videoUrl, thumbnailUrl, height = 180, showVideoPanel = true, aspectVideo = false, className }: MediaBlockProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState<number>(1);
  const [playing, setPlaying] = useState(false);

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
      </div>
      <div className="flex h-10 items-center gap-2 border-t px-3" data-chip-scroller>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={`flex h-8 items-center rounded-full border px-3 text-xs font-bold tabular-nums ${
              speed === s ? "border-primary/60 bg-primary/10 text-primary" : "text-muted-foreground"
            }`}
            aria-pressed={speed === s}
            onClick={() => {
              setSpeed(s);
              if (videoRef.current) videoRef.current.playbackRate = s;
            }}
          >
            {s.toFixed(2).replace(/0$/, "")}×
          </button>
        ))}
      </div>
    </div>
  );
}
