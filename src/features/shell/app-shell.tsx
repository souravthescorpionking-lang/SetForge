"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AppShell — the Part 3 application shell (replaces the old nav-shell chrome).
//
// Authenticated layout:
//   mobile/tablet  → [ screen stack (fills viewport, NavBar at bottom) ]
//   desktop (≥lg)  → NavPane 360px | right pane (screen stack)
// The right pane is a flex column; each screen owns its own chrome:
//   • legacy pass-through screens render [scroll area + <NavBar/>] themselves
//   • new Part 3 screens render <Screen> (TopBar/SubBar/ScrollBody/BottomBar/NavBar)
// so replacing a screen file never requires touching this shell.
//
// Unauthenticated: only the auth screen renders (hash is forced to #/auth).
// Authenticated #/auth redirects to #/today.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import type { ReactNode } from "react";
import { NavPane } from "@/components/layout";
import { useApp } from "@/lib/client/store";
import type { SessionDTO } from "@/lib/types";
import { replaceHash, useHashRoute, type Route } from "./router";

// Screen slots — the router imports ONLY from src/features/screens/*.
import TodayScreen from "@/features/screens/today";
import TrainingScreen from "@/features/screens/training";
import CalendarScreen from "@/features/screens/calendar";
import CalendarFiltersScreen from "@/features/screens/calendar-filters";
import HistoryScreen from "@/features/screens/history";
import ExercisePickerScreen from "@/features/screens/picker";
import RoutinesScreen from "@/features/screens/routines";
import RoutineDetailScreen from "@/features/screens/routine-detail";
import LogDayScreen from "@/features/screens/log-day";
import PredefinedEditorScreen from "@/features/screens/predefined-editor";
import BodyScreen from "@/features/screens/body";
import RecordsScreen from "@/features/screens/records";
import ToolsScreen from "@/features/screens/tools";
import SettingsScreen from "@/features/screens/settings";
import HelpScreen from "@/features/screens/help";
import AuthScreen from "@/features/screens/auth";
import DevShowcaseScreen from "@/features/screens/dev-showcase";
import ExerciseOverviewScreen from "@/features/screens/exercise-overview";

export function AppShell({ initialSession }: { initialSession: SessionDTO | null }) {
  const storeSession = useApp((s) => s.session);
  const hydrated = useApp((s) => s.hydrated);
  const route = useHashRoute();

  // Until the store bootstrap effect runs, trust the SSR session (avoids an
  // auth-screen flash on logged-in loads). After logout the store stays
  // hydrated with a null session, so the gate still triggers correctly.
  const session = hydrated ? storeSession : initialSession;

  // Auth gate routing. replaceHash swaps the current history entry, so the
  // browser back button never gets stuck bouncing between gates.
  useEffect(() => {
    if (!session) {
      if (route.name !== "auth") replaceHash("#/auth");
    } else if (route.name === "auth") {
      replaceHash("#/today");
    }
  }, [session, route.name]);

  // Global keyboard shortcuts (desktop, audit M5):
  //   ?  → Help & Shortcuts     N → add exercise (picker)     / → focus search
  // Ignored while typing in any editable element or with modifiers held.
  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) return;
      if (e.key === "?" ) {
        if (route.name !== "help") {
          replaceHash("#/help");
          e.preventDefault();
        }
        return;
      }
      if (e.key === "/" ) {
        const search = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[aria-label*="earch" i], input[placeholder*="earch" i]',
        );
        if (search) {
          search.focus();
          e.preventDefault();
        }
        return;
      }
      if (e.key === "n" || e.key === "N") {
        if (route.name !== "exercises") {
          replaceHash("#/exercises");
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, route.name]);

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground lg:flex-row">
      <NavPane session={session} />
      <div className="flex min-w-0 flex-1 flex-col">{renderScreen(route)}</div>
    </div>
  );
}

function renderScreen(route: Route): ReactNode {
  switch (route.name) {
    case "today":
      return <TodayScreen />;
    case "training":
      return <TrainingScreen exerciseId={route.params.exerciseId} />;
    case "calendar":
      return <CalendarScreen />;
    case "calendar-filters":
      return <CalendarFiltersScreen />;
    case "history":
      return <HistoryScreen />;
    case "exercises":
      return <ExercisePickerScreen />;
    case "routines":
      return <RoutinesScreen />;
    case "routine-detail":
      return <RoutineDetailScreen routineId={route.params.routineId} />;
    case "log-day":
      return <LogDayScreen routineId={route.params.routineId} dayId={route.params.dayId} />;
    case "predefined-editor":
      return (
        <PredefinedEditorScreen routineId={route.params.routineId} reId={route.params.reId} />
      );
    case "body":
      return <BodyScreen />;
    case "insights":
      return <RecordsScreen />;
    case "tools":
      return <ToolsScreen />;
    case "settings":
      return <SettingsScreen />;
    case "help":
      return <HelpScreen />;
    case "auth":
      // Authenticated visit of #/auth — the redirect effect is in flight;
      // render Today for that single frame.
      return <TodayScreen />;
    case "dev":
      return <DevShowcaseScreen />;
    case "exercise-overview":
      return <ExerciseOverviewScreen exerciseId={route.params.exerciseId} />;
  }
}
