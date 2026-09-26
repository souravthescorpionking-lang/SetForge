"use client";

// TopBar — fixed 56px (h-14) header slot row. A plain flex sibling inside
// Screen: never fixed, never absolute, never overlaps content.

import type { ReactNode } from "react";

export interface TopBarProps {
  /** Leading slot: back button, brand, avatar… (keep items ≥44px touch targets). */
  leading?: ReactNode;
  /** Single-line flexible title; ellipsizes on overflow. */
  title?: ReactNode;
  /** Trailing actions. */
  actions?: ReactNode;
}

export function TopBar({ leading, title, actions }: TopBarProps) {
  return (
    <header className="flex h-14 flex-none items-center gap-2 border-b border-border px-4">
      {leading}
      <div className="min-w-0 flex-1 truncate text-base font-semibold leading-none">{title}</div>
      {actions}
    </header>
  );
}
