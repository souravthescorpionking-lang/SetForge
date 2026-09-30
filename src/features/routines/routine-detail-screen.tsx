"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RoutineDetailScreen — #/programs/{id} (Part 9 §4 — PROGRAM DETAIL).
//
//   TopBar (56)  : BackButton → #/programs · program name · ⋮ (Edit in Builder
//                  · Schedule day… · Skip day · Jump to day… · Unfollow · Copy
//                  · Delete) · TopBarHelp
//   SubBar (48)  : tabs Overview | Program (segmented, two halves).
//   Header       : name (bold) · "{daysDone} Days" pill (accent, current
//                  only) · phase chips row (32px "P1 {name}" chips,
//                  horizontally scrollable — only when >1 phase). When the
//                  variant is missing at the user's difficulty a muted notice
//                  row names the shown fallback.
//   Overview tab : "Highlights" 40px rows (divider style, no card borders) —
//                  Days per week · Equipment "{n} items" (chevron → inline
//                  32px name rows) · one row per phase with "{min}-{max} min".
//                  "About": description prose (fallback tagline/notes; hidden
//                  when truly nothing) + per-phase "Phase {n} — {name}"
//                  overview prose blocks (whitespace-normal — prose is exempt
//                  from the nowrap law).
//   Program tab  : "Preview — Phase {n}" row (40) + ghost "Reset Order" (only
//                  when a PhaseOverride exists for the phase). Day rows 56:
//                  GripVertical handle · name · "Day {i}" · "{minutes} min"
//                  (estMinutes ?? phase minutesMax; REST rows render "Rest
//                  day" muted italic, no minutes, no tap). Long-press drag
//                  within the phase (dnd-kit) → PUT PhaseOverride →
//                  "Order saved". Tap a WORKOUT row → #/days/{id}.
//   BottomBar(56): current program → "Continue — Day {cursor+1}" (start-day
//                  flow → #/session; REST cursor day → "Train anyway") ·
//                  otherwise "Start program — Phase {selected+1}" (confirm
//                  "Replace current program?" when another program is
//                  followed) → POST start → #/workout + "Program started".
//
// Data: GET /api/programs/{id}?difficulty= (variant-aware detail DTO). The
// difficulty comes from the ["session"] query (same source of truth as the
// catalog), so a difficulty switch re-renders this screen at the new variant.
// Variant-less custom programs render the §4 layout over a single implicit
// phase (DTO fallbackVariant; no drag — PhaseOverride needs a real phase).
//
// Stripped vs Part 8 §3.5: day accordion + inline GroupCards (day detail now
// lives at #/days/{id}), SubBar meta line, day ⋮ menus (Schedule/Favourite/
// Mark off/History moved to §5), follow button (startProgram replaces it).
// Kept: ⋮ program menu, ?jump=1 deep link, day scheduling + conflict dialog,
// destructive confirms, Builder entry point.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Screen, TopBar, SubBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowDownUp,
  CalendarClock,
  Check,
  ChevronDown,
  Copy,
  Dumbbell,
  GripVertical,
  Hammer,
  Loader2,
  Moon,
  MoreVertical,
  Play,
  SkipForward,
  StarOff,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { phaseOrderApi, programStartApi, programsApi, routinesApi } from "@/lib/client/api";
import { qk, useDashboard, useInvalidate, useOnline, useSession } from "@/lib/client/query";
import { useHashRoute } from "@/features/shell/router";
import { formatDayLabel, todayKey } from "@/lib/client/format";
import { DatePickerDialog, useScheduleCreate } from "@/features/schedule/schedule-shared";
import { DIFFICULTY_LABELS, EQUIPMENT_LABELS, type Difficulty, type Equipment } from "@/lib/constants";
import type {
  ProgramDetailDayDTO,
  ProgramDetailDTO,
  ProgramDetailPhaseDTO,
} from "@/lib/types";
import { errorMessage, useProgramRun, useRoutineRun } from "./screen-helpers";
import { useProgramExtras } from "./program-meta";

// ─────────────────────────────────────────────────────────────────────────────
// SectionHeader — 32px uppercase label with a trailing hairline (NOT a row).
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <h2 className="flex h-8 flex-none items-center gap-2 overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span className="flex-none truncate">{label}</span>
      <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
    </h2>
  );
}

/** Day minutes: estMinutes ?? phase minutesMax (both null → nothing). */
function minutesOf(day: ProgramDetailDayDTO, phase: ProgramDetailPhaseDTO): number | null {
  return day.estMinutes ?? phase.minutesMax ?? null;
}

/** Non-draggable grip glyph (implicit phases — PhaseOverride needs a real phase row). */
function StaticGrip(): ReactNode {
  return (
    <span aria-hidden className="flex h-11 w-6 flex-none items-center justify-center text-muted-foreground/40">
      <GripVertical className="h-4 w-4" />
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProgramDayRow — 56px: handle · name · "Day {i}" · "{minutes} min".
// REST rows render "Rest day" muted italic with no minutes and no tap.
// ─────────────────────────────────────────────────────────────────────────────

function ProgramDayRow({
  day,
  index,
  minutes,
  handle,
  onOpen,
}: {
  day: ProgramDetailDayDTO;
  index: number;
  minutes: number | null;
  handle: ReactNode;
  onOpen: (dayId: string) => void;
}) {
  const isRest = (day.dayType ?? "WORKOUT") === "REST";
  return (
    <div
      data-row
      className="flex h-14 w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border bg-card pl-1 pr-3"
    >
      {handle}
      <div
        {...(isRest
          ? { "aria-label": `Day ${index + 1} — rest day` }
          : {
              role: "button",
              tabIndex: 0,
              "aria-label": `Open ${day.name}`,
              ...tourAttrs({ id: "programDetail.dayRow", label: "Day row", help: "Open the day to see its exercise groups.", order: 70 }),
            })}
        className={cn(
          "flex h-14 min-w-0 flex-1 items-center gap-2",
          !isRest && "cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
        onClick={isRest ? undefined : () => onOpen(day.id)}
        onKeyDown={
          isRest
            ? undefined
            : (e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(day.id);
                }
              }
        }
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-semibold leading-none",
            isRest && "font-normal italic text-muted-foreground",
          )}
        >
          {isRest ? "Rest day" : day.name}
        </span>
        <span className="flex-none text-xs font-semibold leading-none text-muted-foreground">Day {index + 1}</span>
        {!isRest && minutes != null ? (
          <span className="flex-none text-xs leading-none text-muted-foreground">{minutes} min</span>
        ) : null}
      </div>
    </div>
  );
}

/** Sortable wrapper: owns the dnd handle node for a Program tab day row. */
function SortableProgramDayRow({
  day,
  index,
  minutes,
  onOpen,
}: {
  day: ProgramDetailDayDTO;
  index: number;
  minutes: number | null;
  onOpen: (dayId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: day.id });
  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      {...tourAttrs({ id: "programDetail.dayDrag", label: "Day drag", help: "Long-press and drag to reorder days in this phase.", order: 80 })}
      aria-label={`Reorder ${day.name}`}
      className="flex h-11 w-6 flex-none touch-none items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex-none", isDragging && "z-20 opacity-80")}
    >
      <ProgramDayRow day={day} index={index} minutes={minutes} handle={handle} onOpen={onOpen} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RoutineDetailScreen — keyed by routineId so local UI state (tab, selected
// phase, dialogs) resets naturally on navigation.
// ─────────────────────────────────────────────────────────────────────────────

export default function RoutineDetailScreen({ routineId }: { routineId: string }) {
  return <RoutineDetailInner key={routineId} routineId={routineId} />;
}

function RoutineDetailInner({ routineId }: { routineId: string }) {
  const navigate = useApp((s) => s.navigate);
  const session = useApp((s) => s.session);
  const invalidate = useInvalidate();
  const online = useOnline();
  const { run } = useRoutineRun();
  const { run: programRun } = useProgramRun();
  const route = useHashRoute();
  const scheduleCreate = useScheduleCreate();
  const invalidateExtras = useProgramExtras();

  // Long-press drag sensors (§4): hold ~180ms then drag; taps stay taps.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ---------- data ----------
  // difficulty from the ["session"] query (source of truth; store bootstraps).
  const sessionQuery = useSession();
  const storeDifficulty = session?.user.difficulty ?? null;
  const difficulty = (sessionQuery.data?.user?.difficulty ?? storeDifficulty ?? "INTERMEDIATE") as Difficulty;

  const { data: detailData, isLoading, error } = useQuery({
    queryKey: qk.programDetail(routineId, difficulty),
    queryFn: () => programsApi.detail(routineId, difficulty),
    retry: 1,
  });
  const detail: ProgramDetailDTO | null = detailData ?? null;

  const resolvedVariant = detail ? (detail.variant ?? detail.fallbackVariant) : null;
  const variantMissing = !!detail && detail.variant == null && detail.variants.length > 0;
  const phases = useMemo(() => resolvedVariant?.phases ?? [], [resolvedVariant]);
  const phaseCount = phases.length;
  const equipment = useMemo(
    () => (resolvedVariant?.equipment ?? []).map((v) => EQUIPMENT_LABELS[v as Equipment] ?? v),
    [resolvedVariant],
  );

  // follow state — the dashboard carries the active program
  const { data: dashboardData } = useDashboard();
  const active = dashboardData?.active ?? null;
  const followed = active && active.routineId === routineId ? active : null;

  const hasWorkoutDay = phases.some((p) => p.days.some((d) => (d.dayType ?? "WORKOUT") !== "REST"));

  // ---------- ui state ----------
  const [tab, setTab] = useState<"overview" | "program">("overview");
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState(0);
  const [deleteRoutineOpen, setDeleteRoutineOpen] = useState(false);
  const [unfollowOpen, setUnfollowOpen] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [scheduleDay, setScheduleDay] = useState<{ id: string; name: string } | null>(null);
  const [startBusy, setStartBusy] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(
    () => route.query.get("jump") === "1" && route.name === "program-detail",
  );

  // phase selection resets when the variant changes (difficulty switch)
  useEffect(() => {
    setSelectedPhaseIdx(0);
  }, [resolvedVariant?.id]);
  const phaseIdx = Math.min(selectedPhaseIdx, Math.max(0, phaseCount - 1));
  const phase = phases[phaseIdx] ?? null;

  /** Cursor day when following (non-REST), else the first workout day of the variant. */
  const scheduleTargetDay = useMemo<{ id: string; name: string } | null>(() => {
    if (followed && (followed.dayType ?? "WORKOUT") !== "REST") {
      return { id: followed.dayId, name: followed.dayName };
    }
    for (const p of phases) {
      const d = p.days.find((x) => (x.dayType ?? "WORKOUT") !== "REST");
      if (d) return { id: d.id, name: d.name };
    }
    return null;
  }, [followed, phases]);

  const flatDays = useMemo(() => phases.flatMap((p) => p.days), [phases]);

  const openDay = (dayId: string) => navigate(`/days/${dayId}`);

  // ---------- routine-level mutations (⋮ menu — kept from §3.5) ----------
  const copyRoutine = async () => {
    if (!detail) return;
    const ok = await run(() => routinesApi.copy(routineId), {
      path: `/api/routines/${routineId}/copy`,
      method: "POST",
      label: "Duplicate routine",
    });
    if (ok) toast.success(`Duplicated “${detail.name}”`);
  };

  const removeRoutine = async () => {
    const ok = await run(() => routinesApi.remove(routineId), {
      path: `/api/routines/${routineId}`,
      method: "DELETE",
      label: `Deleted ${detail?.name ?? "routine"}`,
    });
    if (ok) {
      invalidate.programs();
      toast.success(`Deleted “${detail?.name ?? "routine"}”`);
      navigate("/programs");
    }
  };

  const unfollowProgram = async () => {
    const res = await programRun(
      () => programsApi.unfollow(),
      { path: "/api/programs/follow", method: "DELETE", label: "Program unfollowed" },
    );
    if (res) {
      invalidateExtras(); // programs + dashboard + schedule + routines families
      invalidate.programDetail(routineId);
      toast.success(`Unfollowed ${detail?.name ?? "program"}`);
    }
  };

  const jumpToDay = async (dayIndex: number) => {
    const res = await programRun(
      () => programsApi.jumpCursor(dayIndex),
      { path: "/api/programs/cursor/jump", method: "POST", body: { dayIndex }, label: "Cursor moved" },
    );
    if (res) toast.success(`Day ${res.dayIndex + 1} · ${res.day.name}`);
  };

  const skipCursorDay = async () => {
    const res = await programRun(
      () => programsApi.skipCursorDay(),
      { path: "/api/programs/cursor/skip", method: "POST", label: "Day skipped" },
    );
    if (res) toast.success(`Skipped ${res.skipped.name} · ${res.day.name} up next`);
  };

  const scheduleRoutineDay = (day: { id: string; name: string }, dateKey: string) => {
    if (!detail) return;
    void scheduleCreate.create({
      date: dateKey,
      routineId,
      dayId: day.id,
      toastLabel: `Scheduled ${detail.name} · ${day.name} for ${formatDayLabel(dateKey)}`,
    });
  };

  // ---------- §4 start program / continue day ----------
  const startProgramFlow = async (phaseIdxToStart: number) => {
    if (startBusy) return;
    if (!online) {
      toast.info("Starting a program needs a connection");
      return;
    }
    setStartBusy(true);
    try {
      await programStartApi.start(routineId, phaseIdxToStart);
      invalidate.session();
      invalidate.programs(); // ["programs"] + ["dashboard"]
      invalidate.schedule();
      invalidate.routines();
      invalidate.programDetail(routineId);
      toast.success("Program started");
      navigate("/workout");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStartBusy(false);
    }
  };

  const onStartClick = () => {
    if (active && active.routineId !== routineId) {
      setStartConfirmOpen(true); // destructive: replaces the current program
      return;
    }
    void startProgramFlow(phaseIdx);
  };

  /** Existing logging flow: start-day → #/session (REST cursor → On Demand). */
  const continueDay = async () => {
    if (!followed || startBusy) return;
    if ((followed.dayType ?? "WORKOUT") === "REST") {
      navigate("/on-demand");
      return;
    }
    if (!online) {
      toast.info("Starting a workout needs a connection");
      return;
    }
    setStartBusy(true);
    try {
      const w = await programsApi.startDay(routineId, followed.dayId ? { dayId: followed.dayId } : {});
      invalidate.workout();
      invalidate.dashboard();
      invalidate.schedule();
      toast.success(`Started ${followed.dayName}`, {
        description: `${w.exercises.length} exercise${w.exercises.length === 1 ? "" : "s"} loaded`,
      });
      navigate("/session");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStartBusy(false);
    }
  };

  // ---------- §4 phase order (drag → PhaseOverride; Reset Order) ----------
  const savePhaseOrder = async (target: ProgramDetailPhaseDTO, dayIds: string[]) => {
    if (!online) {
      toast.info("Reordering days needs a connection");
      return;
    }
    try {
      await phaseOrderApi.put(target.id, dayIds);
      await invalidate.programDetail(routineId);
      toast.success("Order saved");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const resetPhaseOrder = async (target: ProgramDetailPhaseDTO) => {
    if (!online) {
      toast.info("Resetting the order needs a connection");
      return;
    }
    try {
      await phaseOrderApi.reset(target.id);
      await invalidate.programDetail(routineId);
      toast.success("Order reset");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onDragEnd = (target: ProgramDetailPhaseDTO) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = target.days.map((d) => d.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const next = arrayMove(target.days, oldIndex, newIndex).map((d) => d.id);
    void savePhaseOrder(target, next);
  };

  // ---------- Overview data ----------
  const aboutText = useMemo(() => {
    const t = (detail?.description ?? "").trim();
    if (t) return t;
    const tagline = (detail?.tagline ?? "").trim();
    if (tagline) return tagline;
    return (detail?.notes ?? "").trim();
  }, [detail]);
  const aboutPhases = useMemo(
    () => phases.filter((p) => (p.overview ?? "").trim().length > 0),
    [phases],
  );

  // ---------- render helpers ----------
  const renderHeader = () => (
    <>
      <div data-row className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap pl-1">
        <h1 className="min-w-0 flex-1 truncate text-base font-bold leading-none">{detail?.name ?? "Program"}</h1>
        {detail?.isCurrent ? (
          <span
            className="flex h-6 flex-none items-center rounded-full border border-primary/50 bg-primary/5 px-2 text-[10px] font-bold uppercase leading-none text-primary"
            aria-label={`${detail.daysDone} days completed`}
          >
            {detail.daysDone} Days
          </span>
        ) : null}
      </div>
      {variantMissing ? (
        <div
          data-row
          className="flex h-10 w-full flex-none items-center overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-xs text-muted-foreground"
        >
          <span className="truncate">
            Not available at {DIFFICULTY_LABELS[difficulty]} — showing the{" "}
            {DIFFICULTY_LABELS[(resolvedVariant?.difficulty ?? difficulty) as Difficulty] ?? "closest"} version
          </span>
        </div>
      ) : null}
      {phaseCount > 1 ? (
        <div
          data-row
          data-chip-scroller
          role="tablist"
          aria-label="Program phases"
          className="no-scrollbar flex h-8 w-full flex-none items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
        >
          {phases.map((p, i) => {
            const selected = i === phaseIdx;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={`Phase ${i + 1}: ${p.name}`}
                {...tourAttrs({ id: "programDetail.phaseChip", label: "Phase chip", help: "Jump between the phases of this program.", order: 30 })}
                onClick={() => setSelectedPhaseIdx(i)}
                className={cn(
                  "flex h-8 flex-none items-center rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selected
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span className="truncate">P{i + 1} {p.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );

  const renderOverviewTab = () => (
    <>
      <SectionHeader label="Highlights" />
      <div className="flex flex-col">
        <div data-row className="flex h-10 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/50 px-1 text-sm">
          <span className="min-w-0 flex-1 truncate">Days per week</span>
          <span className="flex-none font-semibold text-muted-foreground">{resolvedVariant?.daysPerWeek ?? "—"}</span>
        </div>
        {equipment.length > 0 ? (
          <>
            <button
              data-row
              type="button"
              aria-expanded={equipmentOpen}
              aria-label={`Equipment — ${equipment.length} items`}
              {...tourAttrs({ id: "programDetail.equipment", label: "Equipment", help: "Expand the equipment list for this program.", order: 40 })}
              onClick={() => setEquipmentOpen((o) => !o)}
              className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/50 px-1 text-left text-sm transition-colors hover:bg-accent/40"
            >
              <span className="min-w-0 flex-1 truncate">Equipment</span>
              <span className="flex-none font-semibold text-muted-foreground">{equipment.length} items</span>
              <ChevronDown
                className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", equipmentOpen ? "" : "-rotate-90")}
                aria-hidden
              />
            </button>
            {equipmentOpen
              ? equipment.map((label) => (
                  <div
                    key={label}
                    data-row
                    className="flex h-8 items-center overflow-hidden whitespace-nowrap pl-4 pr-1 text-xs text-muted-foreground"
                  >
                    <span className="truncate">{label}</span>
                  </div>
                ))
              : null}
          </>
        ) : null}
        {phases.map((p, i) => (
          <div
            key={p.id}
            data-row
            className="flex h-10 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/50 px-1 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">
              Phase {i + 1} · {p.name}
            </span>
            {p.minutesMin != null && p.minutesMax != null ? (
              <span className="flex-none font-semibold text-muted-foreground">
                {p.minutesMin}-{p.minutesMax} min
              </span>
            ) : null}
          </div>
        ))}
      </div>

      {aboutText ? (
        <>
          <SectionHeader label="About" />
          <p className="whitespace-normal px-1 text-sm leading-relaxed text-foreground">{aboutText}</p>
          {aboutPhases.map((p) => (
            <div key={p.id} className="flex flex-col gap-1">
              <p className="px-1 text-sm font-semibold leading-none">
                Phase {p.idx + 1} — {p.name}
              </p>
              <p className="whitespace-normal px-1 text-sm leading-relaxed text-muted-foreground">{p.overview}</p>
            </div>
          ))}
        </>
      ) : null}
    </>
  );

  const renderProgramTab = () => (
    <>
      <div data-row className="flex h-10 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap px-1">
        <span className="min-w-0 flex-1 truncate text-sm font-bold leading-none">Preview — Phase {phaseIdx + 1}</span>
        {phase?.hasPhaseOverride ? (
          <button
            type="button"
            aria-label="Reset the day order for this phase"
            {...tourAttrs({ id: "programDetail.resetOrder", label: "Reset Order", help: "Restore the template day order for this phase.", order: 60 })}
            onClick={() => phase && void resetPhaseOrder(phase)}
            className="flex h-8 flex-none items-center rounded-md px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Reset Order
          </button>
        ) : null}
      </div>
      {phase && phase.days.length > 0 ? (
        phase.isImplicit ? (
          // Implicit phase (variant-less custom program): no PhaseOverride target.
          <div className="flex flex-col gap-2">
            {phase.days.map((d, i) => (
              <ProgramDayRow
                key={d.id}
                day={d}
                index={i}
                minutes={minutesOf(d, phase)}
                handle={<StaticGrip />}
                onOpen={openDay}
              />
            ))}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd(phase)}>
            <SortableContext items={phase.days.map((d) => d.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {phase.days.map((d, i) => (
                  <SortableProgramDayRow key={d.id} day={d} index={i} minutes={minutesOf(d, phase)} onOpen={openDay} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )
      ) : (
        <div className="flex h-[200px] flex-none flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
          <p className="text-sm font-semibold">No days in this phase</p>
          <p className="max-w-[280px] text-center text-xs text-muted-foreground">
            Build this program&apos;s training days in the Builder.
          </p>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            tour={{ id: "programDetail.openBuilder", label: "Open Builder", help: "Open this program in the Builder to add days.", order: 130, when: ["empty"] }}
            onClick={() => navigate(`/builder/program/${routineId}`)}
          >
            <Hammer className="h-4 w-4" aria-hidden />
            Open in Builder
          </Button>
        </div>
      )}
    </>
  );

  /** ?jump=1 deep link — REPLACES the tab content (kept from §3.5). */
  const renderJumpList = () => (
    <div className="flex flex-col gap-2" aria-label="Jump to day">
      <SectionHeader label="Jump to day" />
      {flatDays.map((day, index) => {
        const isRest = (day.dayType ?? "WORKOUT") === "REST";
        const isCurrent = !!followed && index === followed.cursorDayIndex;
        return (
          <button
            key={day.id}
            type="button"
            data-row
            aria-label={`Jump to Day ${index + 1} · ${day.name}`}
            aria-current={isCurrent ? "true" : undefined}
            {...tourAttrs({ id: "programDetail.jumpRow", label: "Day row", help: "Move the program cursor to this day.", order: 90 })}
            onClick={() => {
              setJumpOpen(false);
              void jumpToDay(index);
            }}
            className={cn(
              "flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border px-3 text-left text-sm transition-colors",
              isCurrent
                ? "border-primary/60 bg-primary/10"
                : "border-border bg-card hover:border-primary/40 hover:bg-accent/40",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
          >
            <span className="w-14 flex-none text-xs font-semibold text-muted-foreground">Day {index + 1}</span>
            {isRest ? (
              <Moon className="h-4 w-4 flex-none text-muted-foreground/70" aria-hidden />
            ) : (
              <Dumbbell className="h-4 w-4 flex-none text-primary" aria-hidden />
            )}
            <span className={cn("min-w-0 flex-1 truncate font-medium", isRest && "text-muted-foreground")}>{day.name}</span>
            <span
              className={cn(
                "flex h-6 flex-none items-center rounded-full border px-2 text-[10px] font-bold uppercase leading-none",
                isRest ? "border-border text-muted-foreground" : "border-primary/40 text-primary",
              )}
            >
              {isRest ? "Rest" : "Workout"}
            </span>
            {isCurrent ? <Check className="h-4 w-4 flex-none text-primary" aria-label="Current day" /> : null}
          </button>
        );
      })}
      <Button
        type="button"
        variant="outline"
        className="h-11 flex-none"
        tour={{ skipTour: true, reason: "Cancel row inside the jump-to-day list" }}
        onClick={() => setJumpOpen(false)}
      >
        Cancel
      </Button>
    </div>
  );

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/programs" label="Back to Programs" />}
          title={detail ? detail.name : "Program"}
          actions={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 flex-none"
                    aria-label="More actions"
                    tour={{ id: "programDetail.menu", label: "Program menu", help: "Edit in Builder, schedule, skip, jump, unfollow, copy or delete.", order: 50 }}
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => navigate(`/builder/program/${routineId}`)}>
                    <Hammer className="h-4 w-4" aria-hidden /> Edit in Builder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!scheduleTargetDay}
                    onClick={() => scheduleTargetDay && setScheduleDay(scheduleTargetDay)}
                  >
                    <CalendarClock className="h-4 w-4" aria-hidden /> Schedule day…
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!followed} onClick={() => void skipCursorDay()}>
                    <SkipForward className="h-4 w-4" aria-hidden /> Skip day
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!followed} onClick={() => setJumpOpen((o) => !o)}>
                    <ArrowDownUp className="h-4 w-4" aria-hidden /> Jump to day…
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!followed} onClick={() => setUnfollowOpen(true)}>
                    <StarOff className="h-4 w-4" aria-hidden /> Unfollow
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void copyRoutine()}>
                    <Copy className="h-4 w-4" aria-hidden /> Copy
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteRoutineOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        <SubBar>
          {/* Segmented halves — the repo's proven border-frame pattern (records-tab):
              grid + h-full cells; NO inner padding so buttons never overflow the
              40px row (p-1 + h-8 cells overflow the border-box by 2px → nowrapFail). */}
          <div
            data-row
            role="tablist"
            aria-label="Program views"
            className="grid h-10 w-full grid-cols-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card"
          >
            {(["overview", "program"] as const).map((t) => {
              const selected = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  {...tourAttrs(
                    t === "overview"
                      ? { id: "programDetail.tabOverview", label: "Overview tab", help: "Highlights, equipment and the program's about text.", order: 10 }
                      : { id: "programDetail.tabProgram", label: "Program tab", help: "Preview and reorder the days of each phase.", order: 20 },
                  )}
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex h-full min-w-0 items-center justify-center overflow-hidden text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none",
                    selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <span className="truncate">{t === "overview" ? "Overview" : "Program"}</span>
                </button>
              );
            })}
          </div>
        </SubBar>
      }
      bottomBar={
        detail ? (
          <BottomBar>
            {followed ? (
              (followed.dayType ?? "WORKOUT") === "REST" ? (
                <Button
                  type="button"
                  className="h-11 w-full gap-1.5 whitespace-nowrap text-sm font-bold"
                  aria-label="Train anyway on this rest day"
                  tour={{ id: "programDetail.trainAnyway", label: "Train anyway", help: "Pick a ready session to train on a rest day.", order: 120 }}
                  onClick={() => navigate("/on-demand")}
                >
                  Train anyway
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-11 w-full gap-1.5 whitespace-nowrap text-sm font-bold"
                  disabled={startBusy}
                  aria-label={`Continue day ${followed.cursorDayIndex + 1} of ${followed.dayCount}`}
                  tour={{ id: "programDetail.continue", label: "Continue", help: "Start today's session and jump to the logger.", order: 110 }}
                  onClick={() => void continueDay()}
                >
                  {startBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden />
                  )}
                  Continue — Day {followed.cursorDayIndex + 1}
                </Button>
              )
            ) : hasWorkoutDay ? (
              <Button
                type="button"
                className="h-11 w-full gap-1.5 whitespace-nowrap text-sm font-bold"
                disabled={startBusy}
                aria-label={`Start this program at phase ${phaseIdx + 1}`}
                tour={{ id: "programDetail.start", label: "Start program", help: "Follow this program from the selected phase and build your schedule.", order: 100 }}
                onClick={onStartClick}
              >
                {startBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Play className="h-4 w-4" aria-hidden />
                )}
                Start program — Phase {phaseIdx + 1}
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled
                    className="h-11 w-full gap-1.5 whitespace-nowrap text-sm font-bold"
                    aria-label="Start program disabled — needs a workout day"
                    tour={{ skipTour: true, reason: "Disabled start; program has no workout day" }}
                  >
                    Start program
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Needs at least one workout day</TooltipContent>
              </Tooltip>
            )}
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
              onClick={() => navigate("/programs")}
            >
              Back to programs
            </Button>
          </div>
        ) : isLoading || !detail ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading program">
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-10 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : (
          <>
            {renderHeader()}
            {jumpOpen && followed ? renderJumpList() : tab === "overview" ? renderOverviewTab() : renderProgramTab()}

            {/* day scheduling (⋮ "Schedule day…") */}
            <DatePickerDialog
              open={scheduleDay != null}
              onOpenChange={(o) => !o && setScheduleDay(null)}
              initialKey={todayKey()}
              title={`Schedule ${scheduleDay?.name ?? "day"}`}
              description={`Which date should ${detail.name} · ${scheduleDay?.name ?? "this day"} land on?`}
              onSelect={(dayKey) => {
                const day = scheduleDay;
                setScheduleDay(null);
                if (day) scheduleRoutineDay(day, dayKey);
              }}
            />
            {scheduleCreate.conflictDialog}
          </>
        )}
      </ScrollBody>

      {/* confirm-destructive: program delete */}
      <AlertDialog open={deleteRoutineOpen} onOpenChange={(o) => !o && setDeleteRoutineOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete program?</AlertDialogTitle>
            <AlertDialogDescription>
              “{detail?.name}” and its days will be removed. Logged workouts stay untouched. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setDeleteRoutineOpen(false);
                void removeRoutine();
              }}
            >
              Delete program
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* confirm: unfollow the program */}
      <AlertDialog open={unfollowOpen} onOpenChange={(o) => !o && setUnfollowOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unfollow {detail?.name ?? "this program"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Your followed-program card and day rollover stop updating. Logged workouts stay untouched —
              you can follow again any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setUnfollowOpen(false);
                void unfollowProgram();
              }}
            >
              Unfollow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* §4 destructive confirm: replace the current program */}
      <AlertDialog open={startConfirmOpen} onOpenChange={(o) => !o && setStartConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace current program?</AlertDialogTitle>
            <AlertDialogDescription>Your current program progress will restart.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setStartConfirmOpen(false);
                void startProgramFlow(phaseIdx);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
