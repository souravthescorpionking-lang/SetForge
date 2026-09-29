"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BodyScreen — #/body (Part 3 p3-7 rebuild). Primitives-only composition:
//
//   TopBar (56)  : "Body" + ⋮ (Add measurement → opens the first Track row's
//                  inline editor; Configure metrics → inline MetricsSetup
//                  expansion at the top of the ScrollBody)
//   SubBar (48)  : Track | History | Graph — 3 equal tabs, deep-linkable via
//                  ?tab= (hash query, replaceHash)
//   ScrollBody   : TRACK    — 56px rows + 96px inline editor (body-track-tab)
//                  HISTORY  — flat 40px record table (body-history-tab)
//                  GRAPH    — ControlRow → 240/360px chart → 72px DetailRow
//
// Query contract: #/body?tab=track|history|graph (track default).
// The legacy measurement-config Dialog became the inline MetricsSetup block
// (enable/disable toggles, reorder arrows, inline create).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, ChevronDown, ChevronUp, MoreVertical, Plus, Settings2, X } from "lucide-react";
import { measurementsApi, unitsApi } from "@/lib/client/api";
import { qk, useInvalidate, useMeasurements } from "@/lib/client/query";
import { replaceHash, useHashRoute } from "@/features/shell/router";
import { MEASUREMENT_GOAL_TYPES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { MeasurementDTO } from "@/lib/types";
import { BodyTrackTab } from "./body-track-tab";
import { BodyHistoryTab } from "./body-history-tab";
import { BodyGraphTab } from "./body-graph-tab";
import { BodyTimelineTab } from "./body-timeline-tab";
import { useBodyAction } from "./body-util";

const TABS = ["track", "timeline", "history", "graph"] as const;
type TabKey = (typeof TABS)[number];
const TAB_LABELS: Record<TabKey, string> = { track: "Track", timeline: "Timeline", history: "History", graph: "Graph" };

const GOAL_LABELS: Record<string, string> = {
  INCREASE: "Increase",
  DECREASE: "Decrease",
  SPECIFIC: "Target value",
  NONE: "No goal",
};

export default function BodyScreen() {
  const route = useHashRoute();

  // ---------- URL-derived state (?tab= — deep-linkable) ----------
  const tabParam = route.name === "body" ? route.query.get("tab") : null;
  const tab: TabKey = tabParam === "history" || tabParam === "graph" || tabParam === "timeline" ? tabParam : "track";

  const { data, isLoading } = useMeasurements();
  const measurements = useMemo(
    () => [...(data?.measurements ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [data],
  );

  const [configOpen, setConfigOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const firstEnabledId = useMemo(
    () => measurements.find((m) => m.isEnabled)?.id ?? null,
    [measurements],
  );

  const switchTab = (t: TabKey) => {
    if (t === tab) return;
    setExpandedId(null);
    replaceHash(`#/body?tab=${t}`);
  };

  // ⋮ → "Add measurement": jump to Track and open the first row's inline editor
  const onAddMeasurement = () => {
    if (tab !== "track") replaceHash("#/body?tab=track");
    if (firstEnabledId) setExpandedId(firstEnabledId);
  };

  return (
    <Screen
      topBar={
        <TopBar
          title="Body"
          actions={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" className="h-11 w-11 px-0" aria-label="Body options" tour={{ id: "body.menu", label: "Menu", help: "Add an entry, compare photos or configure metrics.", order: 10 }}>
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={onAddMeasurement}>
                    <Plus className="h-4 w-4" aria-hidden /> Add measurement
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => replaceHash("#/body/compare")}>
                    <Camera className="h-4 w-4" aria-hidden /> Compare photos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setConfigOpen((v) => !v)}>
                    <Settings2 className="h-4 w-4" aria-hidden />
                    {configOpen ? "Hide metric setup" : "Configure metrics"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        <div className="grid h-12 w-full grid-cols-4" role="tablist" aria-label="Body tabs">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => switchTab(t)}
              {...tourAttrs(
                t === "track"
                  ? { id: "body.tabTrack", label: "Track tab", help: "Log new entries and photos for each metric.", order: 20 }
                  : t === "timeline"
                    ? { id: "body.tabTimeline", label: "Timeline tab", help: "Scrub your progress photos day by day.", order: 30 }
                    : t === "history"
                      ? { id: "body.tabHistory", label: "History tab", help: "Browse every past entry in one table.", order: 40 }
                      : { id: "body.tabGraph", label: "Graph tab", help: "Chart a metric's trend over time.", order: 50 },
              )}
              className={cn(
                "flex h-12 min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap text-sm font-semibold transition-colors",
                tab === t ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="leading-none">{TAB_LABELS[t]}</span>
              <span
                className={cn("h-0.5 w-8 rounded-full", tab === t ? "bg-primary" : "bg-transparent")}
                aria-hidden
              />
            </button>
          ))}
        </div>
      }
    >
      <ScrollBody>
        {configOpen ? (
          <MetricsSetup measurements={measurements} loading={isLoading} onDone={() => setConfigOpen(false)} />
        ) : null}

        {tab === "track" ? (
          <BodyTrackTab
            measurements={measurements}
            loading={isLoading}
            expandedId={expandedId}
            onExpandedChange={setExpandedId}
          />
        ) : tab === "timeline" ? (
          <BodyTimelineTab />
        ) : tab === "history" ? (
          <BodyHistoryTab measurements={measurements} loading={isLoading} />
        ) : (
          <BodyGraphTab measurements={measurements} />
        )}
      </ScrollBody>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MetricsSetup — the inline "Configure metrics" expansion (legacy
// measurement-config Dialog, re-imagined as an inline block): enable/disable
// toggles per row, reorder arrows, and a 96px inline creator for new metrics.
// ─────────────────────────────────────────────────────────────────────────────

function MetricsSetup({
  measurements,
  loading,
  onDone,
}: {
  measurements: MeasurementDTO[];
  loading: boolean;
  onDone: () => void;
}) {
  const act = useBodyAction();
  const inv = useInvalidate();

  const unitsQuery = useQuery({ queryKey: qk.units, queryFn: () => unitsApi.list() });
  const units = unitsQuery.data?.units ?? [];

  // ---- inline creator state ----
  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState<string>("");
  const [goalType, setGoalType] = useState<string>("NONE");
  const [targetValue, setTargetValue] = useState<string>("");
  const [creating, setCreating] = useState(false);

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

  const move = (m: MeasurementDTO, delta: -1 | 1) => {
    const idx = measurements.findIndex((x) => x.id === m.id);
    const to = idx + delta;
    if (idx < 0 || to < 0 || to >= measurements.length) return;
    const next = [...measurements];
    [next[idx], next[to]] = [next[to], next[idx]];
    void act({
      path: "/api/measurements/reorder",
      method: "POST",
      body: { ids: next.map((x) => x.id) },
      label: "Reorder metrics",
      run: () => measurementsApi.reorder(next.map((x) => x.id)),
      successMsg: "Order saved",
      onDone: () => inv.measurements(),
    });
  };

  const create = async () => {
    const trimmed = name.trim();
    const n = Number(targetValue);
    if (!trimmed || !unitId || creating) return;
    setCreating(true);
    const payload = {
      name: trimmed,
      unitId,
      goalType,
      targetValue: goalType !== "NONE" && targetValue.trim() !== "" && Number.isFinite(n) ? n : null,
      isEnabled: true,
    };
    const ok = await act({
      path: "/api/measurements",
      method: "POST",
      body: payload,
      label: `Create ${trimmed}`,
      run: () => measurementsApi.create(payload),
      successMsg: `${trimmed} created`,
      onDone: () => inv.measurements(),
    });
    setCreating(false);
    if (ok) {
      setName("");
      setTargetValue("");
    }
  };

  return (
    <div className="flex flex-none flex-col gap-1 rounded-lg border bg-muted/20 p-2">
      {/* header — 48px data-row with the Done action */}
      <div data-row className="flex h-12 items-center gap-2 overflow-hidden whitespace-nowrap">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">Configure metrics</span>
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-11 flex-none px-0"
          aria-label="Done configuring metrics"
          tour={{ id: "body.configDone", label: "Done", help: "Close the metric configuration drawer.", order: 120 }}
          onClick={onDone}
        >
          <X className="h-5 w-5" aria-hidden />
        </Button>
      </div>

      {loading && measurements.length === 0 ? (
        <Skeleton className="h-12 w-full rounded-lg" />
      ) : (
        measurements.map((m, i) => (
          <div key={m.id} data-row className="flex h-12 items-center gap-1 overflow-hidden whitespace-nowrap">
            <span className="min-w-0 flex-1 truncate text-sm">
              {m.name}
              <span className="ml-1 text-xs text-muted-foreground">{m.unit.name}</span>
              {m.targetValue != null ? (
                <span className="ml-1 text-xs text-muted-foreground">· {m.targetValue}</span>
              ) : null}
            </span>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-9 flex-none px-0"
              disabled={i === 0}
              aria-label={`Move ${m.name} up`}
              tour={{ skipTour: true, reason: "Metric reorder arrows inside the setup drawer" }}
              onClick={() => move(m, -1)}
            >
              <ChevronUp className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-9 flex-none px-0"
              disabled={i === measurements.length - 1}
              aria-label={`Move ${m.name} down`}
              tour={{ skipTour: true, reason: "Metric reorder arrows inside the setup drawer" }}
              onClick={() => move(m, 1)}
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </Button>
            <Switch
              checked={m.isEnabled}
              onCheckedChange={(v) => setEnabled(m, v)}
              aria-label={`${m.isEnabled ? "Disable" : "Enable"} ${m.name}`}
              {...tourAttrs({ id: "body.metricToggle", label: "Metric switch", help: "Enable or disable a tracked metric.", order: 130 })}
            />
          </div>
        ))
      )}

      {/* inline creator — 96px block (not a data-row) */}
      <div className="flex h-24 flex-none flex-col gap-1 rounded-lg border bg-card p-1.5">
        <div className="flex min-h-0 flex-1 gap-2">
          <Input
            className="h-full flex-1 rounded-lg"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New metric name"
            maxLength={60}
            aria-label="New metric name"
            {...tourAttrs({ id: "body.newMetric", label: "New metric", help: "Name a custom metric to track.", order: 140 })}
          />
          <Select value={unitId} onValueChange={setUnitId} {...tourAttrs({ skipTour: true, reason: "Unit select root renders no DOM node" })}>
            <SelectTrigger className="h-full w-[92px] flex-none rounded-lg text-sm" aria-label="Unit">
              <SelectValue placeholder={unitsQuery.isLoading ? "…" : "Unit"} />
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
        <div className="flex min-h-0 flex-1 gap-2">
          <Select value={goalType} onValueChange={setGoalType} {...tourAttrs({ skipTour: true, reason: "Goal-type select root renders no DOM node" })}>
            <SelectTrigger className="h-full min-w-0 flex-1 rounded-lg text-sm" aria-label="Goal type">
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
          {goalType !== "NONE" ? (
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              className="h-full w-[84px] flex-none rounded-lg tabular-nums"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="Target"
              aria-label="Target value"
              {...tourAttrs({ skipTour: true, reason: "Conditional goal-target input in the metric creator" })}
            />
          ) : null}
          <Button
            type="button"
            className="h-full flex-1 rounded-lg font-semibold"
            disabled={!name.trim() || !unitId || creating}
            tour={{ id: "body.addMetric", label: "Add metric", help: "Create the named metric with its unit and goal.", order: 150 }}
            onClick={() => void create()}
          >
            {creating ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}
