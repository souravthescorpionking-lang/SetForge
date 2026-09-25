"use client";

// Data section: backup export/import, CSV export, PR recalculation, history deletion.
import { useRef, useState } from "react";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ExercisePickerDialog } from "@/components/shared/exercise-picker";
import { accountApi, recordsApi } from "@/lib/client/api";
import { useInvalidate, useOnline } from "@/lib/client/query";
import { todayKey } from "@/lib/client/format";
import type { ExerciseDTO } from "@/lib/types";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Download,
  FileJson,
  FileSpreadsheet,
  FileUp,
  Loader2,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingRow, SectionHeading } from "./settings-controls";
import { DateField } from "@/features/tools/date-field";

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

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

type HistoryMode = "all" | "range" | "exercise";

export function DataSection() {
  const invalidate = useInvalidate();
  const online = useOnline();

  const [exporting, setExporting] = useState(false);
  const [csvBusy, setCsvBusy] = useState<"workouts" | "body" | null>(null);
  const [recalcing, setRecalcing] = useState(false);

  // ----- import -----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<unknown | null>(null);
  const [importMode, setImportMode] = useState<"replace" | "merge">("merge");
  const [importing, setImporting] = useState(false);
  const [importFileName, setImportFileName] = useState<string | null>(null);

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

  const resetFileInput = () => {
    setImportFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

  // ----- delete history -----
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyMode, setHistoryMode] = useState<HistoryMode>("range");
  const [fromKey, setFromKey] = useState<string | null>(null);
  const [toKey, setToKey] = useState<string | null>(null);
  const [exercise, setExercise] = useState<ExerciseDTO | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  const deleteValid =
    historyMode === "all"
      ? typed.trim().toUpperCase() === "DELETE"
      : historyMode === "range"
        ? !!fromKey && !!toKey && fromKey <= toKey
        : !!exercise;

  const openDelete = () => {
    setHistoryMode("range");
    setFromKey(null);
    setToKey(null);
    setExercise(null);
    setTyped("");
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res = await accountApi.deleteHistory({
        mode: historyMode,
        ...(historyMode === "range" ? { from: fromKey!, to: toKey! } : {}),
        ...(historyMode === "exercise" ? { exerciseId: exercise!.id } : {}),
      });
      toast.success(
        `Deleted ${res.deletedWorkouts} workout${res.deletedWorkouts === 1 ? "" : "s"} — PRs recalculated`,
      );
      setDeleteOpen(false);
      invalidate.all();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete history");
    } finally {
      setDeleting(false);
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
    <>
      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-3">
          <SectionHeading
            icon={<FileJson className="h-4.5 w-4.5" />}
            title="Data"
            description="Backups, imports and maintenance tools"
          />
        </CardHeader>
        <CardContent className="divide-y divide-border/60 pt-0">
          <SettingRow
            stacked
            icon={<Download className="h-4 w-4" />}
            label="Export JSON backup"
            helper="Complete backup of your account — workouts, routines, measurements, plates, goals and settings. Restore it anywhere."
            control={
              <Button
                onClick={() => void exportBackup()}
                disabled={exporting || !online}
                className="w-full gap-2 sm:w-auto"
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download backup
              </Button>
            }
          />

          <SettingRow
            stacked
            icon={<FileUp className="h-4 w-4" />}
            label="Import / restore"
            helper={
              importFileName
                ? `Selected: ${importFileName}`
                : "Restore data from a SetForge backup file (.json, max 50 MB). You choose whether to merge or replace."
            }
            control={
              <>
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
                <Button
                  variant="secondary"
                  disabled={!online}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full gap-2 sm:w-auto"
                >
                  <Upload className="h-4 w-4" />
                  Choose backup file
                </Button>
              </>
            }
          />

          <SettingRow
            stacked
            icon={<FileSpreadsheet className="h-4 w-4" />}
            label="Export CSV"
            helper="Spreadsheet-friendly exports of your training log and body measurements."
            control={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  variant="outline"
                  disabled={csvBusy !== null || !online}
                  onClick={() => void exportCsv("workouts")}
                  className="gap-2"
                >
                  {csvBusy === "workouts" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4" />
                  )}
                  Workouts CSV
                </Button>
                <Button
                  variant="outline"
                  disabled={csvBusy !== null || !online}
                  onClick={() => void exportCsv("body")}
                  className="gap-2"
                >
                  {csvBusy === "body" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4" />
                  )}
                  Body CSV
                </Button>
              </div>
            }
          />

          <SettingRow
            stacked
            icon={<RefreshCw className="h-4 w-4" />}
            label="Recalculate PRs"
            helper="Rebuild every personal record from your complete set history. Useful after an import or if records look off."
            control={
              <Button
                variant="outline"
                disabled={recalcing || !online}
                onClick={() => void recalculate()}
                className="w-full gap-2 sm:w-auto"
              >
                {recalcing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Recalculate
              </Button>
            }
          />

          <SettingRow
            stacked
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete workout history"
            helper="Remove logged workouts — everything, a date range, or a single exercise. PRs are recalculated afterwards."
            control={
              <Button
                variant="destructive"
                className="w-full gap-2 sm:w-auto"
                disabled={!online}
                onClick={openDelete}
              >
                <Trash2 className="h-4 w-4" />
                Delete history…
              </Button>
            }
          />
        </CardContent>
      </Card>

      {/* Import mode dialog */}
      <Dialog
        open={pendingImport != null}
        onOpenChange={(o) => {
          if (!o && !importing) {
            setPendingImport(null);
            resetFileInput();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" /> Restore backup
            </DialogTitle>
            <DialogDescription>
              {importFileName ? `From “${importFileName}”` : "Choose how to restore the backup."}
            </DialogDescription>
          </DialogHeader>

          <RadioGroup
            value={importMode}
            onValueChange={(v) => setImportMode(v as "replace" | "merge")}
            className="gap-3"
          >
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors",
                importMode === "merge" ? "border-primary/50 bg-primary/5" : "border-border/60 hover:bg-accent/50",
              )}
            >
              <RadioGroupItem value="merge" className="mt-0.5" />
              <span className="space-y-1">
                <span className="block text-sm font-semibold">Merge</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  Keeps your current data and adds workouts from the backup. Days that already have a
                  workout are skipped.
                </span>
              </span>
            </label>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors",
                importMode === "replace" ? "border-destructive/60 bg-destructive/5" : "border-border/60 hover:bg-accent/50",
              )}
            >
              <RadioGroupItem value="replace" className="mt-0.5" />
              <span className="space-y-1">
                <span className="block text-sm font-semibold text-destructive">Replace all data</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  Deletes your current workouts, routines, body measurements and goals first, then
                  imports the backup. Categories, exercises and plates stay.
                </span>
              </span>
            </label>
          </RadioGroup>

          {importMode === "replace" && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This cannot be undone. Export a fresh backup first if you might want your current data back.
            </motion.p>
          )}

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              variant="outline"
              disabled={importing}
              onClick={() => {
                setPendingImport(null);
                resetFileInput();
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void confirmImport()} disabled={importing}>
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              {importMode === "replace" ? "Replace & import" : "Merge & import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete history dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" /> Delete workout history
            </AlertDialogTitle>
            <AlertDialogDescription>
              Choose what to remove. Personal records are recalculated right after.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <RadioGroup
              value={historyMode}
              onValueChange={(v) => setHistoryMode(v as HistoryMode)}
              className="gap-2.5"
            >
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 p-3 transition-colors has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5">
                <RadioGroupItem value="range" />
                <span>
                  <span className="block cursor-pointer text-sm font-medium">
                    Date range
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Delete workouts between two dates (inclusive).
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 p-3 transition-colors has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5">
                <RadioGroupItem value="exercise" />
                <span>
                  <span className="block cursor-pointer text-sm font-medium">
                    By exercise
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Remove one exercise from all workouts; empty workouts are removed.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 p-3 transition-colors has-[[data-state=checked]]:border-destructive/60 has-[[data-state=checked]]:bg-destructive/5">
                <RadioGroupItem value="all" />
                <span>
                  <span className="block cursor-pointer text-sm font-medium text-destructive">
                    All history
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Permanently delete every logged workout.
                  </span>
                </span>
              </label>
            </RadioGroup>

            {historyMode === "range" && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <DateField
                      value={fromKey}
                      onChange={setFromKey}
                      placeholder="Start date"
                      className="w-full"
                      ariaLabel="Range start date"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <DateField
                      value={toKey}
                      onChange={setToKey}
                      placeholder="End date"
                      className="w-full"
                      ariaLabel="Range end date"
                    />
                  </div>
                </div>
                {fromKey && toKey && fromKey > toKey && (
                  <p className="text-xs text-destructive">Start date must be on or before the end date.</p>
                )}
              </motion.div>
            )}

            {historyMode === "exercise" && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setPickerOpen(true)}>
                  {exercise ? (
                    <>
                      <span className="h-2 w-2 rounded-full" style={{ background: exercise.category?.colour ?? "#f97316" }} />
                      <span className="truncate">{exercise.name}</span>
                    </>
                  ) : (
                    "Select exercise…"
                  )}
                </Button>
                <ExercisePickerDialog
                  open={pickerOpen}
                  onOpenChange={setPickerOpen}
                  onPick={setExercise}
                  title="Delete history for exercise"
                  description="All logged sets of this exercise will be removed."
                />
              </motion.div>
            )}

            {historyMode === "all" && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  This wipes every workout you have ever logged. There is no undo — export a backup first.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="del-type" className="text-xs text-muted-foreground">
                    Type <span className="font-mono font-semibold text-destructive">DELETE</span> to confirm
                  </Label>
                  <Input
                    id="del-type"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder="DELETE"
                    autoComplete="off"
                    className="font-mono tracking-widest"
                  />
                </div>
              </motion.div>
            )}
          </div>

          <AlertDialogFooter className="gap-2 sm:justify-end">
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteValid || deleting}
              className={cn(deleteValid && "bg-destructive text-white hover:bg-destructive/90")}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {historyMode === "all" ? "Delete everything" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
