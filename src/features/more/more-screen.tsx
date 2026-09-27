"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MoreScreen — #/more (Part 5). Secondary destinations that no longer fit the
// 5-tab NavBar live here: 56px data-rows (icon + label + hint + chevron), one
// per destination. Screen/TopBar/ScrollBody primitives only — no cards, no
// dialogs.
// ─────────────────────────────────────────────────────────────────────────────

import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { BarChart3, History, Dumbbell, Wrench, Settings, CircleHelp, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MoreDestination {
  key: string;
  label: string;
  hint: string;
  hash: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DESTINATIONS: readonly MoreDestination[] = [
  { key: "insights", label: "Insights", hint: "records · stats · goals", hash: "#/insights", icon: BarChart3 },
  { key: "history", label: "History", hint: "past workouts", hash: "#/history", icon: History },
  { key: "exercises", label: "Exercises", hint: "library · favourites", hash: "#/exercises", icon: Dumbbell },
  { key: "tools", label: "Tools", hint: "1RM · plates · timer", hash: "#/tools", icon: Wrench },
  { key: "settings", label: "Settings", hint: "preferences · account", hash: "#/settings", icon: Settings },
  { key: "help", label: "Help", hint: "tour · shortcuts", hash: "#/help", icon: CircleHelp },
];

export default function MoreScreen() {
  return (
    <Screen topBar={<TopBar title="More" />}>
      <ScrollBody>
        <nav aria-label="More destinations" className="flex flex-col gap-2">
          {DESTINATIONS.map((d) => {
            const Icon = d.icon;
            return (
              <button
                key={d.key}
                type="button"
                data-row
                aria-label={`${d.label} — ${d.hint}`}
                onClick={() => {
                  window.location.hash = d.hash;
                }}
                className={cn(
                  "flex h-14 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3 text-left",
                  "transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                )}
              >
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                  <span className="truncate text-sm font-semibold leading-none">{d.label}</span>
                  <span className="truncate text-xs leading-none text-muted-foreground">{d.hint}</span>
                </span>
                <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
              </button>
            );
          })}
        </nav>
      </ScrollBody>
    </Screen>
  );
}
