"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TrainerTipRow — §4.11 item 8: the trainer tip rendered as an GroupCard
// `underHeader` inline flow element. Collapsed it is a single 56px row
// (lightbulb + one-line preview + chevron); tapping expands the full text
// beneath it with the 0fr→1fr grid-row transition (max 120px, internal
// scroll). Visibility of the rows is toggled workout-wide by the MetaRow
// "Tip" chip (today-screen owns that state).
// ─────────────────────────────────────────────────────────────────────────────

import { useId, useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { rowBar } from "@/lib/ui/tokens";
import { hapticTap } from "@/lib/client/haptics";

export function TrainerTipRow({ tip }: { tip: string }) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  return (
    <div className="flex-none border-b border-border bg-muted/20">
      <button
        type="button"
        data-row
        className={cn(rowBar, "w-full items-center gap-2 px-3 text-left")}
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-label={expanded ? "Collapse trainer tip" : "Expand trainer tip"}
        onClick={() => {
          hapticTap();
          setExpanded((v) => !v);
        }}
      >
        <Lightbulb className="h-4 w-4 flex-none text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {expanded ? (
            <span className="font-semibold text-foreground">Trainer tip</span>
          ) : (
            tip
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-none text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {/* 0fr→1fr expansion — the full text drops in beneath the 56px row */}
      <div
        id={bodyId}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        aria-hidden={!expanded}
      >
        <div className="overflow-hidden">
          <p className="max-h-[120px] overflow-y-auto px-3 pb-2 text-xs leading-relaxed text-muted-foreground">
            {tip}
          </p>
        </div>
      </div>
    </div>
  );
}
