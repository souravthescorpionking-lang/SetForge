"use client";

// History tab: all records of the selected measurement, grouped by day,
// with per-record edit/delete and summary chips (min / max / avg).

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/shared/stepper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DeltaChip } from "./delta-chip";
import { useBodyAction, localDayKey, localDayLabel, localInputToIso, timeOf, toLocalInputValue } from "./offline-mutation";
import { measurementsApi } from "@/lib/client/api";
import { qk, useInvalidate } from "@/lib/client/query";
import { relativeFromNow, round2 } from "@/lib/client/format";
import type { MeasurementDTO, MeasurementRecordDTO } from "@/lib/types";
import { CalendarClock, Pencil, Trash2 } from "lucide-react";

type Props = {
  measurements: MeasurementDTO[];
  selectedId: string;
  onSelect: (id: string) => void;
};

type DayGroup = { key: string; label: string; records: MeasurementRecordDTO[] };

export function HistoryTab({ measurements, selectedId, onSelect }: Props) {
  const act = useBodyAction();
  const inv = useInvalidate();
  const measurement = measurements.find((m) => m.id === selectedId) ?? null;

  const { data, isLoading } = useQuery({
    queryKey: qk.measurementRecords(selectedId),
    queryFn: () => measurementsApi.records(selectedId),
    enabled: !!selectedId,
  });
  const records = data?.records ?? [];

  const groups = useMemo<DayGroup[]>(() => {
    const out: DayGroup[] = [];
    const index = new Map<string, DayGroup>();
    for (const r of records) {
      const key = localDayKey(r.recordedAt);
      let g = index.get(key);
      if (!g) {
        g = { key, label: localDayLabel(key), records: [] };
        index.set(key, g);
        out.push(g);
      }
      g.records.push(r);
    }
    return out;
  }, [records]);

  // delta vs previous record (chronologically previous = next in desc list)
  const prevOf = useMemo(() => {
    const map = new Map<string, number | null>();
    for (let i = 0; i < records.length; i++) {
      map.set(records[i].id, i + 1 < records.length ? records[i + 1].value : null);
    }
    return map;
  }, [records]);

  const stats = useMemo(() => {
    if (records.length === 0) return null;
    const values = records.map((r) => r.value);
    return {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    };
  }, [records]);

  // ---- edit state ----
  const [editing, setEditing] = useState<MeasurementRecordDTO | null>(null);
  const [editValue, setEditValue] = useState<number | null>(null);
  const [editComment, setEditComment] = useState("");
  const [editDt, setEditDt] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (r: MeasurementRecordDTO) => {
    setEditing(r);
    setEditValue(r.value);
    setEditComment(r.comment ?? "");
    setEditDt(toLocalInputValue(new Date(r.recordedAt)));
  };

  const saveEdit = async () => {
    if (!editing || !measurement || editValue == null || savingEdit) return;
    setSavingEdit(true);
    const recordedAt = localInputToIso(editDt);
    const payload = {
      value: editValue,
      comment: editComment.trim() || null,
      ...(recordedAt ? { recordedAt } : {}),
    };
    const ok = await act({
      path: `/api/measurements/${measurement.id}/records/${editing.id}`,
      method: "PATCH",
      body: payload,
      label: "Update entry",
      run: () => measurementsApi.updateRecord(measurement.id, editing.id, payload),
      successMsg: "Entry updated",
      onDone: () => inv.measurements(),
    });
    setSavingEdit(false);
    if (ok) setEditing(null);
  };

  const deleteRecord = (r: MeasurementRecordDTO) => {
    if (!measurement) return;
    void act({
      path: `/api/measurements/${measurement.id}/records/${r.id}`,
      method: "DELETE",
      label: "Delete entry",
      run: () => measurementsApi.removeRecord(measurement.id, r.id),
      successMsg: "Entry deleted",
      onDone: () => inv.measurements(),
    });
  };

  const unit = measurement?.unit.name ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2.5 sm:p-3">
        <Select value={selectedId} onValueChange={onSelect}>
          <SelectTrigger className="h-9 w-44 sm:w-56" aria-label="Measurement">
            <SelectValue placeholder="Pick measurement" />
          </SelectTrigger>
          <SelectContent>
            {measurements.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name} ({m.unit.name})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {stats && (
          <div className="ms-auto flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="numeric gap-1">
              <span className="text-muted-foreground">min</span> {round2(stats.min)} {unit}
            </Badge>
            <Badge variant="outline" className="numeric gap-1">
              <span className="text-muted-foreground">max</span> {round2(stats.max)} {unit}
            </Badge>
            <Badge variant="outline" className="numeric gap-1">
              <span className="text-muted-foreground">avg</span> {round2(stats.avg)} {unit}
            </Badge>
            <Badge variant="secondary" className="numeric">
              {stats.count} entries
            </Badge>
          </div>
        )}
      </div>

      {isLoading || !measurement ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6 py-14 text-center">
          <CalendarClock className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-semibold">No entries for {measurement.name} yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Log your first value from the Track tab.</p>
        </div>
      ) : (
        <div className="max-h-[calc(100vh-22rem)] min-h-64 overflow-y-auto scroll-slim pr-1">
          {groups.map((g) => (
            <section key={g.key} className="mb-3">
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </h3>
              <ul className="space-y-1.5">
                {g.records.map((r, i) => (
                  <motion.li
                    key={r.id}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.14, delay: Math.min(i, 8) * 0.02 }}
                    className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5"
                  >
                    <span className="numeric w-12 shrink-0 text-xs text-muted-foreground">
                      {timeOf(r.recordedAt)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                        <span className="numeric text-sm font-bold">
                          {round2(r.value)}
                          <span className="ml-1 text-xs font-medium text-muted-foreground">{unit}</span>
                        </span>
                        <DeltaChip
                          goalType={measurement.goalType}
                          last={r.value}
                          prev={prevOf.get(r.id) ?? null}
                          target={measurement.targetValue}
                          unit={unit}
                        />
                        <span className="text-[11px] text-muted-foreground/70">
                          {relativeFromNow(r.recordedAt)}
                        </span>
                      </div>
                      {r.comment && (
                        <p className="mt-0.5 truncate text-xs italic text-muted-foreground">{r.comment}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-60 sm:transition-opacity sm:group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Edit entry"
                        onClick={() => openEdit(r)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500"
                            aria-label="Delete entry"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        }
                        title="Delete this entry?"
                        description={`${round2(r.value)} ${unit} — ${g.label} ${timeOf(r.recordedAt)}${
                          r.comment ? ` · “${r.comment}”` : ""
                        }`}
                        onConfirm={() => deleteRecord(r)}
                      />
                    </div>
                  </motion.li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* ---- edit record dialog ---- */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit entry</DialogTitle>
            <DialogDescription>{measurement?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Value ({measurement?.unit.name ?? ""})
              </Label>
              <Stepper
                value={editValue}
                onChange={setEditValue}
                step={0.1}
                min={0}
                max={100000}
                decimals={2}
                size="sm"
                suffix={measurement?.unit.name}
                ariaLabel="value"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rec-comment" className="text-xs text-muted-foreground">
                Comment
              </Label>
              <Input
                id="rec-comment"
                value={editComment}
                onChange={(e) => setEditComment(e.target.value)}
                maxLength={500}
                placeholder="Optional"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rec-dt" className="text-xs text-muted-foreground">
                Date &amp; time
              </Label>
              <Input
                id="rec-dt"
                type="datetime-local"
                value={editDt}
                onChange={(e) => setEditDt(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void saveEdit()} disabled={editValue == null || savingEdit}>
                {savingEdit ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
