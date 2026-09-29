"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TourCard — the step card of a running tour (Part 7).
//
// Focus lands on the card at every step change; Tab is trapped inside;
// ArrowRight/Enter = Next, ArrowLeft = Back, Escape = Skip. The last step
// offers a 12px "Don't show tours" link (settings.showTours=false + Undo).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { TourStep } from "@/lib/tour/types";
import { useApp } from "@/lib/client/store";
import { cardWidth, type CardPos, type PlacementPref, type RectLike } from "./placement";
import { useCardPosition } from "./use-card-position";
import { backStep, endActiveTour, nextStep } from "./actions";

type Props = {
  step: TourStep;
  index: number;
  total: number;
  target: RectLike | null;
  pref: PlacementPref;
};

export function TourCard({ step, index, total, target, pref }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { cardRef, pos } = useCardPosition(target, pref, step.id);
  const updateSettings = useApp((s) => s.updateSettings);
  const isLast = index >= total - 1;

  // Focus the card on every step change (keyboard + SR users).
  useEffect(() => {
    rootRef.current?.focus();
  }, [step.id]);

  const onSkip = () => endActiveTour("SKIPPED");

  const onDontShowTours = () => {
    const prev = useApp.getState().settings?.showTours ?? true;
    void updateSettings({ showTours: false }).catch(() => undefined);
    toast("Tours turned off", {
      action: {
        label: "Undo",
        onClick: () => {
          void updateSettings({ showTours: prev }).catch(() => undefined);
        },
      },
    });
    endActiveTour("SKIPPED");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      // Trap Tab within the card.
      e.preventDefault();
      const focusables = Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea') ?? [],
      );
      if (focusables.length === 0) return;
      const current = focusables.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey
        ? current <= 0
          ? focusables.length - 1
          : current - 1
        : current === focusables.length - 1
          ? 0
          : current + 1;
      focusables[next]?.focus();
      return;
    }
    const activeIsButton = (document.activeElement as HTMLElement | null)?.tagName === "BUTTON";
    if (e.key === "ArrowRight") {
      e.preventDefault();
      nextStep();
      return;
    }
    if (e.key === "Enter") {
      // A focused button handles its own activation — avoid a double advance.
      if (activeIsButton) return;
      e.preventDefault();
      nextStep();
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      backStep();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onSkip();
    }
  };

  const width = cardWidth(typeof window === "undefined" ? 320 : window.innerWidth);

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        cardRef.current = el;
      }}
      role="dialog"
      aria-modal="false"
      aria-label={`Tour: ${step.label}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="pointer-events-auto absolute flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        left: pos ? pos.left : 0,
        top: pos ? pos.top : 0,
        width,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <p className="flex-none text-sm font-bold leading-snug">{step.label}</p>
      <p className="flex-none text-sm leading-relaxed text-muted-foreground">{step.help}</p>

      <div className="flex flex-none items-center gap-1 pt-1">
        <Button type="button" variant="ghost" className="h-9 px-3 text-muted-foreground" onClick={onSkip}>
          Skip
        </Button>
        <span className="flex-1 text-center text-xs tabular-nums text-muted-foreground" aria-hidden>
          {index + 1}/{total}
        </span>
        {index > 0 ? (
          <Button type="button" variant="ghost" className="h-9 px-3" onClick={() => backStep()}>
            Back
          </Button>
        ) : null}
        <Button type="button" className="h-9 px-4" onClick={() => nextStep()}>
          {isLast ? "Done" : "Next"}
        </Button>
      </div>

      {isLast ? (
        <button
          type="button"
          onClick={onDontShowTours}
          className="flex-none self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Don&apos;t show tours
        </button>
      ) : null}
    </div>
  );
}

export type { CardPos };
