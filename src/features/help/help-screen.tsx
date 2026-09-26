"use client";

// ─────────────────────────────────────────────────────────────────────────────
// HelpScreen — #/help (Part 4 audit P5).
//
// Layout laws: Screen → TopBar (56, back to Settings) → ScrollBody (the single
// scroll). Pure static prose sections — no rows of data, no cards, no dialogs.
// Content: feature tour, keyboard shortcuts, offline behaviour, data tools.
// ─────────────────────────────────────────────────────────────────────────────

import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Keyboard, WifiOff, Database, Flame } from "lucide-react";
import { replaceHash, useHashRoute } from "@/features/shell/router";

type Section = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: Array<{ term: string; desc: string }>;
};

const SECTIONS: Section[] = [
  {
    icon: Flame,
    title: "Features",
    items: [
      { term: "Today", desc: "Log workouts set-by-set: date strip, live timer, exercise cards with inline set editing, groups, rest bar, per-workout summary." },
      { term: "Training view", desc: "Tap any exercise name → Track, History and Graph tabs, records (estimated + actual PRs), goals, notes, and tools (1RM, set & plate calculators)." },
      { term: "Exercises", desc: "Full catalogue with categories, favourites, recents, custom exercises, per-exercise notes and defaults." },
      { term: "Routines", desc: "Reusable day templates with predefined sets (type, RPE, tempo, rest), groups and one-tap Log Day → Today." },
      { term: "Calendar", desc: "Month dots + list view, per-day summaries, powerful filters (categories, exercises, duration, volume)." },
      { term: "History", desc: "Chronological workout log, inline editing, copy, move, share-as-text." },
      { term: "Body tracker", desc: "Measurement tracking with goals, Δ history table and per-measurement graphs." },
      { term: "Insights", desc: "Records, stats (week/month/year/all, custom periods) and goals with progress." },
      { term: "Tools", desc: "1RM table, set calculator, plate loader and interval timer — all offline-capable." },
      { term: "Settings", desc: "Theme, units, week start, columns, rest behaviour, e1RM method, backup/restore, account." },
    ],
  },
  {
    icon: Keyboard,
    title: "Keyboard shortcuts (desktop)",
    items: [
      { term: "?", desc: "Open this help page" },
      { term: "N", desc: "Add an exercise (jump to the picker)" },
      { term: "/", desc: "Focus the search field on the current screen" },
      { term: "Tab", desc: "Move between set cells" },
      { term: "Enter", desc: "Commit a cell / move to the next row; on the last column it adds a new set" },
      { term: "↑ / ↓", desc: "Move between rows in the same column while editing" },
      { term: "Esc", desc: "Close a popover or menu" },
    ],
  },
  {
    icon: WifiOff,
    title: "Offline",
    items: [
      { term: "Works offline", desc: "Set edits made while offline are queued in an outbox and replayed automatically when you reconnect." },
      { term: "Offline banner", desc: "A banner appears with the queued-change count while you are offline." },
      { term: "Install as app", desc: "Use your browser's Install / Add to Home Screen action — SetForge runs standalone." },
    ],
  },
  {
    icon: Database,
    title: "Your data",
    items: [
      { term: "Backup", desc: "Settings → Data → Download backup produces a full JSON snapshot of your account." },
      { term: "Restore", desc: "Import accepts your own backups in Replace or Merge mode (other accounts' backups are rejected)." },
      { term: "Export CSV", desc: "Workout and body-movement history can be exported as CSV for spreadsheets." },
      { term: "Delete", desc: "Delete history (all / date range / by exercise) and delete account are both available with confirmation." },
    ],
  },
];

export default function HelpScreen() {
  const route = useHashRoute();

  return (
    <Screen
      topBar={
        <TopBar
          title="Help & Shortcuts"
          leading={
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-11 px-0"
              aria-label="Back to settings"
              onClick={() => replaceHash(route.query.get("from") === "settings" ? "#/settings" : "#/today")}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
        />
      }
    >
      <ScrollBody contentClassName="gap-6">
        <p className="flex-none text-sm leading-relaxed text-muted-foreground">
            SetForge is a workout tracker built for speed: one tap per set, zero clutter.
            Everything below works on your own account — your data never mixes with anyone else&apos;s.
          </p>

          {SECTIONS.map((section) => (
            <section key={section.title} className="flex flex-none flex-col gap-2" aria-label={section.title}>
              <h2 className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <section.icon className="h-4 w-4" aria-hidden />
                {section.title}
              </h2>
              <dl className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                {section.items.map((item, i) => (
                  <div
                    key={item.term}
                    className={`flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4 ${i > 0 ? "border-t border-border" : ""}`}
                  >
                    <dt className="min-w-0 flex-none text-sm font-semibold sm:w-44 sm:shrink-0">{item.term}</dt>
                    <dd className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">{item.desc}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          <p className="flex-none px-1 pb-2 text-xs text-muted-foreground">
            Version 1.0.0 · For deployment, environment and database-switching documentation see the project README.
          </p>
      </ScrollBody>
    </Screen>
  );
}
