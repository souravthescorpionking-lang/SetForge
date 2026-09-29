// Part 8 layout primitives — barrel export (phone-only).
// Laws: bars are plain flex siblings (never fixed/absolute); the ScrollBody is
// the only vertical scroll container on any screen; heights are fixed
// (TopBar/SubBar/BottomBar/NavBar = 56/48/56/64px); the content column is a
// centered max-width 480px phone column. See src/lib/ui/tokens.ts.

export { Screen } from "./screen";
export type { ScreenProps } from "./screen";

export { TopBar } from "./top-bar";
export type { TopBarProps } from "./top-bar";

export { SubBar } from "./sub-bar";
export type { SubBarProps } from "./sub-bar";

export { ScrollBody } from "./scroll-body";
export type { ScrollBodyProps } from "./scroll-body";

export { BottomBar } from "./bottom-bar";
export type { BottomBarProps } from "./bottom-bar";

export { NavBar } from "./nav-bar";

export { TopBarHelp, TOURHELP_DECL } from "./top-bar-help";

export { useHashSegment } from "./use-hash-segment";
