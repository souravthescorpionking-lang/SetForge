// ─────────────────────────────────────────────────────────────────────────────
// Placement engine (Part 7) — hand-rolled (no floating-ui dependency).
//
// LAWS (verified at 320px viewport):
//   • the card NEVER overlaps its target rect (flip; last resort: viewport
//     bottom — only when every side is impossible);
//   • the card ALWAYS stays fully inside the viewport (16px margin);
//   • card width = min(280px, 100vw − 32px).
// ─────────────────────────────────────────────────────────────────────────────

export type RectLike = { left: number; top: number; width: number; height: number };
export type PlacementPref = "top" | "bottom" | "left" | "right" | "auto";
export type CardPos = { left: number; top: number };

const GAP = 12; // card ↔ target gap
const MARGIN = 16; // viewport edge margin

/** Card width for the current viewport (min(280px, 100vw − 32px)). */
export function cardWidth(viewportW: number): number {
  return Math.min(280, viewportW - 32);
}

function intersects(a: CardPos & { w: number; h: number }, b: RectLike): boolean {
  return a.left < b.left + b.width - 2 && a.left + a.w > b.left + 2 && a.top < b.top + b.height - 2 && a.top + a.h > b.top + 2;
}

/**
 * Compute the card position for a target rect.
 * `auto` prefers below → above → the side with more room → other side →
 * viewport bottom (last resort, may overlap the target).
 */
export function computePlacement(
  target: RectLike,
  cardW: number,
  cardH: number,
  pref: PlacementPref,
  viewport: { w: number; h: number },
): CardPos {
  const { w: vw, h: vh } = viewport;
  const clampX = (x: number) => Math.max(MARGIN, Math.min(vw - MARGIN - cardW, x));
  const clampY = (y: number) => Math.max(MARGIN, Math.min(vh - MARGIN - cardH, y));
  const targetCx = target.left + target.width / 2;
  const targetCy = target.top + target.height / 2;

  type Cand = CardPos & { w: number; h: number };
  const tryDir = (dir: Exclude<PlacementPref, "auto">): Cand | null => {
    let pos: CardPos;
    if (dir === "bottom") {
      if (target.top + target.height + GAP + cardH > vh - MARGIN) return null; // no space below
      pos = { left: clampX(targetCx - cardW / 2), top: target.top + target.height + GAP };
    } else if (dir === "top") {
      if (target.top - GAP - cardH < MARGIN) return null; // no space above
      pos = { left: clampX(targetCx - cardW / 2), top: target.top - GAP - cardH };
    } else if (dir === "left") {
      pos = { left: clampX(target.left - GAP - cardW), top: clampY(targetCy - cardH / 2) };
    } else {
      pos = { left: clampX(target.left + target.width + GAP), top: clampY(targetCy - cardH / 2) };
    }
    const cand: Cand = { ...pos, w: cardW, h: cardH };
    return intersects(cand, target) ? null : cand; // never cover the target
  };

  // Last resort: pinned to the viewport bottom, horizontally clamped.
  const lastResort = (): CardPos => ({ left: clampX(targetCx - cardW / 2), top: vh - MARGIN - cardH });

  let order: Array<Exclude<PlacementPref, "auto">>;
  if (pref === "auto") {
    const side: "left" | "right" =
      target.left - MARGIN >= vw - MARGIN - (target.left + target.width) ? "left" : "right";
    const other: "left" | "right" = side === "left" ? "right" : "left";
    order = ["bottom", "top", side, other];
  } else {
    const flip: Record<Exclude<PlacementPref, "auto">, Exclude<PlacementPref, "auto">> = {
      bottom: "top",
      top: "bottom",
      left: "right",
      right: "left",
    };
    order = [pref, flip[pref]];
  }

  for (const dir of order) {
    const cand = tryDir(dir);
    if (cand) return { left: cand.left, top: cand.top };
  }
  return lastResort();
}
