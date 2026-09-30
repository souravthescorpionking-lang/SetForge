"use client";

// ScrollBody — the ONLY vertical scroll container of any Part 3 screen
// (LAW 6: one scroll per screen; LAW 8: bars reserve space as flex siblings,
// so nothing scrolls behind a bar).
//
// The scrolling element carries data-scroll-body (used by the QA harness,
// scripts/qa/verify-layout.sh, to check scroll-top and scroll-bottom states).
// The inner wrapper centers the Part 8 phone column: max 480px at every width.

import type { UIEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ScrollBodyProps {
  children: ReactNode;
  /** Extra classes for the scrolling element (the data-scroll-body element). */
  className?: string;
  /** Extra classes for the inner centered content wrapper. */
  contentClassName?: string;
  /** Part 10 §3.1: scroll-position observer (FocusCard collapses past 80px).
   *  Attaches to the scrolling element itself — still ONE scroll container. */
  onScroll?: (scrollTop: number, event: UIEvent<HTMLDivElement>) => void;
}

export function ScrollBody({ children, className, contentClassName, onScroll }: ScrollBodyProps) {
  return (
    <div
      data-scroll-body
      className={cn("flex-1 min-h-0 overflow-y-auto", className)}
      onScroll={onScroll ? (e) => onScroll(e.currentTarget.scrollTop, e) : undefined}
    >
      <div
        className={cn(
          "mx-auto w-full max-w-[480px] flex-col gap-3 px-4 py-4",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
