"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Settings sections (p3-8) — the four grouped lists of the Settings screen.
//
// LAWS obeyed here:
//   • Screen = primitives only; NO cards — sections are plain grouped lists.
//   • Every row is a 56px [data-row]: single line, label flex-1 ellipsis,
//     control right (Switch | value + chevron | action chevron).
//   • Section headers are 32px (h-8) muted text — NOT data-rows.
//   • Spacing tokens only (4/8/12/16/24/32); radius 8 (rounded-lg).
//   • NO Dialogs — the only confirms are the two confirm-destructive
//     AlertDialogs (Sign out · Clear data). Everything else is inline
//     expansion (password change, import, delete-account typed confirm).
//
// All functional wiring is ported from the legacy sections
// (preferences-section / account-section / data-section / app-section):
// store optimistic patches, theme preview, debounced numeric patches,
// account APIs, offline queueing and toasts.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { authApi, accountApi, recordsApi } from "@/lib/client/api";
import { useInvalidate, useOnline } from "@/lib/client/query";
import { useApp } from "@/lib/client/store";
import { todayKey } from "@/lib/client/format";
import { wipeLocalData } from "@/lib/client/offline";
import { clearSwCaches, isStandalone, useInstallPrompt } from "@/components/shared/pwa";
import { armDailyReminder, requestReminderPermission } from "@/lib/client/notifications";
import type { SettingsDTO } from "@/lib/types";
import { toast } from "sonner";
import { Check, ChevronRight, Loader2, LogOut, Trash2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { replaceHash } from "@/features/shell/router";

export const APP_VERSION = "1.0.0";

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

// ── shared row primitives ────────────────────────────────────────────────────

/** 32px section header — muted, uppercase, NOT a data-row. */
export function SectionHeader({ title }: { title: string }) {
  return (
    <p className="flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span className="truncate">{title}</span>
    </p>
  );
}

const ROW_CLS = "flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/50 px-1";

/** Base 56px data-row: label flex-1 ellipsis | control right. */
function Row({
  label,
  hint,
  control,
  className,
}: {
  label: string;
  /** Optional one-word trailing muted hint rendered after the label (same line). */
  hint?: string;
  control?: ReactNode;
  className?: string;
}) {
  return (
    <div data-row className={cn(ROW_CLS, className)}>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {label}
        {hint ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </span>
      {control}
    </div>
  );
}

/** 56px data-row with a Switch control (settings toggle). */
export function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  ariaLabel,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <Row
      label={label}
      hint={hint}
      control={<Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={ariaLabel ?? label} />}
    />
  );
}

/** 56px data-row: label | current value + chevron; whole row opens a small menu. */
export function MenuRow<T extends string | number>({
  label,
  hint,
  value,
  options,
  onSelect,
}: {
  label: string;
  hint?: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onSelect: (v: T) => void;
}) {
  const current = options.find((o) => o.value === value)?.label ?? String(value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-row
          className={cn(ROW_CLS, "w-full text-left hover:bg-accent/40")}
          aria-label={`${label}: ${current}`}
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {label}
            {hint ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{hint}</span> : null}
          </span>
          <span className="flex-none text-sm tabular-nums text-muted-foreground">{current}</span>
          <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {options.map((o) => (
          <DropdownMenuItem key={String(o.value)} onClick={() => onSelect(o.value)}>
            <span className="flex-1">{o.label}</span>
            {o.value === value ? <Check className="h-4 w-4 text-primary" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 56px data-row action: label | chevron (or custom trailing). */
export function ActionRow({
  label,
  hint,
  onClick,
  trailing,
  destructive,
  disabled,
  ariaLabel,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  trailing?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      data-row
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className={cn(
        ROW_CLS,
        "w-full text-left hover:bg-accent/40 disabled:pointer-events-none disabled:opacity-50",
        destructive && "text-destructive",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {label}
        {hint ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </span>
      {trailing ?? <ChevronRight className={cn("h-4 w-4 flex-none", destructive ? "text-destructive/70" : "text-muted-foreground")} aria-hidden />}
    </button>
  );
}

/** 56px data-row: label | value text (no interaction). */
export function ValueRow({ label, value, valueClassName }: { label: string; value: ReactNode; valueClassName?: string }) {
  return (
    <Row
      label={label}
      control={<span className={cn("flex-none text-sm tabular-nums text-muted-foreground", valueClassName)}>{value}</span>}
    />
  );
}

// ── Preferences ──────────────────────────────────────────────────────────────

export function PreferencesSection() {
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const { setTheme } = useTheme();
  const unit = settings?.unitSystem === "imperial" ? "lb" : "kg";

  // Coalesce rapid numeric edits into one PATCH (ported from legacy).
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

  return (
    <section aria-label="Preferences" className="flex flex-col">
      <SectionHeader title="Preferences" />
      <MenuRow
        label="Theme"
        value={settings.theme}
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
          { value: "system", label: "System" },
        ]}
        onSelect={(v) => {
          setTheme(v); // instant preview (app-root syncs afterwards)
          patch({ theme: v });
        }}
      />
      <MenuRow
        label="Units"
        hint="kg / lb"
        value={settings.unitSystem}
        options={[
          { value: "metric", label: "Metric (kg)" },
          { value: "imperial", label: "Imperial (lb)" },
        ]}
        onSelect={(v) => patch({ unitSystem: v })}
      />
      <MenuRow
        label="Week starts on"
        value={settings.weekStart}
        options={[
          { value: 1, label: "Monday" },
          { value: 0, label: "Sunday" },
        ]}
        onSelect={(v) => patch({ weekStart: v })}
      />
      <MenuRow
        label="Weight step"
        hint={unit}
        value={settings.defaultWeightIncrement}
        options={[0.5, 1, 1.25, 2.5, 5, 10].map((n) => ({ value: n, label: `${n} ${unit}` }))}
        onSelect={(v) => patch({ defaultWeightIncrement: v })}
      />
      <MenuRow
        label="Home sets shown"
        value={settings.homeSetsShown}
        options={[1, 2, 3, 4, 5, 6, 8].map((n) => ({ value: n, label: String(n) }))}
        onSelect={(v) => patch({ homeSetsShown: v })}
      />
      <MenuRow
        label="Weekly workout target"
        value={settings.weeklyWorkoutTarget}
        options={[0, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: n === 0 ? "Off" : String(n) }))}
        onSelect={(v) => patch({ weeklyWorkoutTarget: v })}
      />
      <MenuRow
        label="Est-1RM rep limit"
        value={settings.estOneRmRepLimit}
        options={[8, 10, 12, 15].map((n) => ({ value: n, label: `${n} reps` }))}
        onSelect={(v) => patch({ estOneRmRepLimit: v })}
      />
      <MenuRow
        label="e1RM method"
        value={settings.e1rmMethod}
        options={[
          { value: "BRZYCKI", label: "Brzycki" },
          { value: "EPLEY", label: "Epley" },
          { value: "RPE", label: "RPE-adjusted" },
        ]}
        onSelect={(v) => patch({ e1rmMethod: v })}
      />
      <MenuRow
        label="When rest ends"
        value={settings.restEndBehaviour}
        options={[
          { value: "NOTIFY", label: "Notify" },
          { value: "NOTIFY_AND_FOCUS_NEXT", label: "Notify + focus next" },
        ]}
        onSelect={(v) => patch({ restEndBehaviour: v })}
      />
      <SwitchRow label="Set type column" hint="N W D F A" checked={settings.showSetType} onCheckedChange={(v) => patch({ showSetType: v })} />
      <SwitchRow label="RPE column" checked={settings.showRpe} onCheckedChange={(v) => patch({ showRpe: v })} />
      <SwitchRow label="Tempo column" checked={settings.showTempo} onCheckedChange={(v) => patch({ showTempo: v })} />
      <SwitchRow label="Rest column" checked={settings.showRest} onCheckedChange={(v) => patch({ showRest: v })} />
      <SwitchRow label="Show category" checked={settings.showCategory} onCheckedChange={(v) => patch({ showCategory: v })} />
      <SwitchRow label="Track PRs" checked={settings.trackPR} onCheckedChange={(v) => patch({ trackPR: v })} />
      <SwitchRow label="Mark sets complete" checked={settings.markSetsComplete} onCheckedChange={(v) => patch({ markSetsComplete: v })} />
      <SwitchRow label="Auto-select next set" checked={settings.autoSelectNextSet} onCheckedChange={(v) => patch({ autoSelectNextSet: v })} />
      <SwitchRow label="Rest from row" checked={settings.autoRestFromRow} onCheckedChange={(v) => patch({ autoRestFromRow: v })} />
      <SwitchRow label="Keep screen on" hint="wake lock" checked={settings.keepScreenOn} onCheckedChange={(v) => patch({ keepScreenOn: v })} />
    </section>
  );
}

// ── Account ──────────────────────────────────────────────────────────────────

/** Sign out + full local wipe (logic ported from legacy useLogout). */
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
      setSession(null); // AppShell gate forces #/auth
      toast.success("Signed out — local data cleared");
    }
  };
}

export function AccountSection() {
  const session = useApp((s) => s.session);
  const online = useOnline();
  const logout = useSignOut();

  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [delOpen, setDelOpen] = useState(false);
  const [delTyped, setDelTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [signOutOpen, setSignOutOpen] = useState(false);

  if (!session) return null;

  const initials =
    (session.user.name ?? session.user.email)
      .split(/[\s@.]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "SF";

  const submitPassword = async () => {
    setPwError(null);
    if (newPw.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("New passwords don't match.");
      return;
    }
    setPwBusy(true);
    try {
      await accountApi.changePassword({ currentPassword: currentPw, newPassword: newPw });
      toast.success("Password changed — other sessions signed out");
      setPwOpen(false);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "Could not change password");
    } finally {
      setPwBusy(false);
    }
  };

  const confirmDeleteAccount = async () => {
    setDeleting(true);
    try {
      await accountApi.delete();
      toast.success("Account deleted — all data removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete account");
      setDeleting(false);
      return;
    }
    await logout();
  };

  return (
    <section aria-label="Account" className="flex flex-col">
      <SectionHeader title="Account" />

      {/* signed-in identity */}
      <div data-row className={ROW_CLS}>
        <span
          aria-hidden
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary"
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{session.user.email}</span>
        <span className="max-w-24 flex-none truncate text-xs text-muted-foreground">{session.user.name ?? "Athlete"}</span>
      </div>

      {/* change password — inline expansion (legacy Dialog → inline block) */}
      <ActionRow label="Change password" onClick={() => setPwOpen((v) => !v)} />
      {pwOpen ? (
        <div className="flex flex-none flex-col gap-1 border-b border-border/50 bg-muted/20 p-2" aria-label="Change password form">
          <div data-row className="flex h-12 items-center gap-2 overflow-hidden whitespace-nowrap">
            <span className="w-20 flex-none text-xs text-muted-foreground">Current</span>
            <Input
              type="password"
              autoComplete="current-password"
              className="h-12 flex-1 rounded-lg"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              aria-label="Current password"
              placeholder="••••••••"
            />
          </div>
          <div data-row className="flex h-12 items-center gap-2 overflow-hidden whitespace-nowrap">
            <span className="w-20 flex-none text-xs text-muted-foreground">New</span>
            <Input
              type="password"
              autoComplete="new-password"
              className="h-12 flex-1 rounded-lg"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              aria-label="New password"
              placeholder="At least 8 characters"
            />
          </div>
          <div data-row className="flex h-12 items-center gap-2 overflow-hidden whitespace-nowrap">
            <span className="w-20 flex-none text-xs text-muted-foreground">Confirm</span>
            <Input
              type="password"
              autoComplete="new-password"
              className="h-12 flex-1 rounded-lg"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              aria-label="Confirm new password"
              placeholder="Repeat new password"
            />
            <Button
              type="button"
              className="h-12 flex-none rounded-lg px-4"
              disabled={pwBusy || !currentPw || newPw.length < 8 || newPw !== confirmPw}
              onClick={() => void submitPassword()}
            >
              {pwBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Update
            </Button>
          </div>
          {pwError ? (
            <p className="flex-none px-1 text-xs text-destructive" role="alert">
              {pwError}
            </p>
          ) : (
            <p className="flex-none px-1 text-xs text-muted-foreground">
              Minimum 8 characters · other sessions are signed out.
            </p>
          )}
        </div>
      ) : null}

      {/* sign out — confirm-destructive */}
      <ActionRow label="Sign out" onClick={() => setSignOutOpen(true)} />
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

      {/* delete account — inline typed-DELETE confirm (no dialog) */}
      <ActionRow label="Delete account" destructive onClick={() => { setDelTyped(""); setDelOpen((v) => !v); }} />
      {delOpen ? (
        <div className="flex flex-none flex-col gap-1 border-b border-border/50 bg-destructive/5 p-2" aria-label="Delete account confirm">
          <p className="flex flex-none items-start gap-1.5 px-1 text-xs leading-relaxed text-destructive">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden />
            Permanently deletes your account and every piece of data in it — workouts, PRs, routines,
            body logs. No undo.
          </p>
          <div data-row className="flex h-12 items-center gap-2 overflow-hidden whitespace-nowrap">
            <span className="w-20 flex-none text-xs text-muted-foreground">Type DELETE</span>
            <Input
              className="h-12 flex-1 rounded-lg font-mono tracking-widest"
              value={delTyped}
              onChange={(e) => setDelTyped(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              aria-label="Type DELETE to confirm account deletion"
            />
            <Button
              type="button"
              variant="destructive"
              className="h-12 flex-none rounded-lg px-4"
              disabled={delTyped.trim().toUpperCase() !== "DELETE" || deleting || !online}
              onClick={() => void confirmDeleteAccount()}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              Delete
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ── Data ─────────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function DataSection() {
  const invalidate = useInvalidate();
  const online = useOnline();

  const [exporting, setExporting] = useState(false);
  const [csvBusy, setCsvBusy] = useState<"workouts" | "body" | null>(null);
  const [recalcing, setRecalcing] = useState(false);

  // ----- import (legacy dialog → inline expansion) -----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<unknown | null>(null);
  const [importMode, setImportMode] = useState<"replace" | "merge">("merge");
  const [importing, setImporting] = useState(false);
  const [importFileName, setImportFileName] = useState<string | null>(null);

  const resetFileInput = () => {
    setImportFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onFileChosen = async (file: File) => {
    setImportFileName(file.name);
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error("File too large — backups are limited to 50 MB");
      resetFileInput();
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        throw new Error("not an object");
      }
      setPendingImport(data);
    } catch {
      toast.error("That file is not valid JSON — expected a SetForge backup");
      resetFileInput();
    }
  };

  const confirmImport = async () => {
    if (pendingImport == null) return;
    setImporting(true);
    try {
      const res = await accountApi.importBackup(pendingImport, importMode);
      toast.success(
        `Import complete — ${res.importedWorkouts} workout${res.importedWorkouts === 1 ? "" : "s"} restored`,
      );
      setPendingImport(null);
      resetFileInput();
      invalidate.all();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // ----- clear data (delete workout history) — confirm-destructive -----
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const confirmClear = async () => {
    setClearing(true);
    try {
      const res = await accountApi.deleteHistory({ mode: "all" });
      toast.success(
        `Deleted ${res.deletedWorkouts} workout${res.deletedWorkouts === 1 ? "" : "s"} — PRs recalculated`,
      );
      setClearOpen(false);
      invalidate.all();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete history");
    } finally {
      setClearing(false);
    }
  };

  // ----- actions -----
  const exportBackup = async () => {
    setExporting(true);
    try {
      const backup = await accountApi.exportBackup();
      downloadBlob(
        new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
        `setforge-backup-${todayKey()}.json`,
      );
      toast.success("Backup downloaded — keep it somewhere safe");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const exportCsv = async (type: "workouts" | "body") => {
    setCsvBusy(type);
    try {
      const blob = await accountApi.exportCsv(type);
      downloadBlob(blob, `setforge-${type}-${todayKey()}.csv`);
      toast.success(`${type === "workouts" ? "Workouts" : "Body"} CSV downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setCsvBusy(null);
    }
  };

  const recalculate = async () => {
    setRecalcing(true);
    try {
      const res = await recordsApi.recalculate();
      toast.success(`Recalculated ${res.recalculated} exercises`);
      invalidate.all();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recalculation failed");
    } finally {
      setRecalcing(false);
    }
  };

  return (
    <section aria-label="Data" className="flex flex-col">
      <SectionHeader title="Data" />

      <ActionRow
        label="Export data"
        hint="JSON backup"
        disabled={exporting || !online}
        onClick={() => void exportBackup()}
        trailing={
          exporting ? (
            <Loader2 className="h-4 w-4 flex-none animate-spin text-muted-foreground" aria-hidden />
          ) : undefined
        }
      />
      <ActionRow
        label="Workouts CSV"
        disabled={csvBusy !== null || !online}
        onClick={() => void exportCsv("workouts")}
        trailing={
          csvBusy === "workouts" ? (
            <Loader2 className="h-4 w-4 flex-none animate-spin text-muted-foreground" aria-hidden />
          ) : undefined
        }
      />
      <ActionRow
        label="Body CSV"
        disabled={csvBusy !== null || !online}
        onClick={() => void exportCsv("body")}
        trailing={
          csvBusy === "body" ? (
            <Loader2 className="h-4 w-4 flex-none animate-spin text-muted-foreground" aria-hidden />
          ) : undefined
        }
      />

      {/* import / restore — inline expansion */}
      <ActionRow
        label="Import backup"
        hint={importFileName ? importFileName.slice(0, 18) : "merge / replace"}
        onClick={() => setImportOpen((v) => !v)}
      />
      {importOpen ? (
        <div className="flex flex-none flex-col gap-1 border-b border-border/50 bg-muted/20 p-2" aria-label="Import backup">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFileChosen(file);
            }}
          />
          <ActionRow
            label={importFileName ? `File · ${importFileName}` : "Choose backup file (.json)"}
            ariaLabel="Choose backup file"
            disabled={!online}
            onClick={() => fileInputRef.current?.click()}
          />
          {pendingImport != null ? (
            <>
              <MenuRow
                label="Mode"
                value={importMode}
                options={[
                  { value: "merge", label: "Merge" },
                  { value: "replace", label: "Replace all data" },
                ]}
                onSelect={(v) => setImportMode(v)}
              />
              <ActionRow
                label={importMode === "replace" ? "Replace & import" : "Merge & import"}
                disabled={importing || !online}
                onClick={() => void confirmImport()}
                trailing={
                  importing ? (
                    <Loader2 className="h-4 w-4 flex-none animate-spin text-muted-foreground" aria-hidden />
                  ) : undefined
                }
              />
              {importMode === "replace" ? (
                <p className="flex-none px-1 text-xs text-destructive" role="alert">
                  Replace deletes your current workouts, routines, body measurements and goals first.
                  No undo — export a backup first.
                </p>
              ) : null}
            </>
          ) : (
            <p className="flex-none px-1 text-xs text-muted-foreground">
              Restore data from a SetForge backup file (max 50 MB).
            </p>
          )}
        </div>
      ) : null}

      <ActionRow
        label="Recalculate PRs"
        disabled={recalcing || !online}
        onClick={() => void recalculate()}
        trailing={
          recalcing ? (
            <Loader2 className="h-4 w-4 flex-none animate-spin text-muted-foreground" aria-hidden />
          ) : undefined
        }
      />

      {/* clear data — confirm-destructive */}
      <ActionRow label="Clear data" hint="all workouts" destructive onClick={() => setClearOpen(true)} />
      <AlertDialog open={clearOpen} onOpenChange={(o) => !clearing && setClearOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all workout history?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every logged workout and recalculates your personal records.
              Routines, body measurements and your account stay. There is no undo — export a backup
              first if you might want it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={clearing}
              onClick={(e) => {
                e.preventDefault();
                void confirmClear();
              }}
            >
              {clearing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

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

  const isInstalled = installed || standalone;

  return (
    <section aria-label="App" className="flex flex-col">
      <SectionHeader title="App" />
      <Row
        label="Install app"
        control={
          isInstalled ? (
            <span className="flex-none text-sm text-emerald-600 dark:text-emerald-400">Installed</span>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-none rounded-lg px-4"
              disabled={!canInstall}
              onClick={() => void promptInstall()}
            >
              Install
            </Button>
          )
        }
      />
      <ValueRow
        label="Connection"
        value={
          <span className={online ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
            {online ? "Online" : "Offline"}
          </span>
        }
      />
      <Row
        label="Offline mode"
        control={<span className="flex-none text-sm text-primary">Always on</span>}
      />
      <ActionRow
        label="Clear offline cache"
        disabled={clearing}
        onClick={() => void clearCache()}
        trailing={
          clearing ? (
            <Loader2 className="h-4 w-4 flex-none animate-spin text-muted-foreground" aria-hidden />
          ) : undefined
        }
      />
      <ActionRow
        label="Help & shortcuts"
        hint="Feature tour · keys · offline"
        onClick={() => replaceHash("#/help?from=settings")}
      />
      <ValueRow label="About" value="SetForge · offline-first workout tracker" valueClassName="text-xs" />
      <ValueRow label="Version" value={APP_VERSION} />
    </section>
  );
}

// ── Part 5: Programs & scheduling section ────────────────────────────────────

const COMMON_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const REMINDER_TIMES = ["06:00", "07:00", "08:00", "12:00", "17:00", "18:00", "19:00", "20:00", "21:00"];

export function ProgramsSection() {
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  if (!settings) return null;

  const patch = (p: Partial<SettingsDTO>) => {
    void updateSettings(p).catch(() => undefined);
  };

  const tzOptions = Array.from(new Set([browserTz, settings.timezone || "UTC", ...COMMON_TIMEZONES]));
  const reminderValue = settings.reminderTime ?? "off";

  const enableReminder = async (time: string) => {
    const granted = await requestReminderPermission();
    if (!granted) {
      toast.error("Notifications blocked", {
        description: "Allow notifications for this site in your browser to get the daily reminder.",
      });
      return;
    }
    patch({ reminderTime: time });
    toast.success(`Daily reminder set for ${time}`);
  };

  return (
    <section aria-label="Programs" className="flex flex-col">
      <SectionHeader title="Programs" />
      <MenuRow
        label="Timezone"
        hint="Day rollover"
        value={settings.timezone || "UTC"}
        options={tzOptions.map((tz) => ({ value: tz, label: tz.split("/").pop()?.replace(/_/g, " ") ?? tz }))}
        onSelect={(v) => patch({ timezone: v })}
      />
      <SwitchRow
        label="Auto-advance rest days"
        hint="After midnight"
        checked={settings.autoAdvanceRest}
        onCheckedChange={(v) => patch({ autoAdvanceRest: v })}
      />
      <SwitchRow
        label="Scheduling moves cursor"
        hint="Logging a scheduled day advances the program"
        checked={settings.scheduleMovesCursor}
        onCheckedChange={(v) => patch({ scheduleMovesCursor: v })}
      />
      <MenuRow
        label="Advance trigger"
        hint="When the program day rolls over"
        value={settings.advanceTrigger}
        options={[
          { value: "FINISH_OR_MIDNIGHT", label: "Finish or midnight" },
          { value: "FIRST_SET", label: "First set" },
        ]}
        onSelect={(v) => patch({ advanceTrigger: v })}
      />
      <SwitchRow
        label="Show projected days"
        hint="Calendar ghosts of upcoming program days"
        checked={settings.showProjectedDays}
        onCheckedChange={(v) => patch({ showProjectedDays: v })}
      />
      <MenuRow
        label="Daily reminder"
        hint={reminderValue === "off" ? "Off" : `Fires at ${settings.reminderTime}`}
        value={reminderValue}
        options={[
          { value: "off", label: "Off" },
          ...REMINDER_TIMES.map((t) => ({ value: t, label: t })),
        ]}
        onSelect={(v) => {
          if (v === "off") {
            patch({ reminderTime: null });
            toast.success("Daily reminder off");
            return;
          }
          void enableReminder(String(v));
        }}
      />
    </section>
  );
}
