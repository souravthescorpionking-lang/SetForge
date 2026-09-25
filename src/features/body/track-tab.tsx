"use client";

// Track tab: hero quick-add for the default measurement, entry cards for the
// other enabled ones, and a collapsed section to re-enable disabled ones.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { GoalBadge } from "./delta-chip";
import { MeasurementEntryForm } from "./record-form";
import { useBodyAction } from "./offline-mutation";
import { measurementsApi } from "@/lib/client/api";
import { useInvalidate } from "@/lib/client/query";
import { relativeFromNow, round2 } from "@/lib/client/format";
import type { MeasurementDTO } from "@/lib/types";
import { ChevronDown, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  measurements: MeasurementDTO[];
  loading: boolean;
  onConfigure: () => void;
};

export function TrackTab({ measurements, loading, onConfigure }: Props) {
  const act = useBodyAction();
  const inv = useInvalidate();
  const [disabledOpen, setDisabledOpen] = useState(false);

  const sorted = useMemo(
    () => [...measurements].sort((a, b) => a.sortOrder - b.sortOrder),
    [measurements],
  );
  const defaultM = sorted.find((m) => m.isDefault && m.isEnabled) ?? null;
  const others = sorted.filter((m) => m.isEnabled && m.id !== defaultM?.id);
  const disabled = sorted.filter((m) => !m.isEnabled);

  const setEnabled = (m: MeasurementDTO, isEnabled: boolean) => {
    void act({
      path: `/api/measurements/${m.id}`,
      method: "PATCH",
      body: { isEnabled },
      label: `${isEnabled ? "Enable" : "Disable"} ${m.name}`,
      run: () => measurementsApi.update(m.id, { isEnabled }),
      successMsg: `${m.name} ${isEnabled ? "enabled" : "disabled"}`,
      onDone: () => inv.measurements(),
    });
  };

  if (loading && measurements.length === 0) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-52 w-full rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {defaultM && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <MeasurementEntryForm measurement={defaultM} variant="hero" />
        </motion.div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Measurements
        </h2>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onConfigure}>
          <Settings2 className="h-4 w-4" />
          Configure
        </Button>
      </div>

      {others.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: Math.min(i, 6) * 0.03 }}
            >
              <MeasurementEntryForm measurement={m} variant="card" className="h-full" />
            </motion.div>
          ))}
        </div>
      ) : (
        !defaultM && (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No measurements enabled. Enable some below or create your own via Configure.
          </p>
        )
      )}

      {disabled.length > 0 && (
        <Collapsible open={disabledOpen} onOpenChange={setDisabledOpen}>
          <CollapsibleTrigger
            className={cn(
              "flex w-full items-center justify-between rounded-xl border bg-card px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-accent",
            )}
          >
            <span className="text-muted-foreground">
              Disabled measurements
              <span className="numeric ml-1.5 text-xs font-bold">{disabled.length}</span>
            </span>
            <ChevronDown
              className={cn("h-4 w-4 text-muted-foreground transition-transform", disabledOpen && "rotate-180")}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 divide-y overflow-hidden rounded-xl border bg-card">
              {disabled.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{m.name}</span>
                      <span className="text-xs text-muted-foreground">{m.unit.name}</span>
                      <GoalBadge goalType={m.goalType} target={m.targetValue} unit={m.unit.name} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {m.lastValue != null ? (
                        <>
                          last <span className="numeric">{round2(m.lastValue)}</span> {m.unit.name} ·{" "}
                          {relativeFromNow(m.lastRecordedAt)}
                        </>
                      ) : (
                        "no entries"
                      )}
                    </p>
                  </div>
                  <Switch
                    checked={false}
                    onCheckedChange={(v) => setEnabled(m, v)}
                    aria-label={`Enable ${m.name}`}
                  />
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
