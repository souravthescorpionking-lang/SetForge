"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TourOverlay (Part 7, LAW 4/5) — the ONLY new position:fixed surface in the
// app. Portaled to document.body; z-index 45 (chip 46); transient — never
// persists after dismiss.
//
//   • Dim + cut-out: full-screen SVG mask — white everywhere except a
//     rounded-rect (r=8) hole around the current target + 8px padding.
//   • Pointer events: the SVG is pointer-events:none; four strips cover the
//     screen EXCEPT the cut-out (click there = Skip); clicks inside the
//     cut-out fall through to the real element and auto-pause the tour.
//   • Paused: a bottom-center chip (Continue · i/n, dismissible) sits above
//     the NavBar; the overlay itself hides so the user can interact freely.
//   • Position auto-recomputes on scroll/resize (rAF-throttled ResizeObserver
//     + scroll listener on [data-scroll-body]).
//   • Missing target mid-tour → silently advance; expandFirst collapsibles
//     are expanded before measuring; prefers-reduced-motion → instant.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TourStep } from "@/lib/tour/types";
import { anchorFor } from "./resolve";
import type { RectLike } from "./placement";
import { endActiveTour, nextStep, backStep } from "./actions";
import { useTourStore, type ActiveTour } from "./store";
import { TourCard } from "./tour-card";

const MASK_ID = "sf-tour-mask";
const CUT_PADDING = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** expandFirst — open the collapsible parent (≤400ms budget for transitionend). */
async function expandCollapsible(selector: string): Promise<void> {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  const collapsed =
    el.getAttribute("data-state") === "closed" ||
    el.getAttribute("aria-expanded") === "false" ||
    el.getBoundingClientRect().height === 0;
  if (!collapsed) return;
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  const node: HTMLElement = el; // capture the non-null narrowing for the closure
  await new Promise<void>((resolve) => {
    const timer = setTimeout(finish, 400);
    function finish() {
      clearTimeout(timer);
      node.removeEventListener("transitionend", finish);
      resolve();
    }
    node.addEventListener("transitionend", finish, { once: true });
  });
}

export function TourOverlay() {
  const active = useTourStore((s) => s.active);
  const paused = useTourStore((s) => s.paused);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !active) return null;
  return createPortal(
    paused ? <PauseChip active={active} /> : <ActiveOverlay key={active.screenId} active={active} />,
    document.body,
  );
}

// ── active overlay ───────────────────────────────────────────────────────────

function ActiveOverlay({ active: tour }: { active: ActiveTour }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<RectLike | null>(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const step: TourStep = tour.steps[Math.min(tour.index, tour.steps.length - 1)];

  // GLOBAL keyboard (LAW 7): Esc/←/→/Enter always work while a tour is open,
  // regardless of where focus sits (the card keeps its own handler for the
  // focus-trapped case; this one is the guarantee).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) return;
      if (e.key === "Escape") {
        e.preventDefault();
        endActiveTour("SKIPPED");
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        nextStep();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        backStep();
        return;
      }
      if (e.key === "Enter" && (e.target as HTMLElement | null)?.tagName !== "BUTTON") {
        e.preventDefault();
        nextStep();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Missing target mid-tour → silently skip to the next step (or complete).
  const handleMissing = useCallback(() => {
    const st = useTourStore.getState();
    const a = st.active;
    if (!a || a.steps[a.index]?.id !== step.id) return; // already advanced
    if (a.index < a.steps.length - 1) st._goto(a.index + 1);
    else endActiveTour("COMPLETED");
  }, [step.id]);

  const measure = useCallback(() => {
    const el = anchorFor(step.id);
    if (!el) {
      handleMissing();
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      handleMissing();
      return;
    }
    setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
  }, [step.id, handleMissing]);

  // Step sequence: resolve → expandFirst → scrollIntoView(center) → wait → measure.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const el = anchorFor(step.id);
      if (!el) {
        handleMissing();
        return;
      }
      if (step.expandFirst) await expandCollapsible(step.expandFirst);
      if (cancelled) return;
      const live = anchorFor(step.id) ?? el;
      live.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      await sleep(reduced ? 0 : 480); // ≤600ms budget incl. smooth scroll
      if (cancelled) return;
      measure();
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [tour.screenId, tour.index, step, reduced, measure, handleMissing]);

  // Continuous re-measure: rAF-throttled ResizeObserver + scroll listeners.
  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    const scrollBody = document.querySelector("[data-scroll-body]");
    scrollBody?.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    if (scrollBody) ro.observe(scrollBody);
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      scrollBody?.removeEventListener("scroll", schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [measure]);

  // Clicks that land OUTSIDE this overlay = the user interacting with the app
  // (inside the cut-out) → auto-pause. Strip clicks stay inside (→ Skip).
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        useTourStore.getState()._setPaused(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  const cut = rect
    ? { x: rect.left - CUT_PADDING, y: rect.top - CUT_PADDING, w: rect.width + CUT_PADDING * 2, h: rect.height + CUT_PADDING * 2 }
    : null;

  const skip = () => endActiveTour("SKIPPED");

  return (
    <div ref={rootRef} data-tour-overlay className="pointer-events-none fixed inset-0 z-[45]">
      {/* aria-live announcement of every step */}
      <div className="sr-only" aria-live="polite">
        {`Tour step ${tour.index + 1} of ${tour.steps.length}: ${step.label}. ${step.help}`}
      </div>

      {/* dim + rounded-rect cut-out (SVG mask; light .6 / dark .7) */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <mask id={MASK_ID} maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width="100%" height="100%" className="fill-white" />
            {cut ? (
              <rect
                x={Math.max(0, cut.x)}
                y={Math.max(0, cut.y)}
                width={Math.max(0, cut.w)}
                height={Math.max(0, cut.h)}
                rx="8"
                className="fill-black"
              />
            ) : null}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" className="fill-black/60 dark:fill-black/70" mask={`url(#${MASK_ID})`} />
      </svg>

      {/* four strips covering the screen EXCEPT the cut-out; click = Skip.
          Pointer-only affordance — the card's Skip button + Escape cover a11y. */}
      {cut ? (
        <>
          <div
            onClick={skip}
            aria-hidden
            className="pointer-events-auto absolute left-0 top-0 w-full cursor-pointer"
            style={{ height: Math.max(0, cut.y) }}
          />
          <div
            onClick={skip}
            aria-hidden
            className="pointer-events-auto absolute left-0 w-full cursor-pointer"
            style={{ top: cut.y + cut.h, height: `calc(100% - ${cut.y + cut.h}px)` }}
          />
          <div
            onClick={skip}
            aria-hidden
            className="pointer-events-auto absolute left-0 cursor-pointer"
            style={{ top: cut.y, width: Math.max(0, cut.x), height: cut.h }}
          />
          <div
            onClick={skip}
            aria-hidden
            className="pointer-events-auto absolute cursor-pointer"
            style={{ top: cut.y, left: cut.x + cut.w, width: `calc(100% - ${cut.x + cut.w}px)`, height: cut.h }}
          />
        </>
      ) : null}

      {/* the step card (placement computed pre-paint; never covers the target) */}
      <TourCard step={step} index={tour.index} total={tour.steps.length} target={rect} pref={step.placement} />
    </div>
  );
}

// ── paused chip ──────────────────────────────────────────────────────────────

function PauseChip({ active }: { active: ActiveTour }) {
  const resume = () => useTourStore.getState()._setPaused(false);
  return (
    <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] left-1/2 z-[46] -translate-x-1/2">
      <div className="pointer-events-auto flex h-10 items-center gap-0.5 rounded-full border border-border bg-card pl-4 pr-1 shadow-lg">
        <button
          type="button"
          onClick={resume}
          className="flex h-8 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-primary"
        >
          Continue tour
          <span className="text-xs tabular-nums text-muted-foreground" aria-hidden>
            · {active.index + 1}/{active.steps.length}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          aria-label="Dismiss tour"
          onClick={() => endActiveTour("SKIPPED")}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
