"use client";

// BottomBar — fixed 56px (h-14) action bar pinned above the NavBar.
// Actions live here (LAW 7: no floating buttons over content) and it reserves
// its space as a plain flex sibling (LAW 8: nothing behind bars).

import type { ReactNode } from "react";

export interface BottomBarProps {
  children?: ReactNode;
}

export function BottomBar({ children }: BottomBarProps) {
  return (
    <div className="flex h-14 flex-none items-center gap-3 border-t border-border bg-card px-4">
      {children}
    </div>
  );
}
