"use client";

// Preferences: theme, units, week start, defaults, behaviour switches.
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Stepper } from "@/components/shared/stepper";
import { useApp } from "@/lib/client/store";
import type { SettingsDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Monitor, Moon, Sun, SunMoon, Ruler, CalendarDays, ListOrdered, Layers3, Trophy, CheckCheck, MousePointerClick, MonitorSmartphone, Gauge, Palette, Tag } from "lucide-react";
import { SettingRow, Segmented, SectionHeading } from "./settings-controls";
import { isWakeLockSupported, useWakeLock } from "./use-wake-lock";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function PreferencesSection() {
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const { setTheme } = useTheme();
  const wakeActive = useWakeLock(settings?.keepScreenOn ?? false);
  const wakeSupported = isWakeLockSupported();

  // Coalesce rapid numeric edits (hold-to-repeat steppers) into one PATCH.
  const pendingRef = useRef<Partial<SettingsDTO> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const update = updateSettings;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRef.current) void update(pendingRef.current).catch(() => undefined);
      pendingRef.current = null;
    };
  }, [updateSettings]);

  if (!settings) return null;

  const patch = (p: Partial<SettingsDTO>) => {
    void updateSettings(p).catch(() => undefined); // store already toasts on failure
  };

  const patchDebounced = (p: Partial<SettingsDTO>) => {
    pendingRef.current = { ...(pendingRef.current ?? {}), ...p };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) void updateSettings(pending).catch(() => undefined);
    }, 350);
  };

  const unitLabel = settings.unitSystem === "imperial" ? "lb" : "kg";

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-3">
        <SectionHeading
          icon={<Palette className="h-4.5 w-4.5" />}
          title="Preferences"
          description="Look & feel, units and logging defaults"
        />
      </CardHeader>
      <CardContent className="divide-y divide-border/60 pt-0">
        {/* Theme */}
        <div className="py-4">
          <SettingRow
            stacked
            icon={<SunMoon className="h-4 w-4" />}
            label="Theme"
            helper="Dark-first forge look by default. System follows your OS setting."
            control={
              <div className="grid w-full grid-cols-3 gap-2 sm:w-[300px]">
                {THEME_OPTIONS.map((t) => {
                  const selected = settings.theme === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setTheme(t.value); // instant preview
                        patch({ theme: t.value });
                      }}
                      className={cn(
                        "relative flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition-all",
                        selected
                          ? "border-primary/60 bg-primary/10 text-primary shadow-sm"
                          : "border-border/60 text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      <t.icon className={cn("h-5 w-5", selected && "drop-shadow-sm")} />
                      {t.label}
                      {selected && (
                        <motion.span
                          layoutId="theme-check"
                          className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
                        >
                          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
                            <path d="M2 6.5 4.5 9 10 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </motion.span>
                      )}
                    </button>
                  );
                })}
              </div>
            }
          />
        </div>

        {/* Unit system */}
        <SettingRow
          icon={<Ruler className="h-4 w-4" />}
          label="Unit system"
          helper={`Weights shown in ${unitLabel}. Affects steppers, plates and calculators.`}
          control={
            <Segmented
              ariaLabel="Unit system"
              value={settings.unitSystem}
              onChange={(v) => patch({ unitSystem: v })}
              options={[
                { value: "metric", label: "Metric" },
                { value: "imperial", label: "Imperial" },
              ]}
            />
          }
        />

        {/* Week start */}
        <SettingRow
          icon={<CalendarDays className="h-4 w-4" />}
          label="Week starts on"
          helper="Used by the calendar, insights and weekly stats."
          control={
            <Segmented
              ariaLabel="Week start"
              value={settings.weekStart}
              onChange={(v) => patch({ weekStart: v })}
              options={[
                { value: 0, label: "Sunday" },
                { value: 1, label: "Monday" },
              ]}
            />
          }
        />

        {/* Default weight increment */}
        <SettingRow
          icon={<Gauge className="h-4 w-4" />}
          label="Default weight increment"
          helper={`Step size for weight steppers in workouts and calculators. Currently ${settings.defaultWeightIncrement} ${unitLabel}.`}
          control={
            <Stepper
              ariaLabel="Default weight increment"
              value={settings.defaultWeightIncrement}
              onChange={(v) => patchDebounced({ defaultWeightIncrement: v ?? 0.5 })}
              min={0.5}
              max={50}
              step={0.5}
              decimals={1}
              suffix={unitLabel}
              className="w-[140px]"
            />
          }
        />

        {/* Home sets shown */}
        <SettingRow
          icon={<ListOrdered className="h-4 w-4" />}
          label="Home sets shown"
          helper="Empty set rows pre-filled on the Today screen."
          control={
            <Stepper
              ariaLabel="Home sets shown"
              value={settings.homeSetsShown}
              onChange={(v) => patchDebounced({ homeSetsShown: v ?? 1 })}
              min={1}
              max={10}
              step={1}
              decimals={0}
              className="w-[110px]"
            />
          }
        />

        {/* Est-1RM rep limit */}
        <SettingRow
          icon={<Trophy className="h-4 w-4" />}
          label="Est-1RM rep limit"
          helper={`Sets above ${settings.estOneRmRepLimit} reps are treated as conditioning, not strength — excluded from estimated 1RM records.`}
          control={
            <Stepper
              ariaLabel="Estimated one rep max rep limit"
              value={settings.estOneRmRepLimit}
              onChange={(v) => patchDebounced({ estOneRmRepLimit: v ?? 1 })}
              min={1}
              max={15}
              step={1}
              decimals={0}
              className="w-[110px]"
            />
          }
        />

        {/* Switches */}
        <SettingRow
          icon={<Tag className="h-4 w-4" />}
          label="Show category"
          helper="Display the category dot and name next to exercises."
          control={
            <Switch
              aria-label="Show category"
              checked={settings.showCategory}
              onCheckedChange={(v) => patch({ showCategory: v })}
            />
          }
        />

        <SettingRow
          icon={<Trophy className="h-4 w-4" />}
          label="Track PRs"
          helper="Detect personal records as you log sets and celebrate them."
          control={
            <Switch
              aria-label="Track PRs"
              checked={settings.trackPR}
              onCheckedChange={(v) => patch({ trackPR: v })}
            />
          }
        />

        <SettingRow
          icon={<CheckCheck className="h-4 w-4" />}
          label="Mark sets complete"
          helper="Automatically tick sets as complete when you enter a value."
          control={
            <Switch
              aria-label="Mark sets complete"
              checked={settings.markSetsComplete}
              onCheckedChange={(v) => patch({ markSetsComplete: v })}
            />
          }
        />

        <SettingRow
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Auto-select next set"
          helper="Jump the cursor to the next set row after logging one."
          control={
            <Switch
              aria-label="Auto-select next set"
              checked={settings.autoSelectNextSet}
              onCheckedChange={(v) => patch({ autoSelectNextSet: v })}
            />
          }
        />

        <SettingRow
          icon={<MonitorSmartphone className="h-4 w-4" />}
          label="Keep screen on"
          helper={
            wakeSupported
              ? wakeActive
                ? "Screen wake lock active — your display stays awake while this page is open."
                : "Requests a screen wake lock so your display stays awake during workouts."
              : "Your browser doesn't support the Screen Wake Lock API."
          }
          control={
            <div className="flex items-center gap-2">
              {wakeActive && (
                <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Active
                </span>
              )}
              <Switch
                aria-label="Keep screen on"
                checked={settings.keepScreenOn}
                onCheckedChange={(v) => patch({ keepScreenOn: v })}
              />
            </div>
          }
        />

        <SettingRow
          icon={<Layers3 className="h-4 w-4" />}
          label="Offline mode"
          helper="Calculators and cached data work without a connection; changes you make while offline are queued and synced automatically."
          control={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              Always on
            </span>
          }
        />
      </CardContent>
    </Card>
  );
}
