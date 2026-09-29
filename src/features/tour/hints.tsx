"use client";

// ─────────────────────────────────────────────────────────────────────────────
// HintManager (Part 7) — contextual one-time hints.
//
// On each route mount (~600ms after), hint-declared steps (any scope) whose
// anchor exists in the screen container are observed with an
// IntersectionObserver. The first anchor to become ≥50% visible triggers a
// hint card IF: settings.showHints, no active tour, the hint is unseen, and
// ≥30s have passed since the last shown hint (module-level timestamp).
// The card auto-dismisses after 8s; "Got it" (or dismissal) marks it seen via
// toursApi.markHint (write-through).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";
import type { TourStep } from "@/lib/tour/types";
import { useApp } from "@/lib/client/store";
import { anchorFor, collectHintSteps } from "./resolve";
import { cardWidth, type RectLike } from "./placement";
import { useCardPosition } from "./use-card-position";
import { useTourStore } from "./store";

/** Module-level throttle: ≥30s between any two hints. */
let lastHintShownAt = 0;
const HINT_THROTTLE_MS = 30_000;
const HINT_AUTODISMISS_MS = 8_000;

type ActiveHint = { step: TourStep; rect: RectLike };

export function HintManager() {
  const [mounted, setMounted] = useState(false);
  const [hint, setHint] = useState<ActiveHint | null>(null);
  const routeName = useTourStore((s) => s.routeName);
  const loaded = useTourStore((s) => s.loaded);

  useEffect(() => setMounted(true), []);

  const dismiss = (markSeen: boolean) => {
    setHint((current) => {
      if (current && markSeen) useTourStore.getState()._markHint(current.step.id);
      return null;
    });
  };

  // Collect + observe hints per route mount.
  useEffect(() => {
    if (!mounted || !loaded || !routeName) return;
    // Navigating away mid-hint → mark it seen (it WAS shown) and clear.
    setHint((current) => {
      if (current) useTourStore.getState()._markHint(current.step.id);
      return null;
    });

    let io: IntersectionObserver | null = null;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      if (useTourStore.getState().active) return;
      if (!useApp.getState().settings?.showHints) return;
      const st = useTourStore.getState();
      const candidates = collectHintSteps(routeName).filter((s) => !st.hintsSeen[s.id]);
      if (candidates.length === 0) return;

      io = new IntersectionObserver(
        (entries) => {
          if (cancelled) return;
          for (const entry of entries) {
            if (entry.intersectionRatio < 0.5) continue;
            const id = (entry.target as HTMLElement).getAttribute("data-tour-id");
            const step = candidates.find((s) => s.id === id);
            if (!step || !entry.target.isConnected) continue;
            io?.disconnect();
            // Gates re-checked at trigger time.
            if (useTourStore.getState().active) return;
            if (!useApp.getState().settings?.showHints) return;
            if (Date.now() - lastHintShownAt < HINT_THROTTLE_MS) return;
            lastHintShownAt = Date.now();
            const r = entry.target.getBoundingClientRect();
            setHint({ step, rect: { left: r.left, top: r.top, width: r.width, height: r.height } });
            return;
          }
        },
        { threshold: [0.5] },
      );
      for (const s of candidates) {
        const el = anchorFor(s.id);
        if (el) io.observe(el);
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      io?.disconnect();
    };
  }, [mounted, loaded, routeName]);

  // Auto-dismiss after 8s.
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => dismiss(true), HINT_AUTODISMISS_MS);
    return () => clearTimeout(t);
  }, [hint]);

  if (!mounted || !hint) return null;
  return createPortal(
    <HintCard step={hint.step} rect={hint.rect} onDismiss={() => dismiss(true)} />,
    document.body,
  );
}

function HintCard({ step, rect, onDismiss }: { step: TourStep; rect: RectLike; onDismiss: () => void }) {
  const { cardRef, pos } = useCardPosition(rect, step.placement, step.id);
  const width = cardWidth(typeof window === "undefined" ? 320 : window.innerWidth);

  return (
    <div
      ref={cardRef}
      role="status"
      className="pointer-events-auto fixed z-[45] flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-xl"
      style={{
        left: pos ? pos.left : 0,
        top: pos ? pos.top : 0,
        width,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <p className="flex flex-none items-center gap-1.5 text-sm font-bold leading-snug">
        <Lightbulb className="h-4 w-4 flex-none text-primary" aria-hidden />
        {step.label}
      </p>
      <p className="flex-none text-sm leading-relaxed text-muted-foreground">{step.help}</p>
      <div className="flex flex-none justify-end pt-1">
        <Button type="button" variant="ghost" className="h-9 px-4" onClick={onDismiss}>
          Got it
        </Button>
      </div>
    </div>
  );
}
