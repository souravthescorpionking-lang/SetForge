"use client";

// Settings view — tabs on mobile, stacked card sections on desktop.
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useApp } from "@/lib/client/store";
import { motion } from "framer-motion";
import { Database, Settings as SettingsIcon, UserRound } from "lucide-react";
import { PreferencesSection } from "./preferences-section";
import { DataSection } from "./data-section";
import { AccountSection } from "./account-section";
import { useWakeLock } from "./use-wake-lock";

function useIsDesktop(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

export function SettingsView() {
  const settings = useApp((s) => s.settings);
  const isDesktop = useIsDesktop();
  // keep the screen awake while enabled (re-acquires on tab visibility)
  useWakeLock(settings?.keepScreenOn ?? false);

  if (!settings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Settings"
        subtitle="Preferences, data tools & account"
        icon={<SettingsIcon className="h-5 w-5" />}
      />

      {isDesktop === false && (
        <Tabs defaultValue="preferences">
          <TabsList className="grid h-auto w-full grid-cols-3">
            <TabsTrigger value="preferences" className="py-2">
              Preferences
            </TabsTrigger>
            <TabsTrigger value="data" className="py-2">
              Data
            </TabsTrigger>
            <TabsTrigger value="account" className="py-2">
              Account
            </TabsTrigger>
          </TabsList>
          <TabsContent value="preferences" className="mt-3">
            <PreferencesSection />
          </TabsContent>
          <TabsContent value="data" className="mt-3">
            <DataSection />
          </TabsContent>
          <TabsContent value="account" className="mt-3 space-y-5">
            <AccountSection />
          </TabsContent>
        </Tabs>
      )}

      {(isDesktop === null || isDesktop === true) && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="space-y-5"
        >
          <section aria-label="Preferences">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <SettingsIcon className="h-3.5 w-3.5" /> Preferences
            </h2>
            <PreferencesSection />
          </section>
          <section aria-label="Data">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Database className="h-3.5 w-3.5" /> Data
            </h2>
            <DataSection />
          </section>
          <section aria-label="Account">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <UserRound className="h-3.5 w-3.5" /> Account
            </h2>
            <AccountSection />
          </section>
        </motion.div>
      )}
    </div>
  );
}
