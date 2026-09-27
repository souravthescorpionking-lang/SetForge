"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProfileScreen — #/profile (Part 6 §4.16). Primitives-only composition:
//
//   TopBar (56)  : "Profile"
//   ScrollBody   : hero (NOT a card — initials circle, name, email, greeting)
//                  + PROFILE section (Age / Height / Weight / Level / Goal /
//                  Days per week — tap a row → INLINE expansion editor, no
//                  Dialogs) + NOTIFICATIONS section (reminder time input,
//                  haptics + keep-screen-on switches) + ACCOUNT section
//                  (links to Settings/Help + Sign out w/ the settings-style
//                  confirm).
//
// Rows are 56px in rounded-lg border bg-card blocks — label left, value or
// control right (settings-sections / body-track-tab conventions). Profile
// data comes from the shared ["profile"] query (same key as the app-shell
// gate, staleTime Infinity — updates setQueryData + invalidate).
//
// Units: heights/weights are METRIC canonically on the wire. When
// settings.unitSystem is imperial, height displays as ft+in (edited in
// inches) and weight in lb; all conversion helpers live in this file.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody } from "@/components/layout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Check, ChevronRight, CircleHelp, Loader2, LogOut, Minus, Plus, Settings } from "lucide-react";
import { toast } from "sonner";
import { authApi, profileApi } from "@/lib/client/api";
import { hapticSelection, hapticTap } from "@/lib/client/haptics";
import { useApp } from "@/lib/client/store";
import { PROFILE_GOALS, PROFILE_GOAL_LABELS, PROFILE_LEVELS } from "@/lib/constants";
import type { UserProfileDTO } from "@/lib/types";
import { wipeLocalData } from "@/lib/client/offline";
import { clearSwCaches } from "@/components/shared/pwa";
import { cn } from "@/lib/utils";

// ── local unit conversion helpers (metric is canonical on the wire) ──────────

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

const roundTo1 = (n: number): number => Math.round(n * 10) / 10;

/** 177.8 cm → "5 ft 10 in" (imperial height display). */
function cmToFtIn(cm: number): string {
  const totalIn = cm / CM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch >= 12) {
    ft += 1;
    inch -= 12;
  }
  return `${ft} ft ${inch} in`;
}

const cmToIn = (cm: number): number => cm / CM_PER_IN;
const inToCm = (inches: number): number => inches * CM_PER_IN;
const kgToLb = (kg: number): number => kg / KG_PER_LB;
const lbToKg = (lb: number): number => lb * KG_PER_LB;
const identity = (n: number): number => n;

// ── labels + validation bands (mirrors the onboarding wizard) ────────────────

type Level = (typeof PROFILE_LEVELS)[number];
type Goal = (typeof PROFILE_GOALS)[number];

const LEVEL_LABELS: Record<Level, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

const asLevel = (v: string | null): Level | null => PROFILE_LEVELS.find((l) => l === v) ?? null;
const asGoal = (v: string | null): Goal | null => PROFILE_GOALS.find((g) => g === v) ?? null;

const AGE_MIN = 13;
const AGE_MAX = 99;
const HEIGHT_CM_MIN = 100;
const HEIGHT_CM_MAX = 250;
const HEIGHT_IN_MIN = 39;
const HEIGHT_IN_MAX = 98;
const WEIGHT_KG_MIN = 30;
const WEIGHT_KG_MAX = 300;
const WEIGHT_LB_MIN = 66;
const WEIGHT_LB_MAX = 660;

type EditKey = "age" | "height" | "weight" | "level" | "goal" | "days";

type ProfilePatch = Parameters<typeof profileApi.update>[0];

// ── screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const session = useApp((s) => s.session);
  const settings = useApp((s) => s.settings);
  const qc = useQueryClient();

  // Same key as the app-shell onboarding gate (staleTime Infinity — the cache
  // is written synchronously after each save, then background-revalidated).
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileApi.get(),
    staleTime: Infinity,
  });

  const [editing, setEditing] = useState<EditKey | null>(null);

  const imperial = settings?.unitSystem === "imperial";

  /** Save a profile patch: cache write on success + background revalidate. */
  const savePatch = async (patch: ProfilePatch): Promise<void> => {
    try {
      const dto = await profileApi.update(patch);
      qc.setQueryData(["profile"], dto);
      void qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Saved");
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  if (!session || !settings) {
    return (
      <Screen topBar={<TopBar title="Profile" />}>
        <ScrollBody contentClassName="flex flex-col gap-3" >
          <div className="flex flex-col items-center gap-3 py-8" aria-busy="true" aria-label="Loading profile">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-4 w-40 rounded-lg" />
            <Skeleton className="h-3 w-56 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </ScrollBody>
      </Screen>
    );
  }

  const initials =
    (session.user.name ?? session.user.email)
      .split(/[\s@.]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "SF";

  return (
    <Screen topBar={<TopBar title="Profile" />}>
      <ScrollBody contentClassName="flex flex-col gap-4">
        {/* hero — signed-in identity (NOT a card) */}
        <header className="flex flex-col items-center gap-2 py-4 text-center">
          <span
            aria-hidden
            className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary"
          >
            {initials}
          </span>
          <div>
            <p className="text-lg font-bold leading-none">{session.user.name ?? "Athlete"}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{session.user.email}</p>
          </div>
          <p className="text-sm text-muted-foreground">Ready to forge.</p>
        </header>

        <ProfileSection
          profile={profile}
          loading={isLoading}
          imperial={imperial}
          editing={editing}
          setEditing={setEditing}
          savePatch={savePatch}
        />

        <NotificationsSection />

        <AccountSection />
      </ScrollBody>
    </Screen>
  );
}

// ── PROFILE section ──────────────────────────────────────────────────────────

function ProfileSection({
  profile,
  loading,
  imperial,
  editing,
  setEditing,
  savePatch,
}: {
  profile: UserProfileDTO | undefined;
  loading: boolean;
  imperial: boolean;
  editing: EditKey | null;
  setEditing: (k: EditKey | null) => void;
  savePatch: (patch: ProfilePatch) => Promise<void>;
}) {
  if (loading || !profile) {
    return (
      <section aria-label="Profile" className="flex flex-col gap-2" aria-busy="true">
        <SectionHeader title="Profile" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </section>
    );
  }

  const level = asLevel(profile.level);
  const goal = asGoal(profile.goal);
  const toggle = (key: EditKey) => setEditing(editing === key ? null : key);

  return (
    <section aria-label="Profile" className="flex flex-col gap-2">
      <SectionHeader title="Profile" />

      <ProfileRow
        label="Age"
        value={profile.age != null ? `${profile.age} years` : null}
        expanded={editing === "age"}
        onToggle={() => toggle("age")}
      />
      {editing === "age" ? (
        <StepperEditor
          key={`age-${profile.age ?? "new"}`}
          title="Age"
          unitLabel="years"
          min={AGE_MIN}
          max={AGE_MAX}
          initial={profile.age ?? 30}
          formatValue={(n) => `${n}`}
          ariaLabel="Age"
          stepLabel="Age"
          onSave={(n) => savePatch({ age: n })}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      <ProfileRow
        label="Height"
        value={
          profile.heightCm == null ? null
          : imperial ? `${cmToFtIn(profile.heightCm)} · ${roundTo1(profile.heightCm)} cm`
          : `${roundTo1(profile.heightCm)} cm`
        }
        expanded={editing === "height"}
        onToggle={() => toggle("height")}
      />
      {editing === "height" ? (
        <MeasureEditor
          key={`height-${profile.heightCm ?? "new"}`}
          title="Height"
          unitLabel={imperial ? "inches" : "cm"}
          placeholder={imperial ? "e.g. 70" : "e.g. 178"}
          initialMetric={profile.heightCm}
          imperial={imperial}
          toDisplay={imperial ? cmToIn : identity}
          toMetric={imperial ? inToCm : identity}
          min={imperial ? HEIGHT_IN_MIN : HEIGHT_CM_MIN}
          max={imperial ? HEIGHT_IN_MAX : HEIGHT_CM_MAX}
          canonicalUnit="cm"
          onSave={(cm) => savePatch({ heightCm: cm })}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      <ProfileRow
        label="Weight"
        value={
          profile.weightKg == null ? null
          : imperial ? `${Math.round(kgToLb(profile.weightKg))} lb · ${roundTo1(profile.weightKg)} kg`
          : `${roundTo1(profile.weightKg)} kg`
        }
        expanded={editing === "weight"}
        onToggle={() => toggle("weight")}
      />
      {editing === "weight" ? (
        <MeasureEditor
          key={`weight-${profile.weightKg ?? "new"}`}
          title="Weight"
          unitLabel={imperial ? "pounds" : "kg"}
          placeholder={imperial ? "e.g. 180" : "e.g. 80"}
          initialMetric={profile.weightKg}
          imperial={imperial}
          toDisplay={imperial ? kgToLb : identity}
          toMetric={imperial ? lbToKg : identity}
          min={imperial ? WEIGHT_LB_MIN : WEIGHT_KG_MIN}
          max={imperial ? WEIGHT_LB_MAX : WEIGHT_KG_MAX}
          canonicalUnit="kg"
          onSave={(kg) => savePatch({ weightKg: kg })}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      <ProfileRow
        label="Level"
        value={level ? LEVEL_LABELS[level] : null}
        expanded={editing === "level"}
        onToggle={() => toggle("level")}
      />
      {editing === "level" ? (
        <ChoiceEditor
          key={`level-${profile.level ?? "new"}`}
          title="Experience level"
          options={PROFILE_LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] }))}
          selected={level}
          onSelect={(v) => {
            if (level !== v) void savePatch({ level: v });
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      <ProfileRow
        label="Goal"
        value={goal ? PROFILE_GOAL_LABELS[goal] : null}
        expanded={editing === "goal"}
        onToggle={() => toggle("goal")}
      />
      {editing === "goal" ? (
        <ChoiceEditor
          key={`goal-${profile.goal ?? "new"}`}
          title="Main goal"
          options={PROFILE_GOALS.map((g) => ({ value: g, label: PROFILE_GOAL_LABELS[g] }))}
          selected={goal}
          onSelect={(v) => {
            if (goal !== v) void savePatch({ goal: v });
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      <ProfileRow
        label="Days per week"
        value={profile.daysPerWeekTarget != null ? String(profile.daysPerWeekTarget) : null}
        expanded={editing === "days"}
        onToggle={() => toggle("days")}
      />
      {editing === "days" ? (
        <StepperEditor
          key={`days-${profile.daysPerWeekTarget ?? "new"}`}
          title="Training days per week"
          unitLabel="days"
          min={1}
          max={7}
          initial={profile.daysPerWeekTarget ?? 3}
          formatValue={(n) => `${n}`}
          ariaLabel="Training days per week"
          stepLabel="Days"
          onSave={(n) => savePatch({ daysPerWeekTarget: n })}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}

// ── NOTIFICATIONS section ────────────────────────────────────────────────────

function NotificationsSection() {
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  if (!settings) return null;

  return (
    <section aria-label="Notifications" className="flex flex-col gap-2">
      <SectionHeader title="Notifications" />
      <div data-row className="flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          Daily reminder
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">HH:MM</span>
        </span>
        <Input
          type="time"
          className="h-11 w-[132px] flex-none rounded-lg tabular-nums"
          value={settings.reminderTime ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            // store optimistically patches + rolls back + toasts on failure
            void updateSettings({ reminderTime: v === "" ? null : v }).then(
              () => toast.success("Saved"),
              () => undefined,
            );
          }}
          aria-label="Daily reminder time"
        />
      </div>
      <SwitchRow
        label="Haptic feedback"
        checked={settings.hapticsEnabled}
        onCheckedChange={(v) => void updateSettings({ hapticsEnabled: v })}
      />
      <SwitchRow
        label="Keep screen on during workouts"
        checked={settings.keepScreenOn}
        onCheckedChange={(v) => void updateSettings({ keepScreenOn: v })}
      />
    </section>
  );
}

// ── ACCOUNT section ──────────────────────────────────────────────────────────

/** Sign out + full local wipe (same behaviour as the settings screen). */
function useSignOut() {
  const setSession = useApp((s) => s.setSession);
  const qc = useQueryClient();
  return async () => {
    try {
      await authApi.logout();
    } finally {
      clearSwCaches();
      wipeLocalData();
      qc.clear();
      setSession(null); // app-shell gate forces #/auth
      toast.success("Signed out — local data cleared");
    }
  };
}

function AccountSection() {
  const logout = useSignOut();
  const [signOutOpen, setSignOutOpen] = useState(false);

  return (
    <section aria-label="Account" className="flex flex-col gap-2">
      <SectionHeader title="Account" />
      <LinkRow label="Settings" hash="#/settings" icon={Settings} />
      <LinkRow label="Help & shortcuts" hash="#/help" icon={CircleHelp} />

      {/* sign out — confirm-destructive, exactly as the settings screen does it */}
      <button
        type="button"
        data-row
        aria-label="Sign out"
        onClick={() => setSignOutOpen(true)}
        className={cn(
          "flex h-14 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg border border-destructive/30 bg-card px-3 text-left transition-colors hover:bg-accent/40",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
      >
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <LogOut className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-destructive">Sign out</span>
        <ChevronRight className="h-4 w-4 flex-none text-destructive/70" aria-hidden />
      </button>
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              This ends your session and clears offline data stored on this device. You can sign back in
              any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setSignOutOpen(false);
                void logout();
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ── shared row primitives (settings-sections conventions, card-block style) ──

/** 32px section header — muted, uppercase, NOT a data-row. */
function SectionHeader({ title }: { title: string }) {
  return (
    <p className="flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span className="truncate">{title}</span>
    </p>
  );
}

/** 56px data-row in a card block: label left, value (or "Not set") right + chevron. */
function ProfileRow({
  label,
  value,
  expanded,
  onToggle,
}: {
  label: string;
  value: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-row
      aria-expanded={expanded}
      aria-label={value == null ? `${label} — not set, tap to edit` : `${label}: ${value}`}
      onClick={() => {
        hapticTap();
        onToggle();
      }}
      className={cn(
        "flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3 text-left transition-colors hover:bg-accent/40",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        expanded && "border-primary/50 bg-primary/5",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      <span
        className={cn(
          "max-w-[55%] flex-none truncate text-sm tabular-nums",
          value == null ? "text-muted-foreground/60" : "text-muted-foreground",
        )}
      >
        {value ?? "Not set"}
      </span>
      <ChevronRight
        className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", expanded && "rotate-90")}
        aria-hidden
      />
    </button>
  );
}

/** 56px card row with a Switch control. */
function SwitchRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div data-row className="flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

/** 56px card row that navigates to a hash destination. */
function LinkRow({
  label,
  hash,
  icon: Icon,
}: {
  label: string;
  hash: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      data-row
      aria-label={label}
      onClick={() => {
        window.location.hash = hash;
      }}
      className={cn(
        "flex h-14 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3 text-left transition-colors hover:bg-accent/40",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      )}
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
    </button>
  );
}

// ── inline editors (NO Dialogs — expand under the row) ───────────────────────

/** Editor chrome: bordered block under a row with title + children + actions. */
function EditorShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex flex-none flex-col gap-2 rounded-lg border border-primary/40 bg-card p-3" aria-label={`${title} editor`}>
      <p className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
      <div className="flex gap-2">{footer}</div>
    </div>
  );
}

function SaveCancelButtons({
  onSave,
  onCancel,
  saveDisabled,
  saving,
  cancelLabel = "Cancel",
}: {
  onSave: () => void;
  onCancel: () => void;
  saveDisabled?: boolean;
  saving?: boolean;
  cancelLabel?: string;
}) {
  return (
    <>
      <Button
        type="button"
        className="h-11 flex-1 font-semibold"
        disabled={saveDisabled || saving}
        onClick={onSave}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Save
      </Button>
      <Button type="button" variant="outline" className="h-11 flex-1" onClick={onCancel}>
        {cancelLabel}
      </Button>
    </>
  );
}

/** − n + stepper editor (age, days per week). */
function StepperEditor({
  title,
  unitLabel,
  min,
  max,
  initial,
  formatValue,
  ariaLabel,
  stepLabel,
  onSave,
  onCancel,
}: {
  title: string;
  unitLabel: string;
  min: number;
  max: number;
  initial: number;
  formatValue: (n: number) => string;
  ariaLabel: string;
  stepLabel: string;
  onSave: (n: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditorShell
      title={`${title} · ${unitLabel}`}
      footer={<SaveCancelButtons onSave={() => void save()} onCancel={onCancel} saving={saving} />}
    >
      <div className="flex items-center justify-between rounded-lg border bg-background px-2 py-1">
        <span className="flex-none pl-1 text-xs text-muted-foreground">{stepLabel}</span>
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            className="h-12 w-12 p-0"
            disabled={value <= min || saving}
            aria-label={`Decrease ${ariaLabel}`}
            onClick={() => {
              hapticTap();
              setValue((v) => Math.max(min, v - 1));
            }}
          >
            <Minus className="h-5 w-5" aria-hidden />
          </Button>
          <span
            className="flex h-12 w-14 items-center justify-center text-base font-bold tabular-nums leading-none"
            aria-live="polite"
            aria-label={`${ariaLabel}: ${formatValue(value)}`}
          >
            {formatValue(value)}
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-12 w-12 p-0"
            disabled={value >= max || saving}
            aria-label={`Increase ${ariaLabel}`}
            onClick={() => {
              hapticTap();
              setValue((v) => Math.min(max, v + 1));
            }}
          >
            <Plus className="h-5 w-5" aria-hidden />
          </Button>
        </span>
      </div>
    </EditorShell>
  );
}

/** Height/weight editor — number input in the display unit, stores metric. */
function MeasureEditor({
  title,
  unitLabel,
  placeholder,
  initialMetric,
  imperial,
  toDisplay,
  toMetric,
  min,
  max,
  canonicalUnit,
  onSave,
  onCancel,
}: {
  title: string;
  unitLabel: string;
  placeholder: string;
  initialMetric: number | null;
  imperial: boolean;
  toDisplay: (metric: number) => number;
  toMetric: (display: number) => number;
  min: number;
  max: number;
  canonicalUnit: string;
  onSave: (metric: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [raw, setRaw] = useState(initialMetric != null ? String(roundTo1(toDisplay(initialMetric))) : "");
  const [saving, setSaving] = useState(false);

  const parsed = raw.trim() === "" ? null : Number(raw);
  const metric = parsed == null || !Number.isFinite(parsed) ? null : toMetric(parsed);
  const error =
    parsed == null ? null
    : !Number.isFinite(parsed) || parsed < min || parsed > max
      ? `Enter ${min}–${max} ${unitLabel}`
      : null;

  const save = async () => {
    if (metric == null || error) return;
    setSaving(true);
    try {
      await onSave(roundTo1(metric));
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditorShell
      title={`${title} · ${unitLabel}`}
      footer={
        <SaveCancelButtons
          onSave={() => void save()}
          onCancel={onCancel}
          saveDisabled={metric == null || error != null}
          saving={saving}
        />
      }
    >
      <div className="flex flex-col gap-1.5">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          className={cn("h-12 rounded-lg text-base tabular-nums", error && "border-destructive")}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={placeholder ?? ""}
          aria-label={`${title} in ${unitLabel}`}
          aria-invalid={error != null}
        />
        {error ? (
          <p className="px-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : imperial && metric != null ? (
          <p className="px-1 text-xs tabular-nums text-muted-foreground">
            ≈ {roundTo1(metric)} {canonicalUnit}
          </p>
        ) : (
          <p className="px-1 text-xs text-muted-foreground">Stored as {canonicalUnit}.</p>
        )}
      </div>
    </EditorShell>
  );
}

/** Segmented choice editor (Level 3-tile, Goal 4-tile) — saves on selection. */
function ChoiceEditor<T extends string>({
  title,
  options,
  selected,
  onSelect,
  onCancel,
}: {
  title: string;
  options: Array<{ value: T; label: string }>;
  selected: T | null;
  onSelect: (v: T) => void;
  onCancel: () => void;
}) {
  return (
    <EditorShell
      title={title}
      footer={
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={onCancel}>
          Close
        </Button>
      }
    >
      <div className={cn("grid gap-2", options.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {options.map((o) => {
          const active = selected === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              aria-label={`${title}: ${o.label}`}
              onClick={() => {
                hapticSelection();
                onSelect(o.value);
              }}
              className={cn(
                "flex h-12 items-center justify-center gap-1.5 rounded-lg border bg-background px-2 text-sm font-semibold",
                "transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active && "border-primary bg-primary/10 text-primary",
              )}
            >
              {active ? <Check className="h-4 w-4 flex-none" aria-hidden /> : null}
              <span className="min-w-0 truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
    </EditorShell>
  );
}
