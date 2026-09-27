"use client";

// NavBar — mobile/tablet bottom tab bar. Exactly 64px (h-16) + safe-area inset;
// hidden ≥lg (desktop uses NavPane instead). A plain flex sibling inside the
// screen stack (never position:fixed), so it can never cover content.
//
// Part 5: 5 destinations — Home · Calendar · Programs · Body · More
// (grid-cols-5; secondary destinations live behind #/more). Active tab =
// orange tint. Every item is a full 64px cell (≥44px touch target) with a
// single-line, non-wrapping label.

import { cn } from "@/lib/utils";
import {
  Flame,
  CalendarDays,
  Repeat2,
  Ruler,
  MoreHorizontal,
} from "lucide-react";
import { useHashSegment } from "./use-hash-segment";

interface NavDestination {
  /** Hash path segment this tab is active on. */
  key: string;
  label: string;
  hash: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DESTINATIONS: readonly NavDestination[] = [
  { key: "home", label: "Home", hash: "#/home", icon: Flame },
  { key: "calendar", label: "Calendar", hash: "#/calendar", icon: CalendarDays },
  { key: "programs", label: "Programs", hash: "#/programs", icon: Repeat2 },
  { key: "body", label: "Body", hash: "#/body", icon: Ruler },
  { key: "more", label: "More", hash: "#/more", icon: MoreHorizontal },
];

export function NavBar() {
  const segment = useHashSegment();
  return (
    <nav
      aria-label="Primary"
      className="flex-none border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="grid h-16 grid-cols-5">
        {DESTINATIONS.map((d) => {
          const active = segment === d.key;
          const Icon = d.icon;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => {
                window.location.hash = d.hash;
              }}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[44px] flex-col items-center justify-center gap-1 px-1 outline-none",
                "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span className="w-full truncate text-center text-[10px] font-semibold leading-none">
                {d.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
