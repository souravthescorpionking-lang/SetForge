"use client";

// ScrollBody — the ONLY vertical scroll container of any Part 3 screen
// (LAW 6: one scroll per screen; LAW 8: bars reserve space as flex siblings,
// so nothing scrolls behind a bar).
//
// The scrolling element carries data-scroll-body (used by the QA harness,
// scripts/qa/verify-layout.sh, to check scroll-top and scroll-bottom states).
// The inner wrapper centers a content column: max 720px on mobile/tablet,
// 1100px + wider gutters on desktop (lg).

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ScrollBodyProps {
  children: ReactNode;
  /** Extra classes for the scrolling element (the data-scroll-body element). */
  className?: string;
  /** Extra classes for the inner centered content wrapper. */
  contentClassName?: string;
}

export function ScrollBody({ children, className, contentClassName }: ScrollBodyProps) {
  return (
    <div
      data-scroll-body
      className={cn("flex-1 min-h-0 overflow-y-auto", className)}
    >
      <div
        className={cn(
          "mx-auto w-full max-w-[720px] flex-col gap-3 px-4 py-4 lg:max-w-[1100px] lg:px-6",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
