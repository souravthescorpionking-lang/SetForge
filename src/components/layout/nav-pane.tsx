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
} from "lucide-react";
import type { SessionDTO } from "@/lib/types";
import { useHashSegment } from "./use-hash-segment";

interface PaneDestination {
  key: string;
  label: string;
  hash: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DESTINATIONS: readonly PaneDestination[] = [
  { key: "home", label: "Home", hash: "#/home", icon: Flame },
  { key: "today", label: "Today", hash: "#/today", icon: Dumbbell },
  { key: "calendar", label: "Calendar", hash: "#/calendar", icon: CalendarDays },
  { key: "programs", label: "Programs", hash: "#/programs", icon: Repeat2 },
  { key: "body", label: "Body", hash: "#/body", icon: Ruler },
  { key: "insights", label: "Insights", hash: "#/insights", icon: BarChart3 },
  { key: "history", label: "History", hash: "#/history", icon: History },
  { key: "exercises", label: "Exercises", hash: "#/exercises", icon: Dumbbell },
  { key: "tools", label: "Tools", hash: "#/tools", icon: Calculator },
  { key: "settings", label: "Settings", hash: "#/settings", icon: Settings },
  { key: "help", label: "Help", hash: "#/help", icon: CircleHelp },
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
