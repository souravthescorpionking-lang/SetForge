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
import HomeScreen from "@/features/screens/home";
import TodayScreen from "@/features/screens/today";
import TrainingScreen from "@/features/screens/training";
import CalendarScreen from "@/features/screens/calendar";
import CalendarFiltersScreen from "@/features/screens/calendar-filters";
import HistoryScreen from "@/features/screens/history";
import ExercisePickerScreen from "@/features/screens/picker";
import ProgramsScreen from "@/features/screens/programs";
import ProgramDetailScreen from "@/features/screens/program-detail";
import LogDayScreen from "@/features/screens/log-day";
import PredefinedEditorScreen from "@/features/screens/predefined-editor";
import SchedulePickScreen from "@/features/screens/schedule-pick";
import MoreScreen from "@/features/screens/more";
import BodyScreen from "@/features/screens/body";
import RecordsScreen from "@/features/screens/records";
import ToolsScreen from "@/features/screens/tools";
import SettingsScreen from "@/features/screens/settings";
import HelpScreen from "@/features/screens/help";
import AuthScreen from "@/features/screens/auth";
import DevShowcaseScreen from "@/features/screens/dev-showcase";
import ExerciseOverviewScreen from "@/features/screens/exercise-overview";
// ---- Part 6 ----
import LibraryScreen from "@/features/screens/library";
import LibraryEntryScreen from "@/features/screens/library-entry";
import ProgramDayScreen from "@/features/screens/program-day";
import DayArrangeScreen from "@/features/screens/day-arrange";
import ProgramBuilderScreen from "@/features/screens/program-builder";
import TodayArrangeScreen from "@/features/screens/today-arrange";
import DictionaryScreen from "@/features/screens/dictionary";
import OnboardingScreen from "@/features/screens/onboarding";
import ProfileScreen from "@/features/screens/profile";
import BodyCompareScreen from "@/features/screens/body-compare";
import { ScreenErrorBoundary } from "@/components/shared/screen-error-boundary";
import { profileApi } from "@/lib/client/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function AppShell({ initialSession }: { initialSession: SessionDTO | null }) {
  const storeSession = useApp((s) => s.session);
  const hydrated = useApp((s) => s.hydrated);
  const route = useHashRoute();
  const queryClient = useQueryClient();

  // Until the store bootstrap effect runs, trust the SSR session (avoids an
  // auth-screen flash on logged-in loads). After logout the store stays
  // hydrated with a null session, so the gate still triggers correctly.
  const session = hydrated ? storeSession : initialSession;

  // Part 6 onboarding gate: after login, while profile.onboardingCompletedAt is
  // null, redirect to #/onboarding (Skip is always available there).
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileApi.get(),
    enabled: Boolean(session),
    staleTime: Infinity,
  });

  // Auth gate routing. replaceHash swaps the current history entry, so the
  // browser back button never gets stuck bouncing between gates.
  useEffect(() => {
    if (!session) {
      if (route.name !== "auth") replaceHash("#/auth");
    } else if (route.name === "auth") {
      replaceHash("#/home");
    } else if (
      profile &&
      profile.onboardingCompletedAt == null &&
      route.name !== "onboarding" &&
      route.name !== "settings" &&
      route.name !== "help"
    ) {
      replaceHash("#/onboarding");
    }
  }, [session, route.name, profile, queryClient]);

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
      <div className="flex min-w-0 flex-1 flex-col">
        <ScreenErrorBoundary route={route.name}>{renderScreen(route)}</ScreenErrorBoundary>
      </div>
    </div>
  );
}

function renderScreen(route: Route): ReactNode {
  switch (route.name) {
    case "home":
      return <HomeScreen />;
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
    case "programs":
      return <ProgramsScreen />;
    case "program-detail":
      return <ProgramDetailScreen routineId={route.params.routineId} />;
    case "log-day":
      return <LogDayScreen routineId={route.params.routineId} dayId={route.params.dayId} />;
    case "predefined-editor":
      return (
        <PredefinedEditorScreen routineId={route.params.routineId} reId={route.params.reId} />
      );
    case "schedule-pick":
      return <SchedulePickScreen />;
    case "more":
      return <MoreScreen />;
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
      // render Home for that single frame.
      return <HomeScreen />;
    case "dev":
      return <DevShowcaseScreen />;
    case "exercise-overview":
      return <ExerciseOverviewScreen exerciseId={route.params.exerciseId} />;
    // ---- Part 6 ----
    case "library":
      return <LibraryScreen />;
    case "library-entry":
      return <LibraryEntryScreen catalogKey={route.params.catalogKey} />;
    case "program-day":
      return <ProgramDayScreen routineId={route.params.routineId} dayId={route.params.dayId} />;
    case "day-arrange":
      return <DayArrangeScreen routineId={route.params.routineId} dayId={route.params.dayId} />;
    case "today-arrange":
      return <TodayArrangeScreen />;
    case "program-builder":
      return <ProgramBuilderScreen />;
    case "dictionary":
      return <DictionaryScreen />;
    case "onboarding":
      return <OnboardingScreen />;
    case "profile":
      return <ProfileScreen />;
    case "body-compare":
      return <BodyCompareScreen />;
  }
}
