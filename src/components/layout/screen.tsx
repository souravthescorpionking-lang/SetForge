"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Screen — the root container of every Part 3 screen.
//
// LAYOUT ENGINE LAW 10: every screen is a vertical stack of
//   TopBar → [optional SubBar] → ScrollBody → [optional BottomBar] → NavBar
// Nothing else. All bars are plain flex siblings (position: static — NEVER
// fixed/absolute), so no content can ever sit behind a bar and no bar can ever
// overlap content. The screen itself is height-locked (100dvh, overflow hidden):
// exactly ONE vertical scroll container exists per screen (the ScrollBody).
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import { NavBar } from "./nav-bar";

export interface ScreenProps {
  /** 56px top bar (TopBar primitive recommended). */
  topBar?: ReactNode;
  /** 48px secondary bar (SubBar primitive recommended). */
  subBar?: ReactNode;
  /** 56px bottom action bar (BottomBar primitive recommended). */
  bottomBar?: ReactNode;
  /** Render the mobile/tablet NavBar (default true). Hidden ≥lg regardless. */
  nav?: boolean;
  /** The ScrollBody — the only vertical scroll container of the screen. */
  children: ReactNode;
}

export function Screen({ topBar, subBar, bottomBar, nav = true, children }: ScreenProps) {
  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      {topBar}
      {subBar}
      {children}
      {bottomBar}
      {nav ? <NavBar /> : null}
    </div>
  );
}
