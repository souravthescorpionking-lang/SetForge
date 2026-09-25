"use client";

// App root: providers, hash routing, session gate, offline flush.
import { useEffect, useRef } from "react";
import { useTheme, ThemeProvider } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/lib/client/store";
import { QueryProvider } from "@/lib/client/query";
import { flushOutbox, isOnline, outboxCount } from "@/lib/client/offline";
import { PwaBridge } from "@/components/shared/pwa";
import { AuthView } from "@/features/auth/auth-view";
import { TopBar, Sidebar, BottomNav } from "@/components/nav-shell";
import { Flame } from "lucide-react";

// Feature views
import { TodayView } from "@/features/today/today-view";
import { WorkoutHistoryView } from "@/features/history/workout-history-view";
import { ExercisesView } from "@/features/exercises/exercises-view";
import { ExerciseOverviewView } from "@/features/exercise-overview/exercise-overview-view";
import { InsightsView } from "@/features/insights/insights-view";
import { CalendarView } from "@/features/calendar/calendar-view";
import { RoutinesView } from "@/features/routines/routines-view";
import { BodyView } from "@/features/body/body-view";
import { ToolsView } from "@/features/tools/tools-view";
import { SettingsView } from "@/features/settings/settings-view";
import type { SessionDTO } from "@/lib/types";
import { toast } from "sonner";

function AppInner({ initialSession }: { initialSession: SessionDTO | null }) {
  const session = useApp((s) => s.session);
  const settings = useApp((s) => s.settings);
  const route = useApp((s) => s.route);
  const setSession = useApp((s) => s.setSession);
  const setRouteFromHash = useApp((s) => s.setRouteFromHash);
  const { setTheme } = useTheme();
  const qc = useQueryClient();
  const bootstrappedRef = useRef(false);

  // hydrate from SSR session
  useEffect(() => {
    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      setSession(initialSession);
    }
  }, [initialSession, setSession]);

  // hash routing
  useEffect(() => {
    setRouteFromHash();
    const onHash = () => setRouteFromHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [setRouteFromHash]);

  // sync theme with user settings (user preference wins on change)
  useEffect(() => {
    if (settings?.theme) setTheme(settings.theme);
  }, [settings?.theme, setTheme]);

  // offline outbox flush on reconnect
  useEffect(() => {
    const onOnline = async () => {
      const pending = outboxCount();
      if (pending === 0) return;
      toast.info(`Syncing ${pending} offline change${pending > 1 ? "s" : ""}…`);
      const result = await flushOutbox();
      if (result.flushed > 0) {
        toast.success(`Synced ${result.flushed} change${result.flushed > 1 ? "s" : ""}`);
        qc.invalidateQueries();
      }
      if (result.failed > 0) toast.error(`${result.failed} change(s) still pending`);
    };
    window.addEventListener("online", onOnline);
    // try an initial flush in case we loaded while online with a queue
    if (isOnline() && outboxCount() > 0) void onOnline();
    return () => window.removeEventListener("online", onOnline);
  }, [qc]);

  if (!session) {
    return <AuthView />;
  }

  const view = (() => {
    switch (route.view) {
      case "today":
        return <TodayView />;
      case "history":
        return <WorkoutHistoryView />;
      case "exercises":
        return <ExercisesView />;
      case "exercise-overview":
        return route.param ? <ExerciseOverviewView exerciseId={route.param} /> : <ExercisesView />;
      case "insights":
        return <InsightsView />;
      case "calendar":
        return <CalendarView />;
      case "routines":
        return <RoutinesView />;
      case "body":
        return <BodyView />;
      case "tools":
        return <ToolsView />;
      case "settings":
        return <SettingsView />;
      default:
        return <TodayView />;
    }
  })();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Sidebar />
      <div className="lg:pl-60 flex flex-col min-h-screen">
        <TopBar />
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8 pb-28 lg:pb-12">
          {view}
        </main>
        <footer className="mt-auto lg:block hidden">
          <p className="text-center text-xs text-muted-foreground pb-6">
            SetForge · Forge every set · offline-ready PWA
          </p>
        </footer>
      </div>
      <BottomNav />
    </div>
  );
}

export function AppRoot({ initialSession }: { initialSession: SessionDTO | null }) {
  return (
    <QueryProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <PwaBridge />
        <AppInner initialSession={initialSession} />
      </ThemeProvider>
    </QueryProvider>
  );
}

export { Flame };
