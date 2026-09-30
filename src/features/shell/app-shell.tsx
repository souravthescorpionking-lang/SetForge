"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AppShell — the Part 8 phone-only application shell.
//
// Authenticated layout (Law 1): ONE centered column, max-width 480px:
//   [ screen stack: TopBar(56) → [SubBar(48)] → ScrollBody → [BottomBar(56)]
//     → NavBar(64: Workout · Dashboard · More) ]
// The Logging screen (#/session) renders without a NavBar (Law 2). There is no
// desktop two-pane — every screen owns its own chrome via <Screen>, so
// replacing a screen file never requires touching this shell.
//
// Unauthenticated: only the auth screen renders (hash is forced to #/auth).
// Authenticated #/auth redirects to #/workout.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useApp } from "@/lib/client/store";
import type { SessionDTO } from "@/lib/types";
import { replaceHash, useHashRoute, type Route } from "./router";

// Screen slots — the router imports ONLY from src/features/screens/*.
import WorkoutScreen from "@/features/screens/workout";
import DashboardScreen from "@/features/screens/dashboard";
import MoreScreen from "@/features/screens/more";
import SessionScreen from "@/features/screens/session";
import SessionSettingsScreen from "@/features/screens/session-settings";
import SessionExerciseScreen from "@/features/screens/session-exercise";
import SessionArrangeScreen from "@/features/screens/session-arrange";
import LogsScreen from "@/features/screens/logs";
import LogDetailScreen from "@/features/screens/log-detail";
import ProgramsScreen from "@/features/screens/programs";
import ProgramDetailScreen from "@/features/screens/program-detail";
import ProgramDayScreen from "@/features/screens/program-day";
import DayArrangeScreen from "@/features/screens/day-arrange";
import DayScreen from "@/features/screens/day";
import DayRearrangeScreen from "@/features/screens/day-rearrange";
import DayReplaceScreen from "@/features/screens/day-replace";
import DayNotesScreen from "@/features/screens/day-notes";
import OnDemandScreen from "@/features/screens/on-demand";
import OnDemandDetailScreen from "@/features/screens/on-demand-detail";
import OnDemandFiltersScreen from "@/features/screens/on-demand-filters";
import AccountSubscriptionScreen from "@/features/screens/account-subscription";
import AccountSupportScreen from "@/features/screens/account-support";
import AccountSocialScreen from "@/features/screens/account-social";
import AccountDeleteScreen from "@/features/screens/account-delete";
import AccountPrivacyScreen from "@/features/screens/account-privacy";
import AccountTermsScreen from "@/features/screens/account-terms";
import AccountPasswordScreen from "@/features/screens/account-password";
import LibraryScreen from "@/features/screens/library";
import LibraryEntryScreen from "@/features/screens/library-entry";
import BuilderScreen from "@/features/screens/builder";
import BuilderNewScreen from "@/features/screens/builder-new";
import BuilderProgramScreen from "@/features/screens/builder-program";
import BuilderSessionScreen from "@/features/screens/builder-session";
import BuilderSessionNewScreen from "@/features/screens/builder-session-new";
import BuilderAddScreen from "@/features/screens/builder-add";
import BuilderAddSelectedScreen from "@/features/screens/builder-add-selected";
import FiltersMuscleScreen from "@/features/screens/filters-muscle";
import FiltersEquipmentScreen from "@/features/screens/filters-equipment";
import TempoScreen from "@/features/screens/tempo";
import SetsEditorScreen from "@/features/screens/sets-editor";
import CalendarScreen from "@/features/screens/calendar";
import CalendarDayScreen from "@/features/screens/calendar-day";
import CalendarFiltersScreen from "@/features/screens/calendar-filters";
import SchedulePickScreen from "@/features/screens/schedule-pick";
// ---- Part 10 §7–§9 screens ----
import DashboardProgramScreen from "@/features/screens/dashboard-program";
import ProgressScreen from "@/features/screens/progress";
import ProgressLogScreen from "@/features/screens/progress-log";
import StepsScreen from "@/features/screens/steps";
import ExercisePickerScreen from "@/features/screens/picker";
import ExerciseOverviewScreen from "@/features/screens/exercise-overview";
import BodyScreen from "@/features/screens/body";
import BodyCompareScreen from "@/features/screens/body-compare";
import RecordsScreen from "@/features/screens/records";
import ToolsScreen from "@/features/screens/tools";
import DictionaryScreen from "@/features/screens/dictionary";
import OnboardingScreen from "@/features/screens/onboarding";
import ProfileScreen from "@/features/screens/profile";
import SettingsScreen from "@/features/screens/settings";
import HelpScreen from "@/features/screens/help";
import AuthScreen from "@/features/screens/auth";
import DevShowcaseScreen from "@/features/screens/dev-showcase";
import { ScreenErrorBoundary } from "@/components/shared/screen-error-boundary";
import { profileApi } from "@/lib/client/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TourProvider, requestTourStart } from "@/features/tour";

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
      replaceHash("#/workout");
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

  // Global keyboard shortcuts (Part 7 tour keys):
  //   ?  → open the per-screen help/tour popover     Shift+? → tour this screen
  //   /  → focus the screen's search input
  // Ignored while typing in any editable element or with modifiers held.
  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) return;
      if (e.key === "?") {
        e.preventDefault();
        if (e.shiftKey) {
          requestTourStart(route.name, { force: true });
        } else {
          window.dispatchEvent(new CustomEvent("sf:tour-help"));
        }
        return;
      }
      if (e.key === "/") {
        const search = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[aria-label*="earch" i], input[placeholder*="earch" i]',
        );
        if (search) {
          search.focus();
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

  // TourProvider (Part 7) — wraps the authenticated shell; the overlay and
  // hint cards portal to document.body (LAW 4/5: only fixed elements).
  return (
    <TourProvider profile={profile}>
      {/* Part 8 Law 1: phone-only frame — single centered column, max 480px. */}
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
        <div data-screen-container className="mx-auto flex min-h-0 w-full max-w-[480px] flex-1 flex-col">
          <ScreenErrorBoundary route={route.name}>{renderScreen(route)}</ScreenErrorBoundary>
        </div>
      </div>
    </TourProvider>
  );
}

function renderScreen(route: Route): ReactNode {
  switch (route.name) {
    case "workout":
      return <WorkoutScreen />;
    case "dashboard":
      return <DashboardScreen />;
    case "more":
      return <MoreScreen />;
    // ---- Logging (§3.10): Start/Continue only; screen gates itself. ----
    case "session":
      return <SessionScreen />;
    // ---- Part 10 §3.5: live-session settings (reachable from #/session ⚙). ----
    case "session-settings":
      return <SessionSettingsScreen />;
    case "session-exercise":
      return <SessionExerciseScreen exerciseId={route.params.exerciseId} />;
    case "session-arrange":
      return <SessionArrangeScreen />;
    // ---- Logs ----
    case "logs":
      return <LogsScreen />;
    case "log-detail":
      return <LogDetailScreen workoutId={route.params.workoutId} />;
    // ---- Programs ----
    case "programs":
      return <ProgramsScreen />;
    case "program-detail":
      return <ProgramDetailScreen routineId={route.params.routineId} />;
    case "program-day":
      return <ProgramDayScreen routineId={route.params.routineId} dayId={route.params.dayId} />;
    case "day-arrange":
      return <DayArrangeScreen routineId={route.params.routineId} dayId={route.params.dayId} />;
    // ---- Part 9 §5: day-first routes ----
    case "day":
      return <DayScreen dayId={route.params.dayId} />;
    case "day-rearrange":
      return <DayRearrangeScreen dayId={route.params.dayId} />;
    case "day-replace":
      return <DayReplaceScreen dayId={route.params.dayId} reId={route.params.reId} />;
    case "day-notes":
      return <DayNotesScreen dayId={route.params.dayId} reId={route.params.reId} />;
    // ---- On Demand ----
    case "on-demand":
      return <OnDemandScreen />;
    case "on-demand-detail":
      return <OnDemandDetailScreen routineId={route.params.routineId} />;
    case "on-demand-filters":
      return <OnDemandFiltersScreen />;
    // ---- Library ----
    case "library":
      return <LibraryScreen />;
    case "library-entry":
      return <LibraryEntryScreen catalogKey={route.params.catalogKey} />;
    // ---- Builder ----
    case "builder":
      return <BuilderScreen />;
    case "builder-new":
      return <BuilderNewScreen />;
    case "builder-program":
      return <BuilderProgramScreen routineId={route.params.routineId} />;
    case "builder-session":
      return <BuilderSessionScreen routineId={route.params.routineId} />;
    // ---- Part 10 §4: workout builder (draft build + add-exercise flow) ----
    case "builder-session-new":
      return <BuilderSessionNewScreen routineId="new" />;
    case "builder-add":
      return <BuilderAddScreen routineId={route.params.routineId} />;
    case "builder-add-selected":
      return <BuilderAddSelectedScreen routineId={route.params.routineId} />;
    case "filters-muscle":
      return <FiltersMuscleScreen />;
    case "filters-equipment":
      return <FiltersEquipmentScreen />;
    case "tempo":
      return <TempoScreen reId={route.params.reId} />;
    case "sets-editor":
      return <SetsEditorScreen routineId={route.params.routineId} reId={route.params.reId} />;
    // ---- Calendar (via 📅) ----
    case "calendar":
      return <CalendarScreen />;
    // ---- Part 10 §5.1: calendar day detail (full screen) ----
    case "calendar-day":
      return <CalendarDayScreen date={route.params.date} />;
    case "calendar-filters":
      return <CalendarFiltersScreen />;
    case "schedule-pick":
      return <SchedulePickScreen />;
    // ---- Part 10 §7–§9: dashboard program progress · progress · steps ----
    case "dashboard-program":
      return <DashboardProgramScreen />;
    case "progress":
      return <ProgressScreen />;
    case "progress-log":
      return <ProgressLogScreen />;
    case "steps":
      return <StepsScreen />;
    // ---- Exercise picker / focus ----
    case "exercises":
      return <ExercisePickerScreen />;
    case "exercise-overview":
      return <ExerciseOverviewScreen exerciseId={route.params.exerciseId} />;
    // ---- More destinations ----
    case "body":
      return <BodyScreen />;
    case "body-compare":
      return <BodyCompareScreen />;
    case "insights":
      return <RecordsScreen />;
    case "tools":
      return <ToolsScreen />;
    case "dictionary":
      return <DictionaryScreen />;
    case "onboarding":
      return <OnboardingScreen />;
    case "profile":
      return <ProfileScreen />;
    case "settings":
      return <SettingsScreen />;
    case "help":
      return <HelpScreen />;
    case "auth":
      // Authenticated visit of #/auth — the redirect effect is in flight;
      // render Workout for that single frame.
      return <WorkoutScreen />;
    // ---- Part 9 §9: account destinations (via More) ----
    case "account-subscription":
      return <AccountSubscriptionScreen />;
    case "account-support":
      return <AccountSupportScreen />;
    case "account-social":
      return <AccountSocialScreen />;
    case "account-delete":
      return <AccountDeleteScreen />;
    case "account-privacy":
      return <AccountPrivacyScreen />;
    case "account-terms":
      return <AccountTermsScreen />;
    // ---- Part 10 §9: password change ----
    case "account-password":
      return <AccountPasswordScreen />;
    case "dev":
      return <DevShowcaseScreen />;
  }
}
