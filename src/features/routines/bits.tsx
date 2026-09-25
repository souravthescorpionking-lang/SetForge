"use client";

// Small shared building blocks for the Routines feature.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { GripVertical } from "lucide-react";
import type { Transition } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Drag handle for dnd-kit sortable rows. Spread the sortable
 * `attributes` + `listeners` onto it as props.
 */
export function DragHandle({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label="Drag to reorder"
      tabIndex={-1}
      className={cn(
        "flex h-11 w-7 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground active:cursor-grabbing",
        className,
      )}
      {...rest}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
}

/** Muted dashed badge — used for "copy previous" hints on blank sets. */
export function GhostBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-md border border-dashed border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Spring used for expand/collapse transitions (routine detail, set lists). */
export const expandSpring: Transition = { type: "spring", stiffness: 400, damping: 36 };
