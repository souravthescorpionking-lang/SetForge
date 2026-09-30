"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProgramEditorScreen — #/builder/program/{id} (Part 8 §3.8 · Part 9 §12).
//
//   TopBar (56)  : BackButton → #/builder · program name · [Done] (validates
//                  the name → back to #/programs/{id}; every edit below
//                  already persisted immediately) · TopBarHelp
//   SubBar (48)  : variant tabs — Beginner | Intermediate | Advanced (border-
//                  frame segmented). A tab whose ProgramVariant doesn't exist
//                  yet is dimmed; selecting it CREATES the variant on demand
//                  (PUT /api/programs/{id}/variants/{difficulty}).
//   ScrollBody   : Name row 48 (inline input)
//                  Level row 48 (segmented Beg/Int/Adv — legacy routine level)
//                  Program details section (tagline input · weeks stepper ·
//                  description textarea → program meta)
//                  Per phase: header 48 "Phase {n} · {name}" + ⋮ [Remove
//                  phase…] · day accordion rows 56 (▾ · Day {n} {name} · ⋮
//                  [Rename · Workout/Rest · Move to phase… · Delete] · ≡ drag
//                  handle — dnd-kit sortable days, cross-phase drops move the
//                  day into the neighbour's phase) · "+ Workout | + Rest" 40.
//                  Unassigned days section (no phase yet) · "+ Phase" row 40.
//                  Expanded day body = day fields (minutes stepper · muscles
//                  chips · equipment chips — auto-derived from the exercises
//                  until manually edited, "↺ Auto" resets) + EditorDayBody
//                  (GroupCards in edit mode + "+ Exercise | + Group").
//   BottomBar(56): Publish (ghost) / Published (solid) — isPublic toggle.
//
// SESSION-kind routines (defensive direct-URL path) render the legacy flat
// day list — no variants, phases or publish.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Screen, TopBar, ScrollBody, SubBar, BottomBar, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Check, ChevronDown, GripVertical, Loader2, Minus, Moon, MoreVertical, Pencil, Plus, RotateCcw, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { builderVariantsApi, programsMetaApi, routinesApi, type BuilderVariantPhaseDTO } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MUSCLES,
  MUSCLE_LABELS,
  type Difficulty,
  type Equipment,
  type Muscle,
} from "@/lib/constants";
import type { RoutineDayDTO } from "@/lib/types";
import { errorMessage, nextDayName, useRoutineRun } from "@/features/routines/screen-helpers";
import {
  DaySection,
  EditorDayBody,
  InlineInput,
  kindSegment,
  useEditorSensors,
} from "./editor-shared";

/** Short segmented labels (spec ASCII: `Level Beg · (Int) · Adv`). */
const LEVEL_SHORT: Record<Difficulty, string> = {
  BEGINNER: "Beg",
  INTERMEDIATE: "Int",
  ADVANCED: "Adv",
};

/** Rest days get a unique-ish name ("Rest", "Rest 2", …). */
function restDayName(days: RoutineDayDTO[]): string {
  const n = days.filter((d) => (d.dayType ?? "WORKOUT") === "REST").length;
  return n === 0 ? "Rest" : `Rest ${n + 1}`;
}

/** Union of a day's exercise catalog tags (muscles / equipment). */
function unionOf(day: RoutineDayDTO, pick: (ex: RoutineDayDTO["exercises"][number]) => string[] | undefined): string[] {
  const out: string[] = [];
  for (const re of day.exercises) {
    for (const v of pick(re) ?? []) {
      if (!out.includes(v)) out.push(v);
    }
  }
  return out;
}

export default function ProgramEditorScreen({ routineId }: { routineId: string }) {
  return <ProgramEditorInner key={routineId} routineId={routineId} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Day fields card — minutes stepper + editable muscle/equipment chips (§12).
// Auto state: chips show the derived union until the user edits one (manual
// flag), "↺ Auto" clears the flag and re-derives.
// ─────────────────────────────────────────────────────────────────────────────

function DayFieldsEditor({
  routineId,
  day,
  manual,
  onManualChange,
}: {
  routineId: string;
  day: RoutineDayDTO;
  manual: boolean;
  onManualChange: (dayId: string, manual: boolean) => void;
}) {
  const { run } = useRoutineRun();

  const derivedMuscles = useMemo(() => unionOf(day, (re) => re.exercise.primaryMuscles), [day]);
  const derivedEquipment = useMemo(() => unionOf(day, (re) => re.exercise.equipment), [day]);
  const storedMuscles = day.primaryMuscles ?? [];
  const storedEquipment = day.equipment ?? [];
  const shownMuscles = manual ? storedMuscles : derivedMuscles;
  const shownEquipment = manual ? storedEquipment : derivedEquipment;

  // ---------- minutes (estMinutes) ----------
  const [minutesDraft, setMinutesDraft] = useState<string | null>(null);
  const minutesValue = day.estMinutes ?? null;
  const commitMinutes = (next: number | null) => {
    setMinutesDraft(null);
    if (next === minutesValue || next === null && minutesValue === null) return;
    void run(() => routinesApi.updateDay(routineId, day.id, { minutes: next }), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "PATCH",
      body: { minutes: next },
      label: "Minutes saved",
    });
  };
  const stepMinutes = (delta: number) => {
    const base = minutesDraft != null ? Number(minutesDraft) || 0 : (minutesValue ?? 0);
    commitMinutes(Math.max(0, Math.min(600, Math.round((base + delta) / 5) * 5)));
  };

  // ---------- chip toggles ----------
  const patchChips = (muscles?: string[], equipment?: string[]) => {
    onManualChange(day.id, true);
    void run(() => routinesApi.updateDay(routineId, day.id, { ...(muscles ? { muscles } : {}), ...(equipment ? { equipment } : {}) }), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "PATCH",
      body: { ...(muscles ? { muscles } : {}), ...(equipment ? { equipment } : {}) },
      label: "Day tags saved",
    });
  };

  const toggleMuscle = (m: Muscle) => {
    const base = shownMuscles;
    const next = base.includes(m) ? base.filter((x) => x !== m) : [...base, m];
    patchChips(next.filter((v) => (MUSCLES as readonly string[]).includes(v)));
  };

  const toggleEquipment = (e: Equipment) => {
    const base = shownEquipment;
    const next = base.includes(e) ? base.filter((x) => x !== e) : [...base, e];
    patchChips(undefined, next.filter((v) => (EQUIPMENT as readonly string[]).includes(v)));
  };

  const resetToAuto = () => {
    onManualChange(day.id, false);
    void run(() => routinesApi.updateDay(routineId, day.id, { muscles: derivedMuscles, equipment: derivedEquipment }), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "PATCH",
      body: { muscles: derivedMuscles, equipment: derivedEquipment },
      label: "Day tags reset",
    });
    toast.success("Muscles and equipment re-derived from the exercises");
  };

  const autoPill = (forMuscles: boolean) =>
    manual ? (
      <button
        type="button"
        {...tourAttrs({ skipTour: true, reason: "Reset-to-auto chip inside the day fields editor" })}
        className="h-7 flex-none rounded-full border border-dashed border-primary/60 px-2.5 text-[11px] font-bold leading-none text-primary transition-colors hover:bg-primary/10"
        onClick={resetToAuto}
        aria-label="Reset muscles and equipment to auto"
      >
        <RotateCcw className="mr-0.5 inline h-3 w-3" aria-hidden />
        Auto
      </button>
    ) : (
      <span
        className="h-7 flex-none rounded-full border border-dashed border-border px-2.5 text-[11px] font-semibold leading-none text-muted-foreground"
        title="Auto-derived from this day's exercises"
      >
        auto
      </span>
    );

  return (
    <div className="flex flex-col border-b border-border">
      {/* ---------- Minutes row 48px ---------- */}
      <div
        data-row
        {...tourAttrs({ id: "builder.dayMinutes", label: "Minutes", help: "Planned length of this day in minutes.", order: 240 })}
        className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap px-3"
      >
        <span className="w-14 flex-none text-xs font-semibold text-muted-foreground">Minutes</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          tour={{ skipTour: true, reason: "Minutes stepper minus" }}
          className="h-9 w-9 flex-none rounded-lg p-0"
          aria-label="Five minutes less"
          onClick={() => stepMinutes(-5)}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </Button>
        <input
          inputMode="numeric"
          aria-label="Planned minutes for this day"
          {...tourAttrs({ skipTour: true, reason: "Covered by the builder.dayMinutes row anchor" })}
          value={minutesDraft ?? (minutesValue == null ? "" : String(minutesValue))}
          onChange={(e) => setMinutesDraft(e.target.value)}
          onBlur={() => {
            if (minutesDraft == null) return;
            const parsed = Number(minutesDraft);
            commitMinutes(minutesDraft.trim() === "" || Number.isNaN(parsed) ? null : Math.max(0, Math.min(600, Math.round(parsed))));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          placeholder="–"
          className="h-9 w-14 flex-none rounded-md border border-border bg-transparent px-1 text-center text-sm tabular-nums outline-none focus:bg-muted/40"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          tour={{ skipTour: true, reason: "Minutes stepper plus" }}
          className="h-9 w-9 flex-none rounded-lg p-0"
          aria-label="Five minutes more"
          onClick={() => stepMinutes(5)}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </Button>
        <span className="flex-none text-xs text-muted-foreground">min</span>
      </div>

      {/* ---------- Muscles chips row 40px ---------- */}
      <div
        data-row
        {...tourAttrs({ id: "builder.dayMuscles", label: "Muscles", help: "Auto-derived from the exercises; tap a chip to override.", order: 250 })}
        className="flex h-10 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap px-3"
      >
        <span className="w-14 flex-none text-xs font-semibold text-muted-foreground">Muscles</span>
        <div className="scroll-slim flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {autoPill(true)}
          {MUSCLES.map((m) => {
            const on = shownMuscles.includes(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                {...tourAttrs({ skipTour: true, reason: "Muscle chip inside the day fields editor" })}
                aria-label={`${MUSCLE_LABELS[m]}${on ? " selected" : ""}`}
                className={cn(
                  "h-7 flex-none rounded-full border px-2.5 text-[11px] font-semibold leading-none transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                onClick={() => toggleMuscle(m)}
              >
                {MUSCLE_LABELS[m]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- Equipment chips row 40px ---------- */}
      <div
        data-row
        {...tourAttrs({ id: "builder.dayEquipment", label: "Equipment", help: "Auto-derived from the exercises; tap a chip to override.", order: 260 })}
        className="flex h-10 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap px-3"
      >
        <span className="w-14 flex-none text-xs font-semibold text-muted-foreground">Equipment</span>
        <div className="scroll-slim flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {autoPill(false)}
          {EQUIPMENT.map((e) => {
            const on = shownEquipment.includes(e);
            return (
              <button
                key={e}
                type="button"
                aria-pressed={on}
                {...tourAttrs({ skipTour: true, reason: "Equipment chip inside the day fields editor" })}
                aria-label={`${EQUIPMENT_LABELS[e]}${on ? " selected" : ""}`}
                className={cn(
                  "h-7 flex-none rounded-full border px-2.5 text-[11px] font-semibold leading-none transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                onClick={() => toggleEquipment(e)}
              >
                {EQUIPMENT_LABELS[e]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

function ProgramEditorInner({ routineId }: { routineId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const online = useOnline();
  const invalidate = useInvalidate();
  const { run } = useRoutineRun();
  const sensors = useEditorSensors();

  // ---------- data ----------
  const { data: routine, isLoading, error } = useQuery({
    queryKey: qk.routine(routineId),
    queryFn: () => routinesApi.get(routineId),
    retry: 1,
  });

  const isProgram = routine ? routine.kind !== "SESSION" : true;
  const variantsQuery = useQuery({
    queryKey: qk.builderVariants(routineId),
    queryFn: () => builderVariantsApi.list(routineId),
    enabled: !!routine && isProgram,
    retry: 1,
  });
  const variants = variantsQuery.data;

  const days = useMemo(
    () => (routine ? [...routine.days].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [routine],
  );
  const kindSeg = routine ? kindSegment(routine) : "program";

  // ---------- ui state ----------
  const [openDayId, setOpenDayId] = useState<string | undefined>(undefined);
  const [renamingDayId, setRenamingDayId] = useState<string | null>(null);
  const [deleteDay, setDeleteDay] = useState<RoutineDayDTO | null>(null);
  const [removePhase, setRemovePhase] = useState<BuilderVariantPhaseDTO | null>(null);
  const [savingDone, setSavingDone] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>("INTERMEDIATE");
  const [variantBusy, setVariantBusy] = useState<Difficulty | null>(null);
  const [phaseBusy, setPhaseBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [taglineDraft, setTaglineDraft] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);
  const [weeksDraft, setWeeksDraft] = useState<number | null>(null);
  // dayId → user manually edited the muscle/equipment chips
  const [manualDayFields, setManualDayFields] = useState<Record<string, boolean>>({});
  const setManual = (dayId: string, manual: boolean) => {
    setManualDayFields((prev) => (prev[dayId] === manual ? prev : { ...prev, [dayId]: manual }));
  };

  // name input draft syncs from the server value once
  useEffect(() => {
    if (routine && nameDraft == null) setNameDraft(routine.name);
  }, [routine, nameDraft]);

  // details drafts sync once from the variants payload (publish block)
  useEffect(() => {
    const pub = variants?.publish;
    if (!pub) return;
    if (taglineDraft == null) setTaglineDraft(pub.tagline ?? "");
    if (descriptionDraft == null) setDescriptionDraft(pub.description ?? "");
    if (weeksDraft == null) setWeeksDraft(pub.weeks);
  }, [variants, taglineDraft, descriptionDraft, weeksDraft]);

  // ---------- variant model ----------
  const selectedVariant = useMemo(
    () => variants?.variants.find((v) => v.difficulty === selectedDifficulty) ?? null,
    [variants, selectedDifficulty],
  );
  const variantPhaseIds = useMemo(
    () => new Set(selectedVariant?.phases.map((p) => p.id) ?? []),
    [selectedVariant],
  );
  const dayPhase = (dayId: string): string | null => variants?.dayPhaseIds[dayId] ?? null;

  /** Days of the selected variant: its phases' days + unassigned days. */
  const visibleDays = useMemo(
    () =>
      isProgram
        ? days.filter((d) => {
            const pid = dayPhase(d.id);
            return pid == null || variantPhaseIds.has(pid);
          })
        : days,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, isProgram, variants, selectedVariant],
  );
  const daysOfPhase = (phaseId: string | null) => visibleDays.filter((d) => (dayPhase(d.id) ?? null) === phaseId);
  const unassignedDays = isProgram ? daysOfPhase(null) : [];
  const phases = selectedVariant?.phases ?? [];

  const defaultOpenDayId = visibleDays[0]?.id ?? "";
  const effectiveOpen = (dayId: string) => (openDayId ?? defaultOpenDayId) === dayId;
  const toggleDay = (dayId: string) => {
    const current = openDayId ?? defaultOpenDayId;
    setOpenDayId(current === dayId ? "" : dayId);
  };

  // default tab: the routine's legacy difficulty when that variant exists,
  // else the first variant, else the legacy difficulty (auto-created below).
  const seededTab = useRef(false);
  useEffect(() => {
    if (seededTab.current || !routine || !isProgram || !variantsQuery.isSuccess) return;
    seededTab.current = true;
    const list = variantsQuery.data?.variants ?? [];
    const legacy = (routine.difficulty ?? "INTERMEDIATE") as Difficulty;
    if (list.some((v) => v.difficulty === legacy)) setSelectedDifficulty(legacy);
    else if (list.length > 0) setSelectedDifficulty(list[0].difficulty as Difficulty);
    else setSelectedDifficulty(legacy);
  }, [routine, isProgram, variantsQuery.isSuccess, variantsQuery.data]);

  /** Create the variant at `difficulty` on demand (§12 tab flow). */
  const ensureVariant = async (difficulty: Difficulty) => {
    if (!online) {
      toast.info("Creating a variant needs a connection");
      return;
    }
    setVariantBusy(difficulty);
    try {
      await builderVariantsApi.putVariant(routineId, difficulty, {});
      invalidate.builderVariants(routineId);
      invalidate.programs();
      invalidate.programDetail(routineId);
      toast.success(`${DIFFICULTY_LABELS[difficulty]} variant created`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setVariantBusy(null);
    }
  };

  // a program with no variants at all gets its default variant on load so the
  // phase UI (and "+ Phase") is immediately usable.
  const autoCreateTried = useRef(false);
  useEffect(() => {
    if (autoCreateTried.current || !routine || !isProgram || !variantsQuery.isSuccess) return;
    if ((variantsQuery.data?.variants.length ?? 0) > 0) {
      autoCreateTried.current = true;
      return;
    }
    autoCreateTried.current = true;
    void ensureVariant(selectedDifficulty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routine, isProgram, variantsQuery.isSuccess, variantsQuery.data, selectedDifficulty]);

  const onTabTap = (d: Difficulty) => {
    if (d === selectedDifficulty || variantBusy != null) return;
    setSelectedDifficulty(d);
    setOpenDayId(undefined);
    if (!variants?.variants.some((v) => v.difficulty === d)) void ensureVariant(d);
  };

  // ---------- auto-derive day muscles/equipment on exercise add/remove ----------
  const exerciseCounts = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!routine) return;
    for (const day of routine.days) {
      const prev = exerciseCounts.current[day.id];
      exerciseCounts.current[day.id] = day.exercises.length;
      if (prev === undefined || prev === day.exercises.length || manualDayFields[day.id]) continue;
      const muscles = unionOf(day, (re) => re.exercise.primaryMuscles);
      const equipment = unionOf(day, (re) => re.exercise.equipment);
      void run(() => routinesApi.updateDay(routineId, day.id, { muscles, equipment }), {
        path: `/api/routines/${routineId}/days/${day.id}`,
        method: "PATCH",
        body: { muscles, equipment },
        label: "Day tags updated",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routine, manualDayFields]);

  // ---------- routine-level mutations ----------
  const saveName = async () => {
    if (!routine || nameDraft == null) return;
    const name = nameDraft.trim();
    if (!name) {
      toast.info("Give the program a name");
      setNameDraft(routine.name);
      return;
    }
    if (name === routine.name) return;
    const ok = await run(() => routinesApi.update(routineId, { name }), {
      path: `/api/routines/${routineId}`,
      method: "PATCH",
      body: { name },
      label: "Name saved",
    });
    if (ok) toast.success("Name saved");
  };

  const saveLevel = async (difficulty: Difficulty) => {
    if (!routine || routine.difficulty === difficulty) return;
    const ok = await run(() => routinesApi.update(routineId, { difficulty }), {
      path: `/api/routines/${routineId}`,
      method: "PATCH",
      body: { difficulty },
      label: "Level saved",
    });
    if (ok) toast.success(`Level · ${DIFFICULTY_LABELS[difficulty]}`);
  };

  const done = () => {
    if (!routine) return;
    const name = (nameDraft ?? routine.name).trim();
    if (!name) {
      toast.info("Give the program a name before finishing");
      return;
    }
    setSavingDone(true);
    if (name !== routine.name) {
      void saveName().finally(() => {
        setSavingDone(false);
        navigate(`/programs/${routineId}`);
      });
      return;
    }
    setSavingDone(false);
    toast.success("Saved");
    navigate(`/programs/${routineId}`);
  };

  // ---------- program details (tagline / weeks / description) ----------
  const putMeta = async (patch: Record<string, unknown>, label: string) => {
    if (!online) {
      toast.info("Saving needs a connection");
      return;
    }
    try {
      await programsMetaApi.update(routineId, patch);
      invalidate.builderVariants(routineId);
      invalidate.programs();
      invalidate.programDetail(routineId);
      toast.success(label);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const saveTagline = () => {
    if (taglineDraft == null) return;
    const next = taglineDraft.trim();
    if ((variants?.publish.tagline ?? "") === next) return;
    void putMeta({ tagline: next || null }, "Tagline saved");
  };

  const saveDescription = () => {
    if (descriptionDraft == null) return;
    const next = descriptionDraft.trim();
    if ((variants?.publish.description ?? "") === next) return;
    void putMeta({ description: next || null }, "Description saved");
  };

  const saveWeeks = (next: number | null) => {
    setWeeksDraft(next);
    if ((variants?.publish.weeks ?? null) === next) return;
    void putMeta({ weeks: next }, next == null ? "Weeks cleared" : `Weeks · ${next}`);
  };

  // ---------- publish ----------
  const isPublic = variants?.publish.isPublic ?? false;
  const togglePublish = async () => {
    if (!routine || !online) {
      if (routine) toast.info("Publishing needs a connection");
      return;
    }
    setPublishing(true);
    try {
      await builderVariantsApi.publish(routineId, { isPublic: !isPublic });
      invalidate.builderVariants(routineId);
      invalidate.programs();
      invalidate.programDetail(routineId);
      toast.success(!isPublic ? "Published — the program appears in your catalog" : "Unpublished");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPublishing(false);
    }
  };

  // ---------- phase mutations ----------
  const addPhase = async () => {
    if (!online) {
      toast.info("Adding a phase needs a connection");
      return;
    }
    setPhaseBusy(true);
    try {
      const phase = await builderVariantsApi.addPhase(routineId, { difficulty: selectedDifficulty });
      invalidate.builderVariants(routineId);
      invalidate.programs();
      invalidate.programDetail(routineId);
      toast.success(`${phase.name} added`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPhaseBusy(false);
    }
  };

  const confirmRemovePhase = async (phase: BuilderVariantPhaseDTO) => {
    setRemovePhase(null);
    if (!online) {
      toast.info("Removing a phase needs a connection");
      return;
    }
    try {
      const res = await builderVariantsApi.removePhase(routineId, phase.id);
      invalidate.builderVariants(routineId);
      invalidate.routines();
      invalidate.programs();
      invalidate.programDetail(routineId);
      toast.success(
        res.unassignedDays > 0
          ? `${phase.name} removed · ${res.unassignedDays} day${res.unassignedDays === 1 ? "" : "s"} unassigned`
          : `${phase.name} removed`,
      );
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // ---------- day-level mutations ----------
  const renameDay = async (day: RoutineDayDTO, name: string) => {
    setRenamingDayId(null);
    if (!name || name === day.name) return;
    const ok = await run(() => routinesApi.updateDay(routineId, day.id, { name }), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "PATCH",
      body: { name },
      label: "Day renamed",
    });
    if (ok) toast.success("Day renamed");
  };

  const toggleDayType = async (day: RoutineDayDTO) => {
    const next = (day.dayType ?? "WORKOUT") === "REST" ? "WORKOUT" : "REST";
    const ok = await run(() => routinesApi.updateDay(routineId, day.id, { dayType: next }), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "PATCH",
      body: { dayType: next },
      label: "Day type changed",
    });
    if (ok) toast.success(`${day.name} → ${next === "REST" ? "rest day" : "workout day"}`);
  };

  const moveDayToPhase = async (day: RoutineDayDTO, phaseId: string | null, label: string) => {
    const ok = await run(() => routinesApi.updateDay(routineId, day.id, { phaseId }), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "PATCH",
      body: { phaseId },
      label: "Day moved",
    });
    if (ok) {
      invalidate.builderVariants(routineId);
      toast.success(`${day.name} → ${label}`);
    }
  };

  const removeDay = async (day: RoutineDayDTO) => {
    const ok = await run(() => routinesApi.removeDay(routineId, day.id), {
      path: `/api/routines/${routineId}/days/${day.id}`,
      method: "DELETE",
      label: `Deleted ${day.name}`,
    });
    setDeleteDay(null);
    if (ok) {
      invalidate.builderVariants(routineId);
      toast.success(`Deleted “${day.name}”`);
    }
  };

  const addDay = async (phaseId: string | null, dayType: "WORKOUT" | "REST") => {
    if (!routine) return;
    if (!online) {
      toast.info("Adding a day needs a connection");
      return;
    }
    const name = dayType === "REST" ? restDayName(routine.days) : nextDayName(routine.days);
    try {
      const updated = await routinesApi.addDay(routineId, name, dayType, phaseId ? { phaseId } : undefined);
      invalidate.routines();
      invalidate.builderVariants(routineId);
      const oldIds = new Set(routine.days.map((d) => d.id));
      const created =
        [...updated.days].sort((a, b) => b.sortOrder - a.sortOrder).find((d) => !oldIds.has(d.id)) ?? null;
      if (created) {
        setOpenDayId(created.id);
        setRenamingDayId(created.id);
      }
      toast.success(dayType === "REST" ? "Rest day added" : "Day added");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // ---------- day drag reorder (persist the changed sortOrders) ----------
  // Within the selected variant's flat day list; a cross-phase drop also moves
  // the dragged day into its new neighbour's phase.
  const onDragEnd = (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = visibleDays.map((d) => d.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const next = arrayMove(visibleDays, oldIndex, newIndex);
    const moved = next[newIndex];
    const prevNeighbour = next[newIndex - 1];
    const nextNeighbour = next[newIndex + 1];
    let targetPhaseId = dayPhase(moved.id) ?? null;
    if (prevNeighbour) targetPhaseId = dayPhase(prevNeighbour.id) ?? targetPhaseId;
    else if (nextNeighbour) targetPhaseId = dayPhase(nextNeighbour.id) ?? targetPhaseId;
    const persist = async () => {
      for (let i = 0; i < next.length; i++) {
        const dayId = next[i].id;
        const phasePatch =
          dayId === moved.id && targetPhaseId !== (dayPhase(moved.id) ?? null) ? { phaseId: targetPhaseId } : {};
        if (next[i].sortOrder === i && Object.keys(phasePatch).length === 0) continue;
        await run(() => routinesApi.updateDay(routineId, dayId, { sortOrder: i, ...phasePatch }), {
          path: `/api/routines/${routineId}/days/${dayId}`,
          method: "PATCH",
          body: { sortOrder: i, ...phasePatch },
          label: "Day order",
        });
      }
    };
    void persist();
  };

  // ---------- day header (56px accordion row) ----------
  const renderDayHeader = (day: RoutineDayDTO, index: number, handle: ReactNode) => {
    const open = effectiveOpen(day.id);
    const isRest = (day.dayType ?? "WORKOUT") === "REST";
    const renaming = renamingDayId === day.id;
    const currentPhaseId = isProgram ? dayPhase(day.id) ?? null : null;
    // ⋮ "Move to phase…" targets: other phases of this variant + Unassigned.
    const moveTargets: Array<{ id: string | null; label: string }> = isProgram
      ? [
          ...phases
            .filter((p) => p.id !== currentPhaseId)
            .map((p) => ({ id: p.id as string | null, label: `Phase ${p.idx + 1}` })),
          ...(currentPhaseId != null ? [{ id: null as string | null, label: "Unassigned" }] : []),
        ]
      : [];
    return (
      <div
        data-row
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`Day ${index + 1} ${day.name}`}
        {...tourAttrs({ id: "programEditor.dayRow", label: "Day row", help: "Open this day to edit its exercise groups.", order: 60 })}
        className="relative flex h-14 cursor-pointer select-none items-center gap-1 overflow-hidden whitespace-nowrap pl-2 pr-1 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => toggleDay(day.id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleDay(day.id);
          }
        }}
      >
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-6 flex-none p-0"
          aria-label={open ? `Collapse ${day.name}` : `Expand ${day.name}`}
          aria-expanded={open}
          tour={{ id: "programEditor.dayToggle", label: "Day chevron", help: "Expand or collapse this day.", order: 70 }}
          onClick={(e) => {
            e.stopPropagation();
            toggleDay(day.id);
          }}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open ? "" : "-rotate-90")} aria-hidden />
        </Button>
        <span className="w-14 flex-none text-xs font-semibold leading-none text-muted-foreground">
          Day {index + 1}
        </span>
        {renaming ? (
          <span
            className="flex min-w-0 flex-1 items-center"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <InlineInput
              value={day.name}
              onCommit={(name) => void renameDay(day, name)}
              onCancel={() => setRenamingDayId(null)}
              ariaLabel={`Rename ${day.name}`}
            />
          </span>
        ) : (
          <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold leading-none", isRest && "text-muted-foreground")}>
            {isRest ? <Moon className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden /> : null}
            {day.name}
          </span>
        )}
        {/* ⋮ day menu: Rename · Workout/Rest · Move to phase… · Delete */}
        <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-11 p-0"
                aria-label={`Actions for ${day.name}`}
                tour={{ id: "programEditor.dayMenu", label: "Day menu", help: "Rename, switch workout/rest, move between phases, or delete.", order: 80 }}
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setRenamingDayId(day.id)}>
                <Pencil className="h-4 w-4" aria-hidden /> Rename…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void toggleDayType(day)}>
                {isRest ? (
                  <Zap className="h-4 w-4" aria-hidden />
                ) : (
                  <Moon className="h-4 w-4" aria-hidden />
                )}
                {isRest ? "Make workout day" : "Make rest day"}
              </DropdownMenuItem>
              {moveTargets.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  {moveTargets.map((t) => (
                    <DropdownMenuItem
                      key={t.id ?? "unassigned"}
                      onClick={() => void moveDayToPhase(day, t.id, t.label)}
                    >
                      <ChevronDown className="h-4 w-4 -rotate-90" aria-hidden /> Move to {t.label}
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteDay(day)}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Delete day…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
        {/* ≡ drag handle (dnd-kit listeners) */}
        {handle}
      </div>
    );
  };

  // ---------- one day accordion (fields + groups) ----------
  const renderDaySection = (day: RoutineDayDTO, index: number) => (
    <SortableDaySectionWrapper
      key={day.id}
      day={day}
      index={index}
      open={effectiveOpen(day.id)}
      renderHeader={(handle) => renderDayHeader(day, index, handle)}
    >
      {isProgram ? (
        <DayFieldsEditor routineId={routineId} day={day} manual={!!manualDayFields[day.id]} onManualChange={setManual} />
      ) : null}
      <EditorDayBody routineId={routineId} kindSeg={kindSeg} day={day} settings={settings} />
    </SortableDaySectionWrapper>
  );

  // ---------- + day row (per phase; 40px split buttons) ----------
  const renderAddDayRow = (phaseId: string | null) => (
    <div data-row className="flex h-10 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap">
      <button
        type="button"
        {...tourAttrs({ id: "programEditor.addDay", label: "Add day", help: "Append a workout day to this phase.", order: 50 })}
        aria-label="Add a workout day to this phase"
        onClick={() => void addDay(phaseId, "WORKOUT")}
        className="flex h-10 min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
      >
        <Plus className="h-4 w-4 flex-none" aria-hidden />
        <span className="truncate">Workout day</span>
      </button>
      <button
        type="button"
        {...tourAttrs({ id: "programEditor.addRestDay", label: "Add rest day", help: "Append a rest day to this phase.", order: 200 })}
        aria-label="Add a rest day to this phase"
        onClick={() => void addDay(phaseId, "REST")}
        className="flex h-10 min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
      >
        <Moon className="h-4 w-4 flex-none" aria-hidden />
        <span className="truncate">Rest day</span>
      </button>
    </div>
  );

  // ---------- render ----------
  const taglineValue = taglineDraft ?? "";
  const weeksValue = weeksDraft;
  const detailsSummary = taglineValue.trim()
    ? taglineValue.trim()
    : weeksValue != null
      ? `${weeksValue} weeks`
      : "tagline · weeks · description";

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/builder" label="Back to Builder" />}
          title={routine ? routine.name : "Program editor"}
          actions={
            <>
              <Button
                type="button"
                className="h-11 flex-none gap-1.5 px-4 text-sm font-bold"
                disabled={!routine || savingDone}
                tour={{ id: "programEditor.done", label: "Done", help: "Finish editing and return to the program.", order: 10 }}
                onClick={done}
              >
                {savingDone ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                Done
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        routine && isProgram ? (
          <SubBar>
            {/* Variant tabs — border-frame segmented (records-tab pattern):
                grid-cols-3 + h-full cells; missing variants render dimmed and
                are created on tap. Selected = accent. */}
            <div
              data-row
              role="radiogroup"
              aria-label="Variant"
              className="grid h-10 w-full grid-cols-3 overflow-hidden whitespace-nowrap rounded-lg border bg-card"
            >
              {DIFFICULTIES.map((d) => {
                const selected = selectedDifficulty === d;
                const exists = variants?.variants.some((v) => v.difficulty === d) ?? false;
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${DIFFICULTY_LABELS[d]} variant${exists ? "" : " — creates it on tap"}`}
                    {...tourAttrs({ id: "builder.variantTabs", label: "Variant tabs", help: "Edit the beginner, intermediate or advanced version of this program.", order: 200 })}
                    className={cn(
                      "flex h-full min-w-0 items-center justify-center overflow-hidden text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : cn("text-muted-foreground hover:bg-accent hover:text-foreground", !exists && "opacity-50"),
                    )}
                    onClick={() => onTabTap(d)}
                    disabled={variantBusy != null}
                  >
                    {variantBusy === d ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <span className="truncate">{DIFFICULTY_LABELS[d]}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </SubBar>
        ) : undefined
      }
      bottomBar={
        routine && isProgram && variantsQuery.isSuccess ? (
          <BottomBar>
            <Button
              type="button"
              variant={isPublic ? "default" : "outline"}
              className="h-11 w-full gap-1.5 font-bold"
              disabled={publishing}
              tour={{ id: "builder.publish", label: "Publish", help: "Publish this program to your catalog, or unpublish it again.", order: 230 }}
              onClick={() => void togglePublish()}
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : isPublic ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : null}
              <span className="truncate">{isPublic ? "Published — tap to unpublish" : "Publish"}</span>
            </Button>
          </BottomBar>
        ) : undefined
      }
    >
      <ScrollBody>
        {error ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Program not found</p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Error-state back link for a missing program" }}
              onClick={() => navigate("/builder")}
            >
              Back to Builder
            </Button>
          </div>
        ) : isLoading || !routine ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading program">
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : (
          <>
            {/* ---------- Name row 48px ---------- */}
            <div
              data-row
              {...tourAttrs({ id: "programEditor.name", label: "Name", help: "Rename this program; saved when you leave the field.", order: 20 })}
              className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3"
            >
              <span className="w-14 flex-none text-xs font-semibold text-muted-foreground">Name</span>
              <Input
                value={nameDraft ?? ""}
                maxLength={80}
                aria-label="Program name"
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                className="h-10 min-w-0 flex-1"
              />
            </div>

            {/* ---------- Level row 48px (segmented) ---------- */}
            <div
              data-row
              role="group"
              aria-label="Program level"
              {...tourAttrs({ id: "programEditor.level", label: "Level", help: "Beginner, intermediate or advanced — drives suggestions.", order: 30 })}
              className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3"
            >
              <span className="w-14 flex-none text-xs font-semibold text-muted-foreground">Level</span>
              <div className="flex h-10 min-w-0 flex-1 items-center gap-1">
                {DIFFICULTIES.map((d) => {
                  const active = (routine.difficulty ?? "BEGINNER") === d;
                  return (
                    <Button
                      key={d}
                      type="button"
                      variant={active ? "default" : "outline"}
                      aria-pressed={active}
                      tour={{ id: "programEditor.levelOption", label: "Level option", help: "Pick the program's training level.", order: 40 }}
                      className="h-10 min-w-0 flex-1 px-1 text-xs font-bold"
                      onClick={() => void saveLevel(d)}
                    >
                      <span className="truncate">{LEVEL_SHORT[d]}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {isProgram ? (
              <>
                {/* ---------- Program details section (§12) ---------- */}
                <button
                  type="button"
                  data-row
                  aria-expanded={detailsOpen}
                  {...tourAttrs({ id: "programEditor.details", label: "Details", help: "Tagline, length in weeks and description shown in the catalog.", order: 150 })}
                  onClick={() => setDetailsOpen((o) => !o)}
                  className="flex h-14 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">Program details</span>
                  <span className="min-w-0 max-w-[45%] flex-none truncate text-xs text-muted-foreground">{detailsSummary}</span>
                  <ChevronDown className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", !detailsOpen && "-rotate-90")} aria-hidden />
                </button>
                {detailsOpen ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                    {/* tagline */}
                    <div
                      data-row
                      {...tourAttrs({ id: "programEditor.tagline", label: "Tagline", help: "One-liner under the program's name in the catalog.", order: 160 })}
                      className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border px-3"
                    >
                      <span className="w-16 flex-none text-xs font-semibold text-muted-foreground">Tagline</span>
                      <Input
                        value={taglineValue}
                        maxLength={120}
                        aria-label="Program tagline"
                        {...tourAttrs({ skipTour: true, reason: "Covered by the programEditor.tagline row anchor" })}
                        onChange={(e) => setTaglineDraft(e.target.value)}
                        onBlur={() => saveTagline()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        placeholder="Short one-liner"
                        className="h-10 min-w-0 flex-1"
                      />
                    </div>
                    {/* weeks stepper */}
                    <div
                      data-row
                      {...tourAttrs({ id: "programEditor.weeks", label: "Weeks", help: "Planned length of the program in weeks.", order: 170 })}
                      className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border px-3"
                    >
                      <span className="w-16 flex-none text-xs font-semibold text-muted-foreground">Weeks</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        tour={{ skipTour: true, reason: "Weeks stepper minus" }}
                        className="h-9 w-9 flex-none rounded-lg p-0"
                        aria-label="One week less"
                        onClick={() => saveWeeks(Math.max(1, (weeksValue ?? 0) - 1) || null)}
                      >
                        <Minus className="h-4 w-4" aria-hidden />
                      </Button>
                      <span className="w-12 flex-none text-center text-sm font-semibold tabular-nums">
                        {weeksValue == null ? "–" : weeksValue}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        tour={{ skipTour: true, reason: "Weeks stepper plus" }}
                        className="h-9 w-9 flex-none rounded-lg p-0"
                        aria-label="One week more"
                        onClick={() => saveWeeks(Math.min(104, (weeksValue ?? 0) + 1))}
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                      </Button>
                      {weeksValue != null ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          tour={{ skipTour: true, reason: "Clear-weeks inside the details section" }}
                          className="ml-auto h-9 flex-none rounded-lg px-2 text-xs text-muted-foreground"
                          onClick={() => saveWeeks(null)}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                    {/* description */}
                    <div className="flex flex-col gap-1.5">
                      <div
                        data-row
                        {...tourAttrs({ id: "programEditor.description", label: "Description", help: "About prose shown on the program's Overview tab.", order: 180 })}
                        className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap px-1"
                      >
                        <span className="w-16 flex-none text-xs font-semibold text-muted-foreground">About</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">saved when you leave the field</span>
                      </div>
                      <Textarea
                        value={descriptionDraft ?? ""}
                        maxLength={4000}
                        aria-label="Program description"
                        {...tourAttrs({ skipTour: true, reason: "Covered by the programEditor.description row anchor" })}
                        onChange={(e) => setDescriptionDraft(e.target.value)}
                        onBlur={() => saveDescription()}
                        placeholder="What this program is about, who it suits, how to run it…"
                        className="min-h-24 w-full resize-none text-sm leading-relaxed"
                      />
                    </div>
                  </div>
                ) : null}

                {/* ---------- phases + days (dnd-kit sortable within the variant) ---------- */}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={visibleDays.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-4">
                      {phases.map((phase) => {
                        const phaseDays = daysOfPhase(phase.id);
                        return (
                          <section key={phase.id} className="flex flex-none flex-col gap-2" aria-label={`Phase ${phase.idx + 1} ${phase.name}`}>
                            {/* phase header 48px */}
                            <div
                              data-row
                              className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3"
                            >
                              <span className="flex h-6 w-8 flex-none items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold uppercase text-primary">
                                P{phase.idx + 1}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
                                <span className="text-xs font-semibold text-muted-foreground">Phase {phase.idx + 1} · </span>
                                {phase.name}
                              </span>
                              <span className="flex-none text-xs text-muted-foreground">
                                {phaseDays.length} {phaseDays.length === 1 ? "day" : "days"}
                              </span>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-9 w-9 flex-none p-0"
                                    aria-label={`Actions for phase ${phase.idx + 1}`}
                                    tour={{ id: "builder.phaseMenu", label: "Phase menu", help: "Remove this phase; its days become unassigned.", order: 220 }}
                                  >
                                    <MoreVertical className="h-5 w-5" aria-hidden />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setRemovePhase(phase)}
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden /> Remove phase…
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            {phaseDays.map((day) => renderDaySection(day, visibleDays.indexOf(day) + 1))}
                            {renderAddDayRow(phase.id)}
                          </section>
                        );
                      })}

                      {/* unassigned days (no phase — legacy/removed-phase days) */}
                      {unassignedDays.length > 0 ? (
                        <section className="flex flex-none flex-col gap-2" aria-label="Unassigned days">
                          <p
                            data-row
                            className="flex h-8 w-full flex-none items-center overflow-hidden whitespace-nowrap px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                          >
                            <span className="truncate">Unassigned days</span>
                          </p>
                          {unassignedDays.map((day) => renderDaySection(day, visibleDays.indexOf(day) + 1))}
                        </section>
                      ) : null}

                      {phases.length === 0 && variantsQuery.isSuccess ? (
                        <p className="flex-none rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                          No phases in the {DIFFICULTY_LABELS[selectedDifficulty]} version yet — add the first one below, then
                          its workout and rest days.
                        </p>
                      ) : null}
                    </div>
                  </SortableContext>

                  {/* ---------- + Phase row 40px ---------- */}
                  <button
                    type="button"
                    data-row
                    {...tourAttrs({ id: "builder.addPhase", label: "Add phase", help: "Append another phase block to this variant.", order: 210 })}
                    aria-label="Add a phase"
                    disabled={phaseBusy}
                    onClick={() => void addPhase()}
                    className="mt-1 flex h-10 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground disabled:opacity-50"
                  >
                    {phaseBusy ? <Loader2 className="h-4 w-4 flex-none animate-spin" aria-hidden /> : <Plus className="h-4 w-4 flex-none" aria-hidden />}
                    Phase
                  </button>
                </DndContext>
              </>
            ) : (
              /* ---------- SESSION-kind defensive path: legacy flat day list ---------- */
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={days.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-3">
                    {days.map((day, index) => renderDaySection(day, index + 1))}
                  </div>
                </SortableContext>
                {renderAddDayRow(null)}
              </DndContext>
            )}
          </>
        )}
      </ScrollBody>

      {/* destructive confirm: delete day */}
      <AlertDialog open={deleteDay != null} onOpenChange={(o) => !o && setDeleteDay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteDay?.name ?? "day"}?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteDay?.name}” and its {deleteDay?.exercises.length ?? 0} exercise
              {(deleteDay?.exercises.length ?? 0) === 1 ? "" : "s"} leave this program. Logged workouts stay
              untouched. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteDay) void removeDay(deleteDay);
              }}
            >
              Delete day
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* destructive confirm: remove phase (§12) */}
      <AlertDialog open={removePhase != null} onOpenChange={(o) => !o && setRemovePhase(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove phase?</AlertDialogTitle>
            <AlertDialogDescription>
              {removePhase ? `Phase ${removePhase.idx + 1} · ${removePhase.name}` : "This phase"} is removed from the{" "}
              {DIFFICULTY_LABELS[selectedDifficulty]} version. Days in it become unassigned — they stay in the program
              and can be moved to another phase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (removePhase) void confirmRemovePhase(removePhase);
              }}
            >
              Remove phase
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}

// ---------- wrapper that owns the sortable handle node for a day ----------

function SortableDaySectionWrapper({
  day,
  index,
  open,
  renderHeader,
  children,
}: {
  day: RoutineDayDTO;
  index: number;
  open: boolean;
  renderHeader: (handle: ReactNode) => ReactNode;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: day.id,
    data: { type: "day", index },
  });
  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      {...tourAttrs({ id: "programEditor.dayDrag", label: "Day drag", help: "Drag to reorder — drop into another phase to move the day there.", order: 90 })}
      aria-label={`Reorder ${day.name}`}
      className="flex h-11 w-11 flex-none touch-none items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
    >
      <GripVertical className="h-5 w-5" aria-hidden />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex-none", isDragging && "z-20 opacity-80")}
    >
      <DaySection open={open} header={renderHeader(handle)}>
        {children}
      </DaySection>
    </div>
  );
}
