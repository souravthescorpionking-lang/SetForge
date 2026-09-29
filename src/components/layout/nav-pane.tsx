"use client";

// NavPane — desktop-only (≥lg) left pane. Exactly 360px wide, plain flex
// sibling of the screen pane in the shell (never fixed/absolute).
//
// Part 5 destinations: Home · Today · Calendar · Programs · Body · Insights ·
// History · Exercises · Tools · Settings · Help (48px rows, active state
// orange) + user chip pinned at the bottom. The chip links to #/settings
// where account/sign-out lives.

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Flame,
  CalendarDays,
  History,
  Dumbbell,
  Repeat2,
  Ruler,
  BarChart3,
  Calculator,
  Settings,
  CircleHelp,
  ChevronRight,
  BookOpen,
  UserRound,
} from "lucide-react";
import type { SessionDTO } from "@/lib/types";
import { useHashSegment } from "./use-hash-segment";
import type { TourDecl } from "@/lib/tour/types";

interface PaneDestination {
  key: string;
  label: string;
  hash: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Shared tour declaration (LAW 3) — desktop-only steps. */
  tour: TourDecl;
}

const DESTINATIONS: readonly PaneDestination[] = [
  { key: "home", label: "Home", hash: "#/home", icon: Flame,
    tour: { id: "navpane.home", label: "Home link", help: "Your dashboard: today's session, stats and recent logs.", order: 100, when: ["desktop"] } },
  { key: "today", label: "Today", hash: "#/today", icon: Dumbbell,
    tour: { id: "navpane.today", label: "Today link", help: "The set-by-set workout logger with timer and rest.", order: 110, when: ["desktop"] } },
  { key: "calendar", label: "Calendar", hash: "#/calendar", icon: CalendarDays,
    tour: { id: "navpane.calendar", label: "Calendar link", help: "Month dots and day lists of everything you logged.", order: 120, when: ["desktop"] } },
  { key: "programs", label: "Programs", hash: "#/programs", icon: Repeat2,
    tour: { id: "navpane.programs", label: "Programs link", help: "Routines, sessions and the program builder.", order: 130, when: ["desktop"] } },
  { key: "body", label: "Body", hash: "#/body", icon: Ruler,
    tour: { id: "navpane.body", label: "Body link", help: "Measurements, progress photos and compare view.", order: 140, when: ["desktop"] } },
  { key: "insights", label: "Insights", hash: "#/insights", icon: BarChart3,
    tour: { id: "navpane.insights", label: "Insights link", help: "Records, stats and goals with progress.", order: 150, when: ["desktop"] } },
  { key: "history", label: "History", hash: "#/history", icon: History,
    tour: { id: "navpane.history", label: "History link", help: "Chronological workout log with edit, copy and share.", order: 160, when: ["desktop"] } },
  { key: "exercises", label: "Exercises", hash: "#/exercises", icon: Dumbbell,
    tour: { id: "navpane.exercises", label: "Exercises link", help: "Full catalogue with categories, favourites and notes.", order: 170, when: ["desktop"] } },
  { key: "library", label: "Library", hash: "#/library", icon: BookOpen,
    tour: { id: "navpane.library", label: "Library link", help: "Browse the built-in exercise encyclopedia in detail.", order: 180, when: ["desktop"] } },
  { key: "profile", label: "Profile", hash: "#/profile", icon: UserRound,
    tour: { id: "navpane.profile", label: "Profile link", help: "Your account profile and preferences.", order: 190, when: ["desktop"] } },
  { key: "tools", label: "Tools", hash: "#/tools", icon: Calculator,
    tour: { id: "navpane.tools", label: "Tools link", help: "1RM, set and plate calculators plus the timer.", order: 200, when: ["desktop"] } },
  { key: "settings", label: "Settings", hash: "#/settings", icon: Settings,
    tour: { id: "navpane.settings", label: "Settings link", help: "Theme, units, columns, data and account controls.", order: 210, when: ["desktop"] } },
  { key: "help", label: "Help", hash: "#/help", icon: CircleHelp,
    tour: { id: "navpane.help", label: "Help link", help: "Searchable help for every screen and shortcut.", order: 220, when: ["desktop"] } },
];

export interface NavPaneProps {
  /** Session of the signed-in user (user chip). */
  session: SessionDTO;
}

export function NavPane({ session }: NavPaneProps) {
  const segment = useHashSegment();
  const displayName = session.user.name ?? session.user.email;
  const initials =
    displayName
      .split(/[\s@.]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "SF";

  return (
    <aside className="hidden w-[360px] flex-none flex-col border-r border-border bg-sidebar lg:flex">
      {/* Brand header — exactly 56px */}
      <div className="flex h-14 flex-none items-center gap-3 border-b border-border px-4">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Flame className="h-4.5 w-4.5" aria-hidden />
        </span>
        <span className="text-lg font-black leading-none tracking-tight">SetForge</span>
      </div>

      {/* Nav list — 48px rows, all destinations */}
      <nav className="min-h-0 flex-1 overflow-y-auto py-2" aria-label="Main">
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
                "flex h-12 w-full items-center gap-3 px-4 text-sm font-medium outline-none",
                "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4.5 w-4.5 flex-none" aria-hidden />
              <span className="truncate">{d.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User chip pinned at the bottom — links to #/settings (account/sign-out) */}
      <div className="flex-none border-t border-border p-4">
        <button
          type="button"
          data-tour-id="navpane.account"
          onClick={() => {
            window.location.hash = "#/settings";
          }}
          aria-label="Account and settings"
          className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="h-9 w-9 flex-none border border-border/60">
            <AvatarFallback className="bg-primary/10 text-xs font-black text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight">
              {session.user.name ?? "Athlete"}
            </span>
            <span className="block truncate text-xs leading-tight text-muted-foreground">
              {session.user.email}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
