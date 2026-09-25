"use client";

// Measurement configuration dialog: create custom measurements, reorder
// (drag & drop), edit unit/goal/target, delete custom ones.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/shared/stepper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { GoalBadge } from "./delta-chip";
import { useBodyAction } from "./offline-mutation";
import { measurementsApi, unitsApi } from "@/lib/client/api";
import { qk, useInvalidate } from "@/lib/client/query";
import type { MeasurementDTO } from "@/lib/types";
import { MEASUREMENT_GOAL_TYPES } from "@/lib/constants";
import { GripVertical, Lock, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const CUSTOM_UNIT = "__custom__";
const GOAL_LABELS: Record<string, string> = {
  INCREASE: "Increase",
  DECREASE: "Decrease",
  SPECIFIC: "Specific target",
  NONE: "None",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  measurements: MeasurementDTO[];
};

export function MeasurementConfigDialog({ open, onOpenChange, measurements }: Props) {
  const act = useBodyAction();
  const inv = useInvalidate();
  const qc = useQueryClient();
  const { data: unitsData, isLoading: unitsLoading } = useQuery({
    queryKey: qk.units,
    queryFn: () => unitsApi.list(),
    enabled: open,
  });
  const units = unitsData?.units ?? [];

  // ---- create form ----
  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [customUnit, setCustomUnit] = useState("");
  const [goalType, setGoalType] = useState<string>("NONE");
  const [targetValue, setTargetValue] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  // ---- local drag order ----
  const [orderIds, setOrderIds] = useState<string[] | null>(null);
  const list = useMemo(() => {
    const sorted = [...measurements].sort((a, b) => a.sortOrder - b.sortOrder);
    if (orderIds && orderIds.length === measurements.length && measurements.every((m) => orderIds.includes(m.id))) {
      return orderIds
        .map((id) => sorted.find((m) => m.id === id))
        .filter((m): m is MeasurementDTO => !!m);
    }
    return sorted;
  }, [measurements, orderIds]);

  // ---- edit dialog ----
  const [editing, setEditing] = useState<MeasurementDTO | null>(null);
  const [editUnitId, setEditUnitId] = useState<string | null>(null);
  const [editGoal, setEditGoal] = useState<string>("NONE");
  const [editTarget, setEditTarget] = useState<number | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const closeDialog = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setName("");
      setUnitId(null);
      setCustomUnit("");
      setGoalType("NONE");
      setTargetValue(null);
      setOrderIds(null);
      setEditing(null);
    }
  };

  const createCustomUnit = async () => {
    const trimmed = customUnit.trim();
    if (!trimmed) return;
    const ok = await act({
      path: "/api/units",
      method: "POST",
      body: { name: trimmed },
      label: `Create “${trimmed}” unit`,
      run: () => unitsApi.create(trimmed),
      successMsg: `Unit “${trimmed}” added`,
      onDone: () => void qc.invalidateQueries({ queryKey: qk.units }),
    });
    if (!ok) return;
    const { units: fresh } = await unitsApi.list();
    const created = fresh.find((u) => u.name.toLowerCase() === trimmed.toLowerCase());
    if (created) setUnitId(created.id);
    setCustomUnit("");
  };

  const createMeasurement = async () => {
    const trimmed = name.trim();
    if (!trimmed || !unitId || creating) return;
    setCreating(true);
    const ok = await act({
      path: "/api/measurements",
      method: "POST",
      body: { name: trimmed, unitId, goalType, targetValue: goalType === "NONE" ? null : targetValue, isEnabled: true },
      label: `Create ${trimmed}`,
      run: () =>
        measurementsApi.create({
          name: trimmed,
          unitId,
          goalType,
          targetValue: goalType === "NONE" ? null : targetValue,
          isEnabled: true,
        }),
      successMsg: `${trimmed} created`,
      onDone: () => inv.measurements(),
    });
    setCreating(false);
    if (ok) {
      setName("");
      setTargetValue(null);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = list.findIndex((m) => m.id === active.id);
    const newIndex = list.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(list, oldIndex, newIndex);
    setOrderIds(next.map((m) => m.id));
    void act({
      path: "/api/measurements/reorder",
      method: "POST",
      body: { ids: next.map((m) => m.id) },
      label: "Reorder measurements",
      run: () => measurementsApi.reorder(next.map((m) => m.id)),
      successMsg: "Order saved",
      onDone: () => inv.measurements(),
    });
  };

  const openEdit = (m: MeasurementDTO) => {
    setEditing(m);
    setEditUnitId(m.unitId);
    setEditGoal(m.goalType);
    setEditTarget(m.targetValue);
  };

  const saveEdit = async () => {
    if (!editing || savingEdit) return;
    setSavingEdit(true);
    const payload = {
      unitId: editUnitId ?? editing.unitId,
      goalType: editGoal,
      targetValue: editGoal === "NONE" ? null : editTarget,
    };
    const ok = await act({
      path: `/api/measurements/${editing.id}`,
      method: "PATCH",
      body: payload,
      label: `Update ${editing.name}`,
      run: () => measurementsApi.update(editing.id, payload),
      successMsg: `${editing.name} updated`,
      onDone: () => inv.measurements(),
    });
    setSavingEdit(false);
    if (ok) setEditing(null);
  };

  const resetGoal = async () => {
    if (!editing) return;
    const ok = await act({
      path: `/api/measurements/${editing.id}`,
      method: "PATCH",
      body: { goalType: "NONE", targetValue: null },
      label: `Reset goal for ${editing.name}`,
      run: () => measurementsApi.update(editing.id, { goalType: "NONE", targetValue: null }),
      successMsg: "Goal reset",
      onDone: () => inv.measurements(),
    });
    if (ok) {
      setEditGoal("NONE");
      setEditTarget(null);
      setEditing((m) => (m ? { ...m, goalType: "NONE", targetValue: null } : m));
    }
  };

  const deleteMeasurement = (m: MeasurementDTO) => {
    void act({
      path: `/api/measurements/${m.id}`,
      method: "DELETE",
      label: `Delete ${m.name}`,
      run: () => measurementsApi.remove(m.id),
      successMsg: `${m.name} deleted`,
      onDone: () => inv.measurements(),
    });
  };

  const showTarget = goalType !== "NONE";

  return (
    <>
      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
          <DialogHeader className="border-b p-4 pb-3">
            <DialogTitle>Measurement setup</DialogTitle>
            <DialogDescription>
              Create custom measurements, reorder, edit goals and units.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-4 p-4">
              {/* ---- create ---- */}
              <section className="space-y-2.5 rounded-xl border bg-muted/30 p-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  New measurement
                </h3>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="m-name" className="text-xs text-muted-foreground">
                      Name
                    </Label>
                    <Input
                      id="m-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Sleep score"
                      maxLength={60}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Unit</Label>
                    <Select
                      value={unitId ?? ""}
                      onValueChange={(v) => {
                        if (v !== CUSTOM_UNIT) setUnitId(v);
                        else setUnitId(CUSTOM_UNIT);
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder={unitsLoading ? "Loading…" : "Pick unit"} />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_UNIT}>Custom unit…</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Goal</Label>
                    <Select value={goalType} onValueChange={setGoalType}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEASUREMENT_GOAL_TYPES.map((g) => (
                          <SelectItem key={g} value={g}>
                            {GOAL_LABELS[g] ?? g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {showTarget && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Target value</Label>
                      <Stepper
                        value={targetValue}
                        onChange={setTargetValue}
                        step={0.5}
                        min={0}
                        max={100000}
                        decimals={2}
                        size="sm"
                        ariaLabel="target value"
                      />
                    </div>
                  )}
                </div>
                {unitId === CUSTOM_UNIT && (
                  <div className="flex gap-2">
                    <Input
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value)}
                      placeholder="Unit name (e.g. score)"
                      maxLength={20}
                      className="h-9"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-1"
                      disabled={!customUnit.trim()}
                      onClick={() => void createCustomUnit()}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add unit
                    </Button>
                  </div>
                )}
                <Button
                  className="w-full gap-1.5"
                  size="sm"
                  disabled={!name.trim() || !unitId || unitId === CUSTOM_UNIT || creating}
                  onClick={() => void createMeasurement()}
                >
                  <Plus className="h-4 w-4" />
                  {creating ? "Creating…" : "Create measurement"}
                </Button>
              </section>

              <Separator />

              {/* ---- manage ---- */}
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Manage &amp; reorder
                </h3>
                {measurements.length === 0 ? (
                  <Skeleton className="h-16 w-full rounded-xl" />
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={list.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                      <ul className="space-y-1.5">
                        {list.map((m) => (
                          <SortableRow
                            key={m.id}
                            m={m}
                            onEdit={() => openEdit(m)}
                            onDelete={() => deleteMeasurement(m)}
                          />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Drag the grip to reorder. Built-in measurements can be edited but not deleted.
                </p>
              </section>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ---- edit dialog ---- */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
            <DialogDescription>Defaults for this measurement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Unit</Label>
              <Select value={editUnitId ?? ""} onValueChange={setEditUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick unit" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Goal</Label>
              <Select value={editGoal} onValueChange={setEditGoal}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEASUREMENT_GOAL_TYPES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {GOAL_LABELS[g] ?? g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editGoal !== "NONE" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Target value</Label>
                <Stepper
                  value={editTarget}
                  onChange={setEditTarget}
                  step={0.5}
                  min={0}
                  max={100000}
                  decimals={2}
                  size="sm"
                  ariaLabel="target value"
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => void resetGoal()}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset goal
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => void saveEdit()} disabled={savingEdit}>
                <Save className="h-3.5 w-3.5" /> {savingEdit ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SortableRow({
  m,
  onEdit,
  onDelete,
}: {
  m: MeasurementDTO;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-xl border bg-card px-2.5 py-2",
        isDragging && "z-10 border-primary/60 shadow-lg",
      )}
    >
      <button
        type="button"
        className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing"
        aria-label={`Reorder ${m.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{m.name}</span>
          <span className="text-xs text-muted-foreground">{m.unit.name}</span>
          {!m.isEnabled && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              off
            </span>
          )}
        </div>
        <div className="mt-0.5">
          <GoalBadge goalType={m.goalType} target={m.targetValue} unit={m.unit.name} />
        </div>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${m.name}`} onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      {m.isCustom ? (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" aria-label={`Delete ${m.name}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          }
          title={`Delete ${m.name}?`}
          description="The measurement and all its records will be removed."
          onConfirm={onDelete}
        />
      ) : (
        <span
          className="flex h-8 w-8 items-center justify-center text-muted-foreground/50"
          title="Built-in measurements can't be deleted"
        >
          <Lock className="h-3.5 w-3.5" />
        </span>
      )}
    </li>
  );
}
