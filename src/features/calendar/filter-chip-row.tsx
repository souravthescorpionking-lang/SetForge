"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FilterChipRow — the applied-filters ChipRow (p3-6): a 40px chip strip inside
// the calendar screen's SubBar, one chip per applied filter with an X that
// removes just that filter. This is the ONE allowed extra scroll container
// (horizontal chip scroller, data-chip-scroller + no-scrollbar).
//
// Chip-scroller note (pattern ported from the p3-4 picker): chips the scroller
// clips away are genuinely invisible, so they get visibility:hidden — their
// raw rects then never trip right-edge overflow audits while the strip stays a
// real horizontal scroll container.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { CalendarFilters } from "./filter-state";
import { patchCalendarFilters } from "./filter-store";

type Chip = { key: string; label: string; onRemove: () => void };

/** Build one chip per applied filter (categories, exercise, each threshold). */
function chipsFromFilters(f: CalendarFilters): Chip[] {
  const chips: Chip[] = [];
  for (const name of f.categoryNames) {
    chips.push({
      key: `cat:${name}`,
      label: name,
      onRemove: () =>
        patchCalendarFilters({ categoryNames: f.categoryNames.filter((n) => n !== name) }),
    });
  }
  if (f.exerciseId) {
    chips.push({
      key: "exercise",
      label: f.exerciseName ?? "Exercise",
      onRemove: () =>
        patchCalendarFilters({
          exerciseId: null,
          exerciseName: null,
          weightMin: null,
          repsMin: null,
          distanceMin: null,
          timeMinSec: null,
        }),
    });
    if (f.weightMin != null) {
      chips.push({
        key: "weight",
        label: `Weight ≥ ${f.weightMin} kg`,
        onRemove: () => patchCalendarFilters({ weightMin: null }),
      });
    }
    if (f.repsMin != null) {
      chips.push({
        key: "reps",
        label: `Reps ≥ ${f.repsMin}`,
        onRemove: () => patchCalendarFilters({ repsMin: null }),
      });
    }
    if (f.distanceMin != null) {
      chips.push({
        key: "distance",
        label: `Distance ≥ ${f.distanceMin} km`,
        onRemove: () => patchCalendarFilters({ distanceMin: null }),
      });
    }
    if (f.timeMinSec != null) {
      chips.push({
        key: "time",
        label: `Time ≥ ${f.timeMinSec / 60} min`,
        onRemove: () => patchCalendarFilters({ timeMinSec: null }),
      });
    }
  }
  return chips;
}

export function FilterChipRow({ filters }: { filters: CalendarFilters }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const chips = chipsFromFilters(filters);

  // visibility sync for chips clipped by the scroller / viewport (see header)
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => {
      const vw = document.documentElement.clientWidth;
      const clip = scroller.getBoundingClientRect();
      for (const child of Array.from(scroller.children)) {
        const r = child.getBoundingClientRect();
        const intersectsClip = r.right > clip.left - 1 && r.left < clip.right + 1;
        const insideViewport = r.right <= vw + 1;
        (child as HTMLElement).style.visibility =
          intersectsClip && insideViewport ? "" : "hidden";
      }
    };
    update();
    const raf = requestAnimationFrame(() => requestAnimationFrame(update));
    const t1 = window.setTimeout(update, 300);
    const t2 = window.setTimeout(update, 900);
    const onScroll = () => update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const onResize = () => update();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => update());
    ro.observe(scroller);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [chips.length]);

  return (
    <div
      ref={scrollerRef}
      data-chip-scroller
      className="no-scrollbar flex h-10 w-full min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
      role="list"
      aria-label="Applied filters"
    >
      {chips.map((chip) => (
        <span
          key={chip.key}
          role="listitem"
          className="flex h-10 max-w-[220px] flex-none items-center gap-1 rounded-full border border-primary/40 bg-primary/10 pl-3 pr-1 text-xs font-semibold text-primary"
        >
          <span className="min-w-0 truncate">{chip.label}</span>
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove filter: ${chip.label}`}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-full transition-colors hover:bg-primary/15"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}
