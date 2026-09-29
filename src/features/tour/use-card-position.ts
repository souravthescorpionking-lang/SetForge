"use client";

// ─────────────────────────────────────────────────────────────────────────────
// useCardPosition — two-phase placement for floating tour/hint cards.
//
// Phase 1: the card renders invisibly (visibility:hidden) at (0,0) with its
// real width; phase 2 (useLayoutEffect, pre-paint) measures its height and
// computes the final position via ./placement. No flicker.
// ─────────────────────────────────────────────────────────────────────────────

import { useLayoutEffect, useRef, useState } from "react";
import { cardWidth, computePlacement, type CardPos, type PlacementPref, type RectLike } from "./placement";

export function useCardPosition(rect: RectLike | null, pref: PlacementPref, contentKey: string | number) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<CardPos | null>(null);

  useLayoutEffect(() => {
    if (!rect || !cardRef.current) {
      setPos(null);
      return;
    }
    const h = cardRef.current.offsetHeight;
    if (h <= 0) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = cardWidth(vw);
    setPos(computePlacement(rect, w, h, pref, { w: vw, h: vh }));
  }, [rect, pref, contentKey]);

  return { cardRef, pos };
}
