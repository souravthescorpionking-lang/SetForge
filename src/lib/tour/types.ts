// ─────────────────────────────────────────────────────────────────────────────
// Tour system core types (Part 7).
//
// LAW 1: tour content is NEVER hand-written in content files — it is declared
// inline on the UI element that owns it (`tourAttrs({...})` / `tour={...}` /
// shared-component `TourDecl[]` arrays) and harvested into the generated
// registry by `pnpm tour:gen` (scripts/tour-gen.ts).
//
// The runtime DOM contract: any element with a declaration renders
// `data-tour-id={decl.id}` on its root node. The overlay engine targets
// elements purely by that attribute.
// ─────────────────────────────────────────────────────────────────────────────

/** Context gates — a step shows only when the screen context matches. */
export type TourWhen =
  | "always"
  | "empty" // screen has no data yet
  | "populated" // screen has data
  | "edit" // an edit/new mode is active
  | "select" // a selection mode is active
  | "guided" // guided session mode is on
  | "resting" // a rest timer is running
  | "desktop" // viewport ≥ lg
  | "mobile"; // viewport < lg

/** Inline declaration placed on an interactive element. */
export type TourDecl = {
  /** `<screenId>.<elementKey>` or `<componentId>.<elementKey>`. */
  id: `${string}.${string}`;
  /** ≤ 3 words — the bold row label in the tour card / help page. */
  label: string;
  /** ≤ 90 chars — one sentence of what this control does. */
  help: string;
  /** Steps sort ascending; declare with gaps of 10 (10, 20, …). */
  order: number;
  /** Context gates (default ['always']). */
  when?: TourWhen[];
  /** Contextual hint instead of a numbered tour step (shown once). */
  hint?: boolean;
  /** Preferred card placement relative to the target. */
  placement?: "top" | "bottom" | "left" | "right" | "auto";
  /** Keyboard shortcut chip shown in help (e.g. "?"). */
  shortcut?: string;
  /** CSS selector of a collapsible parent to expand before measuring. */
  expandFirst?: string;
} | {
  /** Explicit opt-out — reason is enforced ≥ 10 chars. */
  skipTour: true;
  reason: string;
};

/** Screen metadata — declared once at the top of every screen module. */
export type ScreenRegistration = {
  /** Route name from src/features/shell/router.ts (e.g. "home"). */
  id: string;
  /** Human title (matches the TopBar title). */
  title: string;
  /** ≤ 120 chars — one line on the help page and the welcome tour. */
  purpose: string;
  /** Alternative purpose shown on the help page when the screen is empty. */
  emptyPurpose?: string;
  /** Group screens under a parent on the help page (e.g. "programs"). */
  parent?: string;
};

/** A compiled step in the generated registry. */
export type TourStep = {
  id: string;
  label: string;
  help: string;
  order: number;
  when: TourWhen[];
  hint: boolean;
  placement: "top" | "bottom" | "left" | "right" | "auto";
  shortcut?: string;
  expandFirst?: string;
  /** Where the declaration lives: 'screen' steps or 'component' (shared) steps. */
  scope: "screen" | "component";
};

export type ScreenTourEntry = {
  title: string;
  purpose: string;
  emptyPurpose?: string;
  parent?: string;
  steps: TourStep[];
  /** Deterministic hash of {title, purpose, steps} — bumps when content changes. */
  version: string;
};

export type ComponentTourEntry = {
  steps: TourStep[];
};

/** Shape of src/generated/tour-registry.json (committed; deterministic). */
export type TourRegistry = {
  /** Whole-registry version (hash of all content). */
  version: string;
  screens: Record<string, ScreenTourEntry>;
  /** Shared components (nav, exerciseCard, setRow, …) declare steps once. */
  components: Record<string, ComponentTourEntry>;
  /** Composed at gen time: NavBar steps + home purpose + settings entry. */
  welcome: {
    steps: TourStep[];
    version: string;
  };
};
