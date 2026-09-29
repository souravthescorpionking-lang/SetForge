"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GuidedVideoPanel — §4.11 item 7: while guided mode is on and the CURRENT
// exercise has a videoUrl, its GroupCard renders this block in the
// underHeader flow slot — a 40px toggle row + <MediaBlock videoUrl height={180}>
// (MediaBlock itself collapses to 0px when videoUrl is null, and the whole
// panel is only mounted when settings.showVideoPanel is on — both gates live
// in today-screen).
//
// Open-state is remembered PER workout-exercise id for the BROWSER SESSION:
// a module-level map survives pointer moves / card remounts (collapsing the
// panel on an exercise keeps it collapsed when the guided pointer returns to
// it) and resets on reload — never persisted to the database.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { ChevronDown, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticTap } from "@/lib/client/haptics";
import { MediaBlock } from "@/components/shared/media-block";

/** we.id → open (absent = default open). Session-lifetime only, never stored. */
const openByWeId = new Map<string, boolean>();

export function GuidedVideoPanel({
  weId,
  videoUrl,
  height = 180,
}: {
  /** Workout-exercise id — the per-session open-state key. */
  weId: string;
  videoUrl?: string | null;
  height?: number;
}) {
  const [open, setOpen] = useState(() => openByWeId.get(weId) ?? true);

  // 0px when there is no video — never a blank box (MediaBlock contract).
  if (!videoUrl) return null;

  const toggle = () => {
    hapticTap();
    setOpen((v) => {
      const next = !v;
      openByWeId.set(weId, next);
      return next;
    });
  };

  return (
    <div className="flex-none border-b border-border bg-muted/20">
      <button
        type="button"
        data-row
        className="flex h-10 w-full items-center gap-2 px-3 text-left"
        aria-expanded={open}
        aria-label={open ? "Collapse form video" : "Expand form video"}
        title={open ? "Collapse form video" : "Expand form video"}
        onClick={toggle}
      >
        <Video className="h-4 w-4 flex-none text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">
          Form video
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-none text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="p-2 pt-0">
          <MediaBlock videoUrl={videoUrl} height={height} />
        </div>
      ) : null}
    </div>
  );
}
