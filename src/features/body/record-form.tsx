"use client";

// Measurement entry form: value stepper (2 decimals), optional comment,
// editable datetime (defaults to now). Used by the hero card and per-measurement cards.

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/shared/stepper";
import { DeltaChip, GoalBadge } from "./delta-chip";
import { useBodyAction, localInputToIso, toLocalInputValue } from "./offline-mutation";
import { measurementsApi } from "@/lib/client/api";
import { useInvalidate } from "@/lib/client/query";
import { relativeFromNow, round2 } from "@/lib/client/format";
import type { MeasurementDTO } from "@/lib/types";
import { Clock, MessageSquare, Save } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  measurement: MeasurementDTO;
  variant?: "hero" | "card";
  headerExtra?: ReactNode;
  className?: string;
};

export function MeasurementEntryForm({ measurement: m, variant = "card", headerExtra, className }: Props) {
  const act = useBodyAction();
  const inv = useInvalidate();
  const [value, setValue] = useState<number | null>(m.lastValue ?? null);
  const [comment, setComment] = useState("");
  const [dt, setDt] = useState(() => toLocalInputValue(new Date()));
  const [saving, setSaving] = useState(false);

  const hero = variant === "hero";

  const save = async () => {
    if (value == null || saving) return;
    setSaving(true);
    const recordedAt = localInputToIso(dt);
    const payload = { value, comment: comment.trim() || null, ...(recordedAt ? { recordedAt } : {}) };
    const ok = await act({
      path: `/api/measurements/${m.id}/records`,
      method: "POST",
      body: payload,
      label: `${m.name} entry`,
      run: () => measurementsApi.addRecord(m.id, payload),
      successMsg: `${m.name}: ${round2(value)} ${m.unit.name} logged`,
      onDone: () => inv.measurements(),
    });
    setSaving(false);
    if (ok) {
      setComment("");
      setDt(toLocalInputValue(new Date()));
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 sm:p-5",
        hero
          ? "border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent"
          : "border-border/80 bg-card",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("font-bold tracking-tight", hero ? "text-base sm:text-lg" : "text-sm")}>
              {m.name}
            </h3>
            <span className="text-xs font-medium text-muted-foreground">{m.unit.name}</span>
            <GoalBadge goalType={m.goalType} target={m.targetValue} unit={m.unit.name} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {m.lastValue != null ? (
              <span
                className={cn(
                  "numeric font-bold",
                  hero ? "text-2xl text-primary" : "text-lg text-primary",
                )}
              >
                {round2(m.lastValue)}
                <span className="ml-1 text-xs font-semibold text-muted-foreground">{m.unit.name}</span>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">No entries yet</span>
            )}
            <DeltaChip
              goalType={m.goalType}
              last={m.lastValue}
              prev={m.prevValue}
              target={m.targetValue}
              unit={m.unit.name}
            />
            {m.lastRecordedAt && (
              <span className="text-xs text-muted-foreground">{relativeFromNow(m.lastRecordedAt)}</span>
            )}
          </div>
        </div>
        {headerExtra}
      </div>

      <div className="space-y-2">
        <Stepper
          value={value}
          onChange={setValue}
          step={0.1}
          min={0}
          max={100000}
          decimals={2}
          suffix={m.unit.name}
          ariaLabel={`${m.name} value`}
          size={hero ? "md" : "sm"}
          className={hero ? "rounded-xl" : ""}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="relative">
            <MessageSquare className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comment (optional)"
              maxLength={500}
              className="h-9 pl-8 text-sm"
              aria-label={`${m.name} comment`}
            />
          </div>
          <div className="relative">
            <Clock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="datetime-local"
              value={dt}
              onChange={(e) => setDt(e.target.value)}
              className="h-9 pl-8 text-sm"
              aria-label={`${m.name} date and time`}
            />
          </div>
        </div>
        <Button
          className={cn("w-full gap-1.5", hero ? "h-11 rounded-xl text-base" : "h-9")}
          disabled={value == null || saving}
          onClick={() => void save()}
        >
          <Save className={hero ? "h-4 w-4" : "h-3.5 w-3.5"} />
          {saving ? "Saving…" : hero ? `Log ${m.name}` : "Save entry"}
        </Button>
      </div>
    </div>
  );
}

/** Tiny header row used above the form when rendered standalone. */
export function FormLabel({ children }: { children: ReactNode }) {
  return (
    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </Label>
  );
}
