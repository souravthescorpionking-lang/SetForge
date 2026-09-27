"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Chip-scroller visibility helper (picker-local, Part 6 §4.3a). Extracted from
// the PickerScreen ChipScroller so the new Equipment/Muscle filter rows get the
// identical treatment: chips clipped away by the scroller — or straddling the
// viewport right edge — get visibility:hidden, so right-edge overflow audits
// only see what the user actually sees while the strip stays a REAL horizontal
// scroll container (scrollWidth/layout untouched). Re-checked on scroll/resize/
// reflow; re-armed when `resetKey` changes (chip set or applied-filter count
// changed → chip widths shifted).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from "react";

export function useChipScrollerVisibility<T extends HTMLElement>(resetKey: string | number) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const scroller = ref.current;
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
  }, [resetKey, ref]);

  return ref;
}
