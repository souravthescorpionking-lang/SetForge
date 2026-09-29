"use client";

// NavBar — Part 8 phone-only bottom tab bar. Exactly 64px (h-16) + safe-area
// inset. THREE destinations — Workout · Dashboard · More (Law 1: no desktop
// pane; this bar renders at every width). A plain flex sibling inside the
// screen stack (never position:fixed), so it can never cover content.
//
// Active tab = orange tint. Every item is a full 64px cell (≥44px touch
// target) with a single-line, non-wrapping label.

import { cn } from "@/lib/utils";
import { Dumbbell, LayoutDashboard, MoreHorizontal } from "lucide-react";
import { useHashSegment } from "./use-hash-segment";
import type { TourDecl } from "@/lib/tour/types";

interface NavDestination {
  /** Hash path segment this tab is active on. */
  key: string;
  label: string;
  hash: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Shared tour declaration for this tab (LAW 3: declared once here). */
  tour: TourDecl;
}

const DESTINATIONS: readonly NavDestination[] = [
  {
    key: "workout", label: "Workout", hash: "#/workout", icon: Dumbbell,
    tour: { id: "nav.workout", label: "Workout tab", help: "Start today's session and reach programs, logs and the builder.", order: 100 },
  },
  {
    key: "dashboard", label: "Dashboard", hash: "#/dashboard", icon: LayoutDashboard,
    tour: { id: "nav.dashboard", label: "Dashboard tab", help: "Today at a glance: upcoming, weekly stats, body and records.", order: 110 },
  },
  {
    key: "more", label: "More", hash: "#/more", icon: MoreHorizontal,
    tour: { id: "nav.more", label: "More tab", help: "Body, records, tools, dictionary, settings, backup and help.", order: 120 },
  },
];

export function NavBar() {
  const segment = useHashSegment();
  return (
    <nav
      aria-label="Primary"
      className="flex-none border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto grid h-16 w-full max-w-[480px] grid-cols-3">
        {DESTINATIONS.map((d) => {
          const active = segment === d.key;
          const Icon = d.icon;
          return (
            <button
              key={d.key}
              type="button"
              data-tour-id={"skipTour" in d.tour ? undefined : d.tour.id}
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
