"use client";

// App section: PWA install, offline status, offline cache management.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useInstallPrompt, isStandalone } from "@/components/shared/pwa";
import { useOnline } from "@/lib/client/query";
import { toast } from "sonner";
import {
  BadgeCheck,
  MonitorSmartphone,
  RefreshCw,
  Trash2,
  WifiOff,
} from "lucide-react";
import { SettingRow } from "./settings-controls";

export function AppSection() {
  const online = useOnline();
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [standalone] = useState(() => isStandalone());
  const [clearing, setClearing] = useState(false);

  const clearCache = async () => {
    setClearing(true);
    try {
      const regs = await navigator.serviceWorker?.getRegistrations();
      const sw = regs?.[0]?.active;
      sw?.postMessage({ type: "CLEAR_CACHES" });
      // Also drop any cached responses the browser holds for the shell.
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      toast.success("Offline cache cleared", {
        description: "Everything re-downloads fresh on your next visit.",
      });
    } catch {
      toast.error("Could not clear the offline cache");
    } finally {
      setClearing(false);
    }
  };

  return (
    <Card>
      <CardContent className="divide-y divide-border/60">
        <SettingRow
          icon={<MonitorSmartphone className="h-4 w-4" />}
          label="Install SetForge"
          helper={
            installed || standalone
              ? "Running as an installed app — full screen, offline-ready."
              : canInstall
                ? "Add to your home screen or desktop. Works offline, opens instantly."
                : "Install from your browser menu: “Install app” or “Add to Home Screen”."
          }
          control={
            installed || standalone ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <BadgeCheck className="h-3.5 w-3.5" /> Installed
              </span>
            ) : (
              <Button
                size="sm"
                disabled={!canInstall}
                onClick={() => void promptInstall()}
                className="min-w-[74px]"
              >
                Install
              </Button>
            )
          }
        />
        <SettingRow
          icon={<WifiOff className="h-4 w-4" />}
          label="Offline mode"
          helper={
            online
              ? "Connected — sets save instantly and sync to your account."
              : "Offline — sets you log now are queued and sync automatically on reconnect."
          }
          control={
            <span
              className={
                online
                  ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                  : "inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400"
              }
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {online ? "Online" : "Offline"}
            </span>
          }
        />
        <SettingRow
          icon={<Trash2 className="h-4 w-4" />}
          label="Offline cache"
          helper="Clears the local copy of the app and cached data stored by the service worker."
          control={
            <Button
              size="sm"
              variant="outline"
              disabled={clearing}
              onClick={() => void clearCache()}
              className="min-w-[74px]"
            >
              {clearing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Clear"}
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}
