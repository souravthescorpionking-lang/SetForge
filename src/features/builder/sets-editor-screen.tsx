"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SetsEditorScreen — #/builder/{program|session}/{id}/exercise/{reId}
// (Part 8 §3.8 sets editor — the predefined-editor evolved with §6.2/§6.3/§6.4).
//
//   TopBar (56)  : BackButton → the editor · `{Exercise} · sets` · [Done]
//   ScrollBody   : header row 32 (`#  kg  reps  rest`) · set rows 48
//                  (W/index · weight prescription cell [§6.4 segmented
//                  popover Fixed | Copy last | % 1RM] · reps input · rest
//                  popover · … menu [Copy last · Apply to all · warm-up
//                  toggle · Remove]) · 40px `+ set | Apply to all ▾`
//                  · Warm-up row 56 › (§6.2 scheme chips + switch)
//                  · Progression row 56 › (§6.3 type/increment/unit/
//                  condition/deload)
//
// Every edit persists IMMEDIATELY (routinesApi sets PATCH / exerciseMetaApi
// PUT) — Done confirms + returns to the editor, like the routines screens.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Check,
  ChevronDown,
  Copy,
  Flame,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { exerciseMetaApi, routinesApi, type ExerciseMetaProgression, type PredefinedSetInput } from "@/lib/client/api";
import { qk, useOnline } from "@/lib/client/query";
import { fieldsForType, formatRestSec, type SetField } from "@/lib/constants";
import { trimNum, parseFieldValue, parseDurationInput } from "@/components/group-card/group-types";
import type { WeightKind } from "@/lib/grouping";
import type { PredefinedSetDTO, RoutineDayDTO } from "@/lib/types";
import type { TourAttrs } from "@/lib/tour/attrs";
import {
  errorMessage,
  useLastSetsPrefill,
  useRoutineRun,
} from "@/features/routines/screen-helpers";
import { kindSegment } from "./editor-shared";
import { exerciseUnit } from "@/features/exercises/labels";

const REST_PRESETS = [30, 60, 90, 120, 150, 180];

const DEFAULT_PROGRESSION: ExerciseMetaProgression = {
  type: "LINEAR",
  increment: 2.5,
  unit: "kg",
  condition: "ALL_SETS_HIT",
  failStreakForDeload: 3,
  deloadPct: 10,
};

const WARMUP_SCHEME_META: Array<{
  value: "NONE" | "STANDARD" | "LIGHT";
  label: string;
  detail: string;
}> = [
  { value: "NONE", label: "Off", detail: "No generated warm-up sets" },
  { value: "STANDARD", label: "Standard", detail: "40/60/80% × 5/3/2" },
  { value: "LIGHT", label: "Light", detail: "50/70% × 5/3" },
];

// ---------- small pieces ----------

/** 48px set row grid: # 32 · f1 minmax(72,1fr) · f2 minmax(56,1fr) · rest 56 · … 32 */
function gridTemplate(fields: SetField[], restVisible: boolean): string {
  const parts: string[] = ["32px"];
  if (fields[0]) parts.push("minmax(72px,1fr)");
  if (fields[1]) parts.push("minmax(56px,1fr)");
  if (restVisible) parts.push("56px");
  parts.push("32px");
  return parts.join(" ");
}

function fieldLabel(field: SetField, unit: string | null): string {
  switch (field) {
    case "weight":
      return unit ?? "kg";
    case "reps":
      return "reps";
    case "distance":
      return "dist";
    case "timeSec":
      return "time";
  }
}

function NumberInput({
  value,
  onCommit,
  ariaLabel,
  className,
}: {
  value: number | null;
  onCommit: (next: number | null) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? (value == null ? "" : trimNum(value));
  const commit = () => {
    if (draft != null) {
      const parsed = parseFieldValue("reps", draft);
      if (parsed !== undefined && parsed !== value) onCommit(parsed);
    }
    setDraft(null);
  };
  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      {...tourAttrs({ skipTour: true, reason: "Covered by the setsEditor row cell anchors" })}
      value={display}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "h-10 min-w-0 w-full rounded-md border-0 bg-transparent px-1 text-right text-sm tabular-nums text-foreground outline-none focus:bg-muted/40",
        className,
      )}
    />
  );
}

// ---------- §6.4 weight prescription cell ----------

function WeightKindCell({
  set,
  onApply,
}: {
  set: PredefinedSetDTO;
  onApply: (input: PredefinedSetInput) => void;
}) {
  const kind: WeightKind = (set.weightKind ?? (set.weight != null ? "FIXED" : "COPY_LAST")) as WeightKind;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WeightKind>(kind);
  const [value, setValue] = useState("");

  const reseed = () => {
    setMode(kind);
    setValue(
      kind === "PERCENT_1RM"
        ? set.pct != null
          ? trimNum(set.pct)
          : ""
        : set.weight != null
          ? trimNum(set.weight)
          : "",
    );
  };

  const text =
    kind === "PERCENT_1RM"
      ? set.pct != null
        ? `${trimNum(set.pct)}%`
        : "↺ %"
      : kind === "COPY_LAST"
        ? "↺"
        : set.weight != null
          ? trimNum(set.weight)
          : "–";

  const apply = () => {
    if (mode === "COPY_LAST") {
      onApply({ weightKind: "COPY_LAST", weight: null, pct: null });
    } else if (mode === "PERCENT_1RM") {
      const pct = parseFieldValue("reps", value);
      if (pct == null || pct <= 0 || pct > 100) {
        toast.info("Enter a % of your 1RM between 1 and 100");
        return;
      }
      onApply({ weightKind: "PERCENT_1RM", pct, weight: null });
    } else {
      const weight = parseFieldValue("reps", value);
      onApply({ weightKind: "FIXED", weight: weight ?? null, pct: null });
    }
    setOpen(false);
  };

  const seg = (m: WeightKind, label: string) => (
    <Button
      key={m}
      type="button"
      variant={mode === m ? "default" : "outline"}
      size="sm"
      tour={{ skipTour: true, reason: "Weight-kind segment inside the prescription popover" }}
      className="h-8 min-w-0 flex-1 rounded-lg px-1 text-xs font-bold"
      onClick={() => setMode(m)}
    >
      <span className="truncate">{label}</span>
    </Button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) reseed();
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          {...tourAttrs({ id: "setsEditor.weightKind", label: "Weight", help: "Fixed weight, copy last workout, or a % of your 1RM.", order: 40 })}
          aria-label={`Weight prescription for set ${set.sortOrder + 1}: ${kind}. Tap to change`}
          className="flex h-10 w-full items-center justify-center rounded-md px-1 text-sm font-semibold tabular-nums transition-colors hover:bg-accent"
        >
          {text}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-60 p-3">
        <p className="pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Weight
        </p>
        <div className="flex items-center gap-1">
          {seg("FIXED", "Fixed")}
          {seg("COPY_LAST", "Copy last")}
          {seg("PERCENT_1RM", "% 1RM")}
        </div>
        {mode === "FIXED" ? (
          <div className="mt-3 flex items-center gap-1">
            <Input
              autoFocus
              inputMode="decimal"
              value={value}
              aria-label="Fixed weight in kg"
              {...tourAttrs({ skipTour: true, reason: "Fixed-weight input inside the prescription popover" })}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              placeholder="kg"
              className="h-8 min-w-0 flex-1"
            />
            <Button type="button" size="sm" tour={{ skipTour: true, reason: "Apply inside the prescription popover" }} className="h-8 rounded-lg" onClick={apply}>
              Set
            </Button>
          </div>
        ) : mode === "COPY_LAST" ? (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            ↺ No stored weight — the set copies your last workout when the day starts.
          </p>
        ) : (
          <div className="mt-3 flex items-center gap-1">
            <Input
              autoFocus
              inputMode="decimal"
              value={value}
              aria-label="Percent of one-rep max"
              {...tourAttrs({ skipTour: true, reason: "Percent input inside the prescription popover" })}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              placeholder="% of 1RM"
              className="h-8 min-w-0 flex-1"
            />
            <Button type="button" size="sm" tour={{ skipTour: true, reason: "Apply inside the prescription popover" }} className="h-8 rounded-lg" onClick={apply}>
              Set
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------- rest cell (presets popover) ----------

function RestCell({ set, onCommit }: { set: PredefinedSetDTO; onCommit: (sec: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const planned = set.restPlannedSec ?? null;
  const applyCustom = () => {
    const sec = parseDurationInput(custom);
    if (sec == null) {
      toast.info("Enter rest as seconds or m:ss");
      return;
    }
    onCommit(sec);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          {...tourAttrs({ id: "setsEditor.rest", label: "Rest", help: "Planned rest after this set; tap to edit.", order: 50 })}
          aria-label={planned ? `Planned rest ${formatRestSec(planned)}, tap to change` : "Rest not set, tap to edit"}
          className="flex h-10 w-full items-center justify-center rounded-md px-1 text-xs font-semibold tabular-nums transition-colors hover:bg-accent"
        >
          {planned ? formatRestSec(planned) : <span className="text-muted-foreground/50">–</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-52 p-3">
        <p className="pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Rest</p>
        <div className="grid grid-cols-3 gap-1">
          {REST_PRESETS.map((sec) => (
            <Button
              key={sec}
              type="button"
              variant={planned === sec ? "default" : "outline"}
              size="sm"
              tour={{ skipTour: true, reason: "Rest presets inside the rest popover" }}
              className="h-8 rounded-lg px-0 text-xs font-bold tabular-nums"
              onClick={() => {
                onCommit(sec);
                setOpen(false);
              }}
            >
              {formatRestSec(sec)}
            </Button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1">
          <Input
            value={custom}
            aria-label="Custom rest duration"
            {...tourAttrs({ skipTour: true, reason: "Custom rest field inside the rest popover" })}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            placeholder="m:ss"
            className="h-8 min-w-0 flex-1"
          />
          <Button type="button" variant="outline" size="sm" tour={{ skipTour: true, reason: "Apply inside the rest popover" }} className="h-8 rounded-lg text-xs font-bold" onClick={applyCustom}>
            Set
          </Button>
        </div>
        {planned != null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            tour={{ skipTour: true, reason: "Clear control inside the rest popover" }}
            className="mt-2 w-full text-xs text-muted-foreground"
            onClick={() => {
              onCommit(null);
              setOpen(false);
            }}
          >
            Clear rest
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

// ---------- one 48px set row ----------

function SetEditorRow({
  set,
  index,
  fields,
  unit,
  restVisible,
  onPatch,
  onCopyLast,
  onApplyAll,
  onRemove,
  onToggleWarmup,
}: {
  set: PredefinedSetDTO;
  index: number;
  fields: SetField[];
  unit: string | null;
  restVisible: boolean;
  onPatch: (input: PredefinedSetInput) => void;
  onCopyLast: () => void;
  onApplyAll: () => void;
  onRemove: () => void;
  onToggleWarmup: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isWarmup = (set.setType ?? "NORMAL") === "WARMUP";

  const cells: Record<string, ReactNode> = {
    index: isWarmup ? (
      <span
        className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/15 text-[11px] font-bold text-amber-600 dark:text-amber-400"
        title="Warm-up set"
      >
        W
      </span>
    ) : (
      <span className="w-full truncate text-center text-xs tabular-nums text-muted-foreground">{index}</span>
    ),
    f1:
      fields[0] === "weight" ? (
        <WeightKindCell set={set} onApply={onPatch} />
      ) : fields[0] ? (
        <NumberInput
          value={fields[0] === "reps" ? set.reps : fields[0] === "distance" ? set.distance : set.timeSec}
          ariaLabel={`${fieldLabel(fields[0], unit)} for set ${index}`}
          onCommit={(v) => onPatch(fields[0] === "reps" ? { reps: v } : fields[0] === "distance" ? { distance: v } : { timeSec: v })}
        />
      ) : null,
    f2: fields[1] ? (
      <NumberInput
        value={fields[1] === "reps" ? set.reps : fields[1] === "distance" ? set.distance : set.timeSec}
        ariaLabel={`${fieldLabel(fields[1], unit)} for set ${index}`}
        onCommit={(v) => onPatch(fields[1] === "reps" ? { reps: v } : fields[1] === "distance" ? { distance: v } : { timeSec: v })}
      />
    ) : null,
    rest: <RestCell set={set} onCommit={(sec) => onPatch({ restPlannedSec: sec })} />,
    more: (
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            {...tourAttrs({ id: "setsEditor.more", label: "More", help: "Copy last, apply to all, warm-up toggle or remove.", order: 60 })}
            aria-label={`More options for set ${index}`}
            className="flex h-10 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-2">
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              tour={{ skipTour: true, reason: "Copy-last inside the row menu" }}
              className="h-9 w-full justify-start gap-2 rounded-lg text-sm"
              onClick={() => {
                onCopyLast();
                setMenuOpen(false);
              }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> Copy last workout
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              tour={{ id: "setsEditor.applyAll", label: "Apply to all", help: "Copy this set's weight, reps and rest onto every set.", order: 70 }}
              className="h-9 w-full justify-start gap-2 rounded-lg text-sm"
              onClick={() => {
                onApplyAll();
                setMenuOpen(false);
              }}
            >
              <Copy className="h-4 w-4" aria-hidden /> Apply to all sets
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              tour={{ skipTour: true, reason: "Warm-up toggle inside the row menu" }}
              className="h-9 w-full justify-start gap-2 rounded-lg text-sm"
              onClick={() => {
                onToggleWarmup();
                setMenuOpen(false);
              }}
            >
              <Flame className="h-4 w-4" aria-hidden /> {isWarmup ? "Make working set" : "Make warm-up set"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              tour={{ skipTour: true, reason: "Remove-set inside the row menu" }}
              className="h-9 w-full justify-start gap-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                onRemove();
                setMenuOpen(false);
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Remove set
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    ),
  };

  const keys: string[] = ["index"];
  if (fields[0]) keys.push("f1");
  if (fields[1]) keys.push("f2");
  if (restVisible) keys.push("rest");
  keys.push("more");

  return (
    <div
      data-row
      role="group"
      aria-label={`Set ${index}${isWarmup ? " warm-up" : ""}`}
      className="grid h-12 items-center overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card"
      style={{ gridTemplateColumns: gridTemplate(fields, restVisible) }}
    >
      {keys.map((key) => (
        <div key={key} className={cn("flex h-full min-w-0 items-center overflow-hidden", key !== "f1" && key !== "f2" && "justify-center")}>
          {cells[key]}
        </div>
      ))}
    </div>
  );
}

// ---------- accordion section row (56px) ----------
// tour declarations arrive PRE-COMPUTED from the call sites
// (`{...tourAttrs({ literal })}` — static + codegen-readable) and are spread
// onto the row here.

function SectionRow({
  icon,
  title,
  summary,
  open,
  onToggle,
  declAttrs,
}: {
  icon: ReactNode;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  declAttrs?: TourAttrs;
}) {
  return (
    <button
      type="button"
      data-row
      aria-expanded={open}
      {...(declAttrs ?? {})}
      onClick={onToggle}
      className="flex h-14 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{title}</span>
      <span className="min-w-0 flex-none truncate text-xs text-muted-foreground">{summary}</span>
      <ChevronDown className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", !open && "-rotate-90")} aria-hidden />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function SetsEditorScreen({ routineId, reId }: { routineId: string; reId: string }) {
  return <SetsEditorInner key={`${routineId}:${reId}`} routineId={routineId} reId={reId} />;
}

function SetsEditorInner({ routineId, reId }: { routineId: string; reId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const online = useOnline();
  const { run } = useRoutineRun();
  const prefillFor = useLastSetsPrefill();
  const qc = useQueryClient();

  // ---------- data (reId is unique across the routine — find its day) ----------
  const { data: routine, isLoading } = useQuery({
    queryKey: qk.routine(routineId),
    queryFn: () => routinesApi.get(routineId),
    retry: 1,
  });

  const located = useMemo(() => {
    if (!routine) return null;
    for (const day of routine.days) {
      const re = day.exercises.find((e) => e.id === reId);
      if (re) return { day, re };
    }
    return null;
  }, [routine, reId]);

  const metaKey = ["exercise-meta", routineId, reId] as const;
  const metaQuery = useQuery({
    queryKey: metaKey,
    queryFn: () => exerciseMetaApi.get(routineId, reId),
    enabled: !!located,
  });

  const day = located?.day ?? null;
  const re = located?.re ?? null;
  const kindSeg = routine ? kindSegment(routine) : "program";
  const backHref = `/builder/${kindSeg}/${routineId}`;

  const fields = useMemo(
    () => (re ? (fieldsForType(re.exercise.type) as SetField[]) : []),
    [re],
  );
  const unit = useMemo(() => (re ? exerciseUnit(re.exercise, settings) : "kg"), [re, settings]);
  const restVisible = settings?.showRest ?? true;

  const sortedSets = useMemo(
    () => (re ? [...re.sets].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [re],
  );

  // ---------- ui state ----------
  const [warmupOpen, setWarmupOpen] = useState(false);
  const [progressionOpen, setProgressionOpen] = useState(false);

  // ---------- set mutations (immediate persist) ----------
  const patchSet = async (setId: string, input: PredefinedSetInput) => {
    if (!day || !re) return;
    await run(() => routinesApi.updateSet(routineId, day.id, reId, setId, input), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${reId}/sets/${setId}`,
      method: "PATCH",
      body: input,
      label: "Set updated",
    });
  };

  const addSet = async () => {
    if (!day || !re) return;
    await run(() => routinesApi.addSet(routineId, day.id, reId, {}), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${reId}/sets`,
      method: "POST",
      body: {},
      label: "Set added",
    });
  };

  const removeSet = async (setId: string) => {
    if (!day || !re) return;
    await run(() => routinesApi.removeSet(routineId, day.id, reId, setId), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${reId}/sets/${setId}`,
      method: "DELETE",
      label: "Set removed",
    });
  };

  const copyLastToSet = async (setId: string, index0: number) => {
    if (!day || !re) return;
    const src = await prefillFor(re.exerciseId, index0);
    if (!src) {
      toast.info("No previous workout to copy from");
      return;
    }
    await run(
      () =>
        routinesApi.updateSet(routineId, day.id, reId, setId, {
          weight: src.weight,
          reps: src.reps,
          distance: src.distance,
          timeSec: src.timeSec,
          weightKind: src.weight != null ? "FIXED" : null,
        }),
      {
        path: `/api/routines/${routineId}/days/${day.id}/exercises/${reId}/sets/${setId}`,
        method: "PATCH",
        body: { weight: src.weight, reps: src.reps, distance: src.distance, timeSec: src.timeSec },
        label: "Copied from last workout",
      },
    );
    toast.success("Copied from last workout");
  };

  const toggleWarmupSet = (set: PredefinedSetDTO) => {
    void patchSet(set.id, {
      setType: (set.setType ?? "NORMAL") === "WARMUP" ? "NORMAL" : "WARMUP",
    });
  };

  /** Apply ONE set's everything onto every other set. */
  const applySetToAll = (source: PredefinedSetDTO) => {
    for (const s of sortedSets) {
      if (s.id === source.id) continue;
      void patchSet(s.id, {
        weight: source.weight,
        weightKind: source.weightKind ?? null,
        pct: source.pct ?? null,
        reps: source.reps,
        distance: source.distance,
        timeSec: source.timeSec,
        restPlannedSec: source.restPlannedSec,
      });
    }
    toast.success(`Applied set ${source.sortOrder + 1} to all ${sortedSets.length} sets`);
  };

  /** Apply the FIRST set's chosen fields onto every other set (bottom ▾). */
  const applyFirstFields = (which: "weight" | "reps" | "rest" | "everything") => {
    const first = sortedSets[0];
    if (!first || sortedSets.length < 2) {
      toast.info("Add at least two sets first");
      return;
    }
    for (const s of sortedSets.slice(1)) {
      const input: PredefinedSetInput = {};
      if (which === "weight" || which === "everything") {
        input.weight = first.weight;
        input.weightKind = first.weightKind ?? null;
        input.pct = first.pct ?? null;
      }
      if (which === "reps" || which === "everything") {
        input.reps = first.reps;
        input.distance = first.distance;
        input.timeSec = first.timeSec;
      }
      if (which === "rest" || which === "everything") {
        input.restPlannedSec = first.restPlannedSec;
      }
      void patchSet(s.id, input);
    }
    toast.success(`Applied ${which} from set 1 to the other sets`);
  };

  // ---------- exercise meta (warm-up + progression) ----------
  const warmupScheme = metaQuery.data?.warmupScheme ?? "NONE";
  const progressionMeta = metaQuery.data?.progression ?? null;

  const [prog, setProg] = useState<ExerciseMetaProgression | null>(null);
  useEffect(() => {
    setProg(progressionMeta);
  }, [progressionMeta]);

  const putMeta = async (body: Parameters<typeof exerciseMetaApi.put>[2]) => {
    if (!located) return;
    if (!online) {
      toast.info("Saving needs a connection");
      return;
    }
    try {
      await exerciseMetaApi.put(routineId, reId, body);
      await qc.invalidateQueries({ queryKey: metaKey });
      qc.invalidateQueries({ queryKey: qk.routine(routineId) });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const putWarmupScheme = (scheme: "NONE" | "STANDARD" | "LIGHT") => {
    void putMeta({ warmupScheme: scheme });
    toast.success(scheme === "NONE" ? "Warm-up off" : `Warm-up · ${scheme === "STANDARD" ? "Standard" : "Light"}`);
  };

  const putProgression = (next: ExerciseMetaProgression) => {
    setProg(next);
    void putMeta({ progression: next });
  };

  const setProgField = (patch: Partial<ExerciseMetaProgression>) => {
    const base = prog ?? DEFAULT_PROGRESSION;
    putProgression({ ...base, ...patch });
  };

  const progSummary = !prog || prog.type === "NONE" ? "Off" : `${prog.type === "DOUBLE" ? "Double" : "Linear"} · +${trimNum(prog.increment)} ${prog.unit}`;
  const warmupSummary = warmupScheme === "NONE" ? "Off" : warmupScheme === "STANDARD" ? "Standard" : "Light";

  const done = () => {
    toast.success("Saved");
    navigate(backHref);
  };

  // ---------- render ----------
  const headerKeys: string[] = ["index"];
  if (fields[0]) headerKeys.push("f1");
  if (fields[1]) headerKeys.push("f2");
  if (restVisible) headerKeys.push("rest");
  headerKeys.push("more");

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash={`#${backHref}`} label={`Back to ${routine?.name ?? "editor"}`} />}
          title={
            <span className="flex min-w-0 items-center gap-1">
              <span className="min-w-0 truncate">{re ? re.exercise.name : "Sets"}</span>
              <span className="flex-none text-xs font-medium text-muted-foreground">· sets</span>
            </span>
          }
          actions={
            <>
              <Button
                type="button"
                className="h-11 flex-none gap-1.5 px-4 text-sm font-bold"
                disabled={!located}
                tour={{ id: "setsEditor.done", label: "Done", help: "Finish and return to the editor; edits already persist.", order: 10 }}
                onClick={done}
              >
                <Check className="h-4 w-4" aria-hidden />
                Done
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
    >
      <ScrollBody>
        {isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading exercise">
            <div className="h-8 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : !located || !re || !day ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Exercise not found in this program</p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Error-state back link for a missing exercise" }}
              onClick={() => navigate(backHref)}
            >
              Back to editor
            </Button>
          </div>
        ) : (
          <>
            {/* ---------- header row 32px (# · f1 · f2 · rest) ---------- */}
            <div
              data-row
              role="group"
              aria-label="Set columns"
              className="grid h-8 items-center overflow-hidden whitespace-nowrap px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
              style={{ gridTemplateColumns: gridTemplate(fields, restVisible) }}
            >
              {headerKeys.map((key) => (
                <div key={key} className={cn("flex h-full min-w-0 items-center justify-center overflow-hidden", (key === "f1" || key === "f2") && "justify-end pr-2")}>
                  {key === "index" ? "#" : key === "f1" ? fieldLabel(fields[0], unit) : key === "f2" ? fieldLabel(fields[1], unit) : key === "rest" ? "rest" : ""}
                </div>
              ))}
            </div>

            {/* ---------- set rows 48px ---------- */}
            <div className="flex flex-col gap-2">
              {sortedSets.map((s, i) => (
                <SetEditorRow
                  key={s.id}
                  set={s}
                  index={i + 1}
                  fields={fields}
                  unit={unit}
                  restVisible={restVisible}
                  onPatch={(input) => void patchSet(s.id, input)}
                  onCopyLast={() => void copyLastToSet(s.id, i)}
                  onApplyAll={() => applySetToAll(s)}
                  onRemove={() => void removeSet(s.id)}
                  onToggleWarmup={() => toggleWarmupSet(s)}
                />
              ))}
              {sortedSets.length === 0 ? (
                <p className="flex-none rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                  No sets yet — add the first one below.
                </p>
              ) : null}
            </div>

            {/* ---------- + set | Apply to all ▾ (40px) ---------- */}
            <div data-row className="flex h-10 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap">
              <button
                type="button"
                {...tourAttrs({ id: "setsEditor.addSet", label: "Add set", help: "Append another set to this exercise.", order: 80 })}
                aria-label="Add a set"
                onClick={() => void addSet()}
                className="flex h-10 min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
              >
                <Plus className="h-4 w-4 flex-none" aria-hidden />
                <span className="truncate">set</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    {...tourAttrs({ id: "setsEditor.applyToAll", label: "Apply to all", help: "Fan set 1's weight, reps or rest out to every set.", order: 90 })}
                    aria-label="Apply to all sets"
                    className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
                  >
                    <Copy className="h-4 w-4 flex-none" aria-hidden />
                    <span className="truncate">Apply to all</span>
                    <ChevronDown className="h-3.5 w-3.5 flex-none" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => applyFirstFields("weight")}>
                    <Copy className="h-4 w-4" aria-hidden /> Weight
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => applyFirstFields("reps")}>
                    <Copy className="h-4 w-4" aria-hidden /> Reps
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => applyFirstFields("rest")}>
                    <Copy className="h-4 w-4" aria-hidden /> Rest
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => applyFirstFields("everything")}>
                    <Copy className="h-4 w-4" aria-hidden /> Everything
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* ---------- Warm-up row 56 › (§6.2) ---------- */}
            <SectionRow
              icon={<Flame className="h-5 w-5 flex-none text-amber-500" aria-hidden />}
              title="Warm-up"
              summary={warmupSummary}
              open={warmupOpen}
              onToggle={() => setWarmupOpen((o) => !o)}
              declAttrs={{
                ...tourAttrs({ id: "setsEditor.warmupRow", label: "Warm-up", help: "Pick a generated warm-up ramp before the working sets.", order: 100 }),
              }}
            />
            {warmupOpen ? (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-1">
                  {WARMUP_SCHEME_META.map((s) => (
                    <Button
                      key={s.value}
                      type="button"
                      variant={warmupScheme === s.value ? "default" : "outline"}
                      size="sm"
                      tour={{ id: "setsEditor.warmupScheme", label: "Warm-up scheme", help: "Standard 40/60/80% × 5/3/2 · Light 50/70% × 5/3.", order: 110 }}
                      className="h-9 flex-none rounded-lg px-3 text-xs font-bold"
                      onClick={() => putWarmupScheme(s.value)}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {WARMUP_SCHEME_META.find((s) => s.value === warmupScheme)?.detail ?? ""} — warm-up rows are
                  generated when the day starts and never count toward PRs or volume.
                </p>
                <label className="flex h-10 flex-none cursor-pointer items-center gap-2 text-sm font-medium">
                  <Switch
                    checked={warmupScheme !== "NONE"}
                    {...tourAttrs({ id: "setsEditor.warmupGenerate", label: "Generate warm-up", help: "Auto-build the ramp from the first working weight.", order: 120 })}
                    onCheckedChange={(on) =>
                      putWarmupScheme(
                        on ? (warmupScheme === "LIGHT" ? "LIGHT" : "STANDARD") : "NONE",
                      )
                    }
                    aria-label="Generate warm-up from first working weight"
                  />
                  Generate from first working weight
                </label>
              </div>
            ) : null}

            {/* ---------- Progression row 56 › (§6.3) ---------- */}
            <SectionRow
              icon={<TrendingUp className="h-5 w-5 flex-none text-primary" aria-hidden />}
              title="Progression"
              summary={progSummary}
              open={progressionOpen}
              onToggle={() => setProgressionOpen((o) => !o)}
              declAttrs={{
                ...tourAttrs({ id: "setsEditor.progressionRow", label: "Progression", help: "Set the rule that advances this exercise's weight each session.", order: 130 }),
              }}
            />
            {progressionOpen ? (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
                {/* type */}
                <div className="flex items-center gap-1">
                  {(["NONE", "LINEAR", "DOUBLE"] as const).map((t) => {
                    const active = (prog?.type ?? "NONE") === t;
                    return (
                      <Button
                        key={t}
                        type="button"
                        variant={active ? "default" : "outline"}
                        size="sm"
                        tour={{ id: "setsEditor.progType", label: "Progression type", help: "Linear adds each hit; Double doubles after two.", order: 140 }}
                        className="h-9 min-w-0 flex-1 rounded-lg px-1 text-xs font-bold"
                        onClick={() => {
                          if (t === "NONE") setProgField({ type: "NONE" });
                          else if (!prog || prog.type === "NONE") {
                            setProgField({ type: t });
                            if (!prog) toast.success("Progression rule saved");
                          } else {
                            setProgField({ type: t });
                          }
                        }}
                      >
                        {t === "NONE" ? "None" : t === "LINEAR" ? "Linear" : "Double"}
                      </Button>
                    );
                  })}
                </div>

                {(prog?.type ?? "NONE") !== "NONE" && prog ? (
                  <>
                    {/* increment + unit */}
                    <div className="flex items-center gap-2">
                      <span className="w-20 flex-none text-xs font-semibold text-muted-foreground">Increment</span>
                      <Input
                        inputMode="decimal"
                        value={trimNum(prog.increment)}
                        aria-label="Progression increment"
                        {...tourAttrs({ id: "setsEditor.progIncrement", label: "Increment", help: "How much weight to add after a successful session.", order: 150 })}
                        onChange={(e) => {
                          const v = parseFieldValue("reps", e.target.value);
                          if (v != null) setProgField({ increment: v });
                        }}
                        className="h-10 min-w-0 flex-1"
                      />
                      <div className="flex items-center gap-1">
                        {(["kg", "lbs", "%"] as const).map((u) => (
                          <Button
                            key={u}
                            type="button"
                            variant={prog.unit === u ? "default" : "outline"}
                            size="sm"
                            tour={{ id: "setsEditor.progUnit", label: "Increment unit", help: "Kg, lbs or a percent of the current weight.", order: 160 }}
                            className="h-10 w-11 rounded-lg px-0 text-xs font-bold"
                            onClick={() => setProgField({ unit: u })}
                          >
                            {u}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* condition */}
                    <div className="flex items-center gap-2">
                      <span className="w-20 flex-none text-xs font-semibold text-muted-foreground">Advance when</span>
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        <Button
                          type="button"
                          variant={prog.condition === "ALL_SETS_HIT" ? "default" : "outline"}
                          size="sm"
                          tour={{ id: "setsEditor.progCondition", label: "Hit condition", help: "All sets hit their reps, or just the last one.", order: 170 }}
                          className="h-10 min-w-0 flex-1 rounded-lg px-1 text-xs font-bold"
                          onClick={() => setProgField({ condition: "ALL_SETS_HIT" })}
                        >
                          <span className="truncate">All sets hit</span>
                        </Button>
                        <Button
                          type="button"
                          variant={prog.condition === "LAST_SET_HIT" ? "default" : "outline"}
                          size="sm"
                          tour={{ skipTour: true, reason: "The second hit-condition chip of the pair" }}
                          className="h-10 min-w-0 flex-1 rounded-lg px-1 text-xs font-bold"
                          onClick={() => setProgField({ condition: "LAST_SET_HIT" })}
                        >
                          <span className="truncate">Last set hit</span>
                        </Button>
                      </div>
                    </div>

                    {/* deload */}
                    <div className="flex items-center gap-2">
                      <span className="w-20 flex-none text-xs font-semibold text-muted-foreground">Deload</span>
                      <NumberInput
                        value={prog.failStreakForDeload}
                        ariaLabel="Fails before deload"
                        onCommit={(v) => setProgField({ failStreakForDeload: Math.max(1, Math.min(10, Math.round(v ?? 3))) })}
                      />
                      <span className="flex-none text-xs text-muted-foreground">fails →</span>
                      <NumberInput
                        value={prog.deloadPct}
                        ariaLabel="Deload percent"
                        onCommit={(v) => setProgField({ deloadPct: Math.max(1, Math.min(50, Math.round(v ?? 10))) })}
                      />
                      <span className="flex-none text-xs text-muted-foreground">% lighter</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        tour={{ id: "setsEditor.progSave", label: "Save rule", help: "Persist this progression rule for this exercise.", order: 180 }}
                        className="ml-auto h-10 flex-none rounded-lg text-xs font-bold"
                        onClick={() => {
                          void putMeta({ progression: prog });
                          toast.success("Progression rule saved");
                        }}
                      >
                        Save rule
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Turn progression on to advance the weight automatically when sessions hit their targets, with a
                    deload after repeated misses.
                  </p>
                )}
              </div>
            ) : null}

            <div className="h-2 flex-none" aria-hidden />
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}
