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

import { useTheme } from "next-themes";
import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { Button } from "@/components/ui/button";
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
import { PreferencesSection, ProgramsSection, AccountSection, DataSection, AppSection } from "./settings-sections";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export default function SettingsScreen() {
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const { setTheme } = useTheme();

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
          actions={
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
          }
        />
      }
    >
      <ScrollBody>
        {settings ? (
          <>
            <PreferencesSection />
            <ProgramsSection />
            <AccountSection />
            <DataSection />
            <AppSection />
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
