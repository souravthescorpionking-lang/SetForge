"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SettingsScreen — #/settings (Part 3 p3-8 rebuild). Primitives-only:
//
//   TopBar (56)  : "Settings" + ⋮ (theme quick-toggle: Light / Dark / System)
//   ScrollBody   : grouped sections with 32px muted headers —
//                  Preferences · Account · Data · App —
//                  all rows 56px [data-row]: label | control right.
//
// No cards. No Dialogs beyond the two confirm-destructives (Sign out ·
// Clear data) that live inside the sections. Wake lock held at screen
// level while "Keep screen on" is enabled (legacy parity).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useTheme } from "next-themes";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Monitor, Moon, Sun, SunMoon } from "lucide-react";
import { useApp } from "@/lib/client/store";
import { useWakeLock } from "./use-wake-lock";
import {
  PreferencesSection,
  ProgramsSection,
  ToursSection,
  SessionSection,
  DisplaySection,
  AccountSection,
  DataSection,
  AppSection,
  ModeSection,
  NotificationsSection,
  RemovedItemsSection,
  BackupRunsSection,
} from "./settings-sections";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export default function SettingsScreen() {
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const { setTheme } = useTheme();
  // Part 8 §5: Advanced / Backup & data / Account expand inline (no sheets).
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  // keep the screen awake while enabled (re-acquires on tab visibility)
  useWakeLock(settings?.keepScreenOn ?? false);

  const setThemeSetting = (value: string) => {
    setTheme(value); // instant preview — app-root keeps settings & theme in sync
    void updateSettings({ theme: value }).catch(() => undefined);
  };

  return (
    <Screen
      topBar={
        <TopBar
          title="Settings"
          leading={<BackButton fallbackHash="#/more" label="Back to More" />}
          actions={
            <>
              <TopBarHelp />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" className="h-11 w-11 px-0" aria-label="Quick settings">
                    <SunMoon className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {THEME_OPTIONS.map((t) => (
                    <DropdownMenuItem key={t.value} onClick={() => setThemeSetting(t.value)}>
                      <t.icon className="h-4 w-4" aria-hidden />
                      <span className="flex-1">{t.label}</span>
                      {settings?.theme === t.value ? <Check className="h-4 w-4 text-primary" aria-hidden /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />
      }
    >
      <ScrollBody>
        {settings ? (
          <>
            {/* Part 8 §5 — Mode preset applies defaults; quick rows; Advanced
                holds every remaining toggle (grouped sections). */}
            <ModeSection />
            <section aria-label="Quick settings" className="flex flex-col">
              <QuickRows />
            </section>
            <section aria-label="Reminders" className="flex flex-col">
              <NotificationsSection />
            </section>
            <button
              type="button"
              data-row
              {...tourAttrs({ id: "settings.advanced", label: "Advanced", help: "Every individual toggle, grouped — the preset only sets defaults.", order: 30 })}
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-sm font-semibold"
            >
              Advanced
              <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", !advancedOpen && "-rotate-90")} aria-hidden />
            </button>
            {advancedOpen ? (
              <>
                <PreferencesSection />
                <ProgramsSection />
                <ToursSection />
                <SessionSection />
                <DisplaySection />
                <AppSection />
              </>
            ) : null}
            <button
              type="button"
              data-row
              {...tourAttrs({ id: "settings.backupData", label: "Backup & data", help: "Export, import, backups and removed items.", order: 40 })}
              aria-expanded={backupOpen}
              onClick={() => setBackupOpen((v) => !v)}
              className="flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-sm font-semibold"
            >
              Backup &amp; data
              <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", !backupOpen && "-rotate-90")} aria-hidden />
            </button>
            {backupOpen ? (
              <>
                <DataSection />
                <BackupRunsSection />
                <RemovedItemsSection />
              </>
            ) : null}
            <button
              type="button"
              data-row
              {...tourAttrs({ id: "settings.account", label: "Account", help: "Email, name, password and sign-out.", order: 50 })}
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((v) => !v)}
              className="flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-sm font-semibold"
            >
              Account
              <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", !accountOpen && "-rotate-90")} aria-hidden />
            </button>
            {accountOpen ? <AccountSection /> : null}
          </>
        ) : (
          <div className="flex flex-col gap-1" aria-busy="true" aria-label="Loading settings">
            <Skeleton className="h-8 w-32 rounded-lg" />
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        )}
      </ScrollBody>
    </Screen>
  );
}

/** §5 quick rows: Units · Theme · Rest timer · (Reminders lives in its own section). */
function QuickRows() {
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const { setTheme } = useTheme();
  if (!settings) return null;
  return (
    <>
      <div data-row className="flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4">
        <span className="flex-1 truncate text-sm font-medium">Units</span>
        <span className="flex gap-1">
          {(["metric", "imperial"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={settings.unitSystem === u}
              {...(u === "metric" ? { "data-tour-id": "settings.unitsMetric" } : { "data-tour-id": "settings.unitsImperial" })}
              onClick={() => {
                void updateSettings({ unitSystem: u }).catch(() => undefined);
              }}
              className={cn(
                "h-10 rounded-md px-3 text-sm font-semibold",
                settings.unitSystem === u ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {u === "metric" ? "kg" : "lbs"}
            </button>
          ))}
        </span>
      </div>
      <div data-row className="flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4">
        <span className="flex-1 truncate text-sm font-medium">Theme</span>
        <span className="flex gap-1">
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={settings.theme === t}
              {...(t === "light" ? { "data-tour-id": "settings.themeLight" } : t === "dark" ? { "data-tour-id": "settings.themeDark" } : { "data-tour-id": "settings.themeSystem" })}
              onClick={() => {
                setTheme(t);
                void updateSettings({ theme: t }).catch(() => undefined);
              }}
              className={cn(
                "h-10 rounded-md px-3 text-sm font-semibold capitalize",
                settings.theme === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </span>
      </div>
      <div data-row className="flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4">
        <span className="flex-1 truncate text-sm font-medium">Rest timer</span>
        <span className="flex gap-1">
          {(["on", "off"] as const).map((v) => {
            const on = v === "on";
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on ? settings.autoRestFromRow : !settings.autoRestFromRow}
                {...(on ? { "data-tour-id": "settings.restOn" } : { "data-tour-id": "settings.restOff" })}
                onClick={() => {
                  void updateSettings({ autoRestFromRow: on }).catch(() => undefined);
                }}
                className={cn(
                  "h-10 rounded-md px-3 text-sm font-semibold capitalize",
                  (on ? settings.autoRestFromRow : !settings.autoRestFromRow)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {v}
              </button>
            );
          })}
        </span>
      </div>
    </>
  );
}
