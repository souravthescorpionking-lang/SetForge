"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ActionList — the app's pick-list primitive (L3: no bottom sheets; small
// anchored menus + full-screen routes are the only pick surfaces).
//
// A DropdownMenu whose content is a flat list of labelled rows with optional
// check state, used for ≤8 options (difficulty chips, tempo presets, video
// speed, day-entry actions). Bigger or filterable sets use full-screen routes
// (e.g. #/filters/equipment). Touch targets are 44px; `tour` is required on
// the trigger (declared by the caller via props).
// ─────────────────────────────────────────────────────────────────────────────

import { type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionListItem = {
  id: string;
  label: string;
  /** Check glyph on the right when true (current selection). */
  checked?: boolean;
  /** Destructive styling (4px red bar semantics → red text). */
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type ActionListProps = {
  /** The anchored control that opens the list (button with chip/label). */
  trigger: ReactNode;
  items: readonly ActionListItem[];
  /** Accessible name for the menu trigger region. */
  label: string;
  /** Align the popover to the start (default) or end of the trigger. */
  align?: "start" | "end";
  className?: string;
};

export function ActionList({ trigger, items, label, align = "start", className }: ActionListProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild aria-label={label} className={cn("focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md", className)}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[11rem]">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            disabled={item.disabled}
            aria-checked={item.checked ?? undefined}
            onSelect={(e) => {
              e.preventDefault(); // keep the list open behaviour predictable
              item.onSelect();
            }}
            className={cn(
              "flex h-11 items-center gap-2 text-sm",
              item.danger && "text-destructive focus:text-destructive",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.checked ? <Check className="h-4 w-4 flex-none text-primary" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
