"use client";

// App root: providers, session bootstrap, legacy store route sync, theme sync,
// offline flush. The Part 3 application shell (NavPane/NavBar chrome + hash
// router + screen slots) lives in src/features/shell/app-shell.tsx.
import { useEffect, useRef } from "react";
import { useTheme, ThemeProvider } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/lib/client/store";
import { QueryProvider } from "@/lib/client/query";
import { flushOutbox, isOnline, outboxCount } from "@/lib/client/offline";
import { armDailyReminder, rearmOnVisible } from "@/lib/client/notifications";
import { setHapticsEnabled } from "@/lib/client/haptics";
import { PwaBridge } from "@/components/shared/pwa";
import { ChunkRecovery } from "@/components/shared/chunk-recovery";
import { AppShell } from "@/features/shell/app-shell";
import type { SessionDTO } from "@/lib/types";
import { toast } from "sonner";

function AppInner({ initialSession }: { initialSession: SessionDTO | null }) {
  const setSession = useApp((s) => s.setSession);
  const settings = useApp((s) => s.settings);
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

  // legacy store route sync — legacy views (and NavBar/NavPane highlighting)
  // read useApp(s => s.route); keep it in sync with location.hash.
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

  // Part 5: arm/disarm the daily workout reminder whenever settings change
  useEffect(() => {
    armDailyReminder(settings?.reminderTime ?? null);
  }, [settings?.reminderTime]);

  // Part 6: haptics master switch (defaults on — preserves prior behaviour)
  useEffect(() => {
    setHapticsEnabled(settings?.hapticsEnabled ?? true);
  }, [settings?.hapticsEnabled]);

  // re-arm the reminder timer when the tab becomes visible again
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") rearmOnVisible();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

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

  return <AppShell initialSession={initialSession} />;
}

export function AppRoot({ initialSession }: { initialSession: SessionDTO | null }) {
  return (
    <QueryProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <PwaBridge />
        <ChunkRecovery />
        <AppInner initialSession={initialSession} />
      </ThemeProvider>
    </QueryProvider>
  );
}
