// Part 3 layout primitives — barrel export.
// Laws: bars are plain flex siblings (never fixed/absolute); the ScrollBody is
// the only vertical scroll container on any screen; heights are fixed
// (TopBar/SubBar/BottomBar/NavBar = 56/48/56/64px); content column is centered
// (720px → 1100px at lg). See src/lib/ui/tokens.ts for the value contract.

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

export { NavPane } from "./nav-pane";
export type { NavPaneProps } from "./nav-pane";

export { useHashSegment } from "./use-hash-segment";
