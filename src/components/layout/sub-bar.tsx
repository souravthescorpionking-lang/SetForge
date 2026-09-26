"use client";

// SubBar — fixed 48px (h-12) secondary slot row (filter chips, tab strips,
// segmented controls). A plain flex sibling inside Screen.

import type { ReactNode } from "react";

export interface SubBarProps {
  children?: ReactNode;
}

export function SubBar({ children }: SubBarProps) {
  return (
    <div className="flex h-12 flex-none items-center gap-2 border-b border-border px-4">
      {children}
    </div>
  );
}
