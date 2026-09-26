// ─────────────────────────────────────────────────────────────────────────────
// SetForge Part 3 — layout tokens (single source of truth).
//
// NON-NEGOTIABLE LAWS (subset) enforced by this file:
//   • Spacing values ONLY from SPACING:        4 8 12 16 24 32
//   • Row heights ONLY from ROW_HEIGHTS:       40 48 56 72
//   • Bar heights are fixed: TopBar 56 · SubBar 48 · BottomBar 56 · NavBar 64
//   • Corner radius: 8 (rounded-lg)
//
// ALL Part 3 code (screens, cards, rows, bars) must use these values — either
// the constants below (for logic) or the exported class strings (for JSX).
// Legacy Part 1/2 views are exempt until they are rebuilt (see worklog p3-9).
// ─────────────────────────────────────────────────────────────────────────────

/** Allowed spacing steps in px. Tailwind: 1=4 2=8 3=12 4=16 6=24 8=32. */
export const SPACING = [4, 8, 12, 16, 24, 32] as const;
export type Spacing = (typeof SPACING)[number];

/** Allowed row heights in px. Tailwind: h-10 h-12 h-14 h-18. */
export const ROW_HEIGHTS = [40, 48, 56, 72] as const;
export type RowHeight = (typeof ROW_HEIGHTS)[number];

/** Fixed bar heights in px. These match the primitives in src/components/layout. */
export const BAR_HEIGHTS = {
  /** TopBar — h-14 */
  top: 56,
  /** SubBar — h-12 */
  sub: 48,
  /** BottomBar — h-14 */
  bottom: 56,
  /** NavBar — h-16 (+ env(safe-area-inset-bottom)) */
  nav: 64,
} as const;

/** Global corner radius (rounded-lg). */
export const RADIUS = 8;

/** Content column: max width on mobile/tablet, and on desktop (lg two-pane). */
export const CONTENT_MAX_WIDTH = 720;
export const CONTENT_MAX_WIDTH_LG = 1100;

// ── Shared class-name strings for the common row patterns ───────────────────
// Every [data-row] in Part 3 must be single-line (no wrap, no vertical growth):
// h-* from ROW_HEIGHTS + items-center + nowrap + overflow hidden.

/** 40px row — the standard list row (h-10). */
export const rowBase = "h-10 flex items-center whitespace-nowrap overflow-hidden";

/** 40px CSS-grid row — the SetRow / add-set-row pattern (display: grid). */
export const rowGrid = "h-10 grid items-center whitespace-nowrap overflow-hidden";

/** 48px row — comfortable row with secondary text / SubBar-level density (h-12). */
export const rowTall = "h-12 flex items-center whitespace-nowrap overflow-hidden";

/** 56px row — TopBar/BottomBar density, large list rows (h-14). */
export const rowBar = "h-14 flex items-center whitespace-nowrap overflow-hidden";

/** 72px row — hero rows: cards with two text lines + trailing control (h-18). */
export const rowHero = "h-18 flex items-center whitespace-nowrap overflow-hidden";

/** ScrollBody content column: centered, 720px → 1100px at lg. */
export const contentColumn =
  "mx-auto w-full max-w-[720px] px-4 py-4 flex flex-col gap-3 lg:max-w-[1100px] lg:px-6";
