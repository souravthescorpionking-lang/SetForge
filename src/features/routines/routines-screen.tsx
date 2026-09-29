"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProgramsScreen — #/programs (Part 5 list + Part 6 §4.4/§4.8 catalog).
//
//   TopBar (56)  : "Programs" · `+` DropdownMenu → New routine · New session ·
//                  Program builder (§6 stub route) · Session from today's
//                  workout · `⋮ Dictionary` (Sessions tab only, §4.8) ·
//                  `Select`⇄`Done` (Routines tab, §4.4 multi-delete)
//   SubBar (48)  : ROUTINES tab → tabs `Routines | Sessions` (?tab= deep link)
//                  SESSIONS tab → search input + 44px "Routines" back chip
//                  (§4.8: the SubBar becomes the search row while browsing
//                  the sessions catalog)
//   ScrollBody   : ROUTINES — ChipRow 40 (All · Beginner · Intermediate ·
//                  Advanced · Favourites · Labels ▾ [+ multi-select row]) ·
//                  section headers 32 per difficulty (All view; uncategorised
//                  last) · 72px RoutineRows (name / §4.4 meta line |
//                  Follow 96px · favourite star 44px · ⋮) · desktop 2-col grid
//                  SESSIONS — ChipRow 40 (All · Favourites · Mine · ≤20/40/60m
//                  · Muscle ▾ · Equipment ▾ · Labels ▾) · 72px SessionRows
//                  (name / `~30 min · 5 exercises · Chest, Triceps` + dots |
//                  Start 72px · star · ⋮ Schedule/History/Mark off/Edit/Copy/
//                  Delete)
//   BottomBar    : Select mode only — destructive `Delete {n}` (AlertDialog
//                  confirm; Esc or `Done` exits select mode)
//
// All Part 5 behaviours (create/copy/delete, follow + replace confirm,
// session start, schedule picker, session-from-workout dialog) are intact.
// Metadata (difficulty/phases/daysPerWeek/estMinutes/highlights/isFavorite/
// labels) is joined from routinesApi.list() — null-safe: agent 6-c0 seeds it
// in parallel and the UI degrades to the used-ago line without it.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { tourAttrs } from "@/lib/tour/attrs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Copy,
  Dumbbell,
  Hammer,
  History,
  Layers,
  ListChecks,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { programsApi, programsMetaApi, routinesApi } from "@/lib/client/api";
import { qk, useDashboard, useInvalidate, useOnline, usePrograms, useWorkoutByDate } from "@/lib/client/query";
import { queueMutation } from "@/lib/client/offline";
import type { ProgramSummaryDTO, RoutineDTO, RoutineDayDTO } from "@/lib/types";
import { MUSCLE_LABELS, DIFFICULTIES, type Muscle } from "@/lib/constants";
import { todayKey } from "@/lib/client/format";
import { MuscleDots } from "@/components/shared/muscle-dots";
import { useHashRoute } from "@/features/shell/router";
import { DatePickerDialog, useScheduleCreate } from "@/features/schedule/schedule-shared";
import { InlineInput, errorMessage, usedAgoFromDayKey, useProgramRun, useRoutineRun } from "./screen-helpers";
import { useSessionFromWorkout } from "./session-dialog";
import { DifficultyPill, difficultyLabel, formatProgramMeta, useProgramExtras, unmarkDayOffFull } from "./program-meta";

type Tab = "routines" | "sessions";

/** §4.4 primary chip values (routines tab). */
type RoutineChip = "ALL" | (typeof DIFFICULTIES)[number];
/** §4.8 primary chip values (sessions tab). */
type SessionChip = "ALL" | "FAVOURITES" | "MINE" | "M20" | "M40" | "M60";
/** §4.8 secondary dropdown rows. */
type SessionFacet = "muscle" | "equipment" | "labels" | null;

const ROW_CLS =
  "flex h-18 cursor-pointer select-none items-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border bg-card pl-2 pr-1 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const chipClass = (active: boolean) =>
  cn(
    "flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
    active
      ? "border-primary/60 bg-primary/10 text-primary"
      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
  );

const CHIP_ROW_CLS =
  "no-scrollbar flex h-10 w-full flex-none items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap";

const sessionMuscleLabel = (m: string) => MUSCLE_LABELS[m as Muscle] ?? m;

function SectionHeader({ label, span }: { label: string; span?: boolean }) {
  return (
    <p
      className={cn(
        "flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground",
        span && "lg:col-span-2",
      )}
    >
      <span className="truncate">{label}</span>
    </p>
  );
}

/** §4.4/§4.8 multi-select chip row (labels · muscles · equipment). */
function FacetChipRow({
  options,
  selected,
  labelOf,
  onToggle,
  span,
  ariaLabel,
}: {
  options: string[];
  selected: Set<string>;
  labelOf: (v: string) => string;
  onToggle: (v: string) => void;
  span?: boolean;
  ariaLabel: string;
}) {
  if (options.length === 0) return null;
  return (
    <div
      data-row
      data-chip-scroller
      role="group"
      aria-label={ariaLabel}
      className={cn(CHIP_ROW_CLS, span && "lg:col-span-2")}
    >
      {options.map((v) => {
        const active = selected.has(v);
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            className={chipClass(active)}
            {...tourAttrs({ skipTour: true, reason: "Data-driven facet chips for labels, muscles, equipment" })}
            onClick={() => onToggle(v)}
          >
            {active ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
            {labelOf(v)}
          </button>
        );
      })}
    </div>
  );
}

export default function RoutinesScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const route = useHashRoute();
  const online = useOnline();
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const { run } = useRoutineRun();
  const { run: programRun } = useProgramRun();
  const sessionFromWorkout = useSessionFromWorkout();
  const scheduleCreate = useScheduleCreate();
  const invalidateExtras = useProgramExtras();

  // ---------- tab state (?tab= deep link from Home's "Log another session") ----------
  const tabParam = route.name === "programs" ? route.query.get("tab") : null;
  const [tab, setTab] = useState<Tab>(tabParam === "sessions" ? "sessions" : "routines");
  // adjust tab during render when the deep-link param changes (no effect → no cascading renders)
  const [prevParam, setPrevParam] = useState(tabParam);
  if (tabParam !== prevParam) {
    setPrevParam(tabParam);
    setTab(tabParam === "sessions" ? "sessions" : "routines");
  }

  // ---------- data ----------
  const kind = tab === "sessions" ? "SESSION" : "ROUTINE";
  const programsQuery = usePrograms(kind);
  const programs = useMemo(
    () => [...(programsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [programsQuery.data],
  );

  // full routine payloads — session set-count join + §4.4/§4.8 metadata
  const routinesQuery = useQuery({ queryKey: qk.routines, queryFn: () => routinesApi.list() });
  const routinesById = useMemo(() => {
    const m = new Map<string, RoutineDTO>();
    for (const r of routinesQuery.data?.routines ?? []) m.set(r.id, r);
    return m;
  }, [routinesQuery.data]);

  const dashboard = useDashboard();
  const followed = dashboard.data?.active ?? null;

  const todayDateKey = dashboard.data?.today.date ?? todayKey();
  const todayWorkoutQuery = useWorkoutByDate(todayDateKey);
  const todayWorkout = todayWorkoutQuery.data?.workout ?? null;

  // ---------- ui state ----------
  const [creating, setCreating] = useState<"ROUTINE" | "SESSION" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProgramSummaryDTO | null>(null);
  const [followTarget, setFollowTarget] = useState<ProgramSummaryDTO | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<ProgramSummaryDTO | null>(null);

  // §4.4 — routines filters + select mode
  const [routineChip, setRoutineChip] = useState<RoutineChip>("ALL");
  const [favOnly, setFavOnly] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteManyOpen, setDeleteManyOpen] = useState(false);

  // §4.8 — sessions search + filters
  const [searchInput, setSearchInput] = useState("");
  const [sessionChip, setSessionChip] = useState<SessionChip>("ALL");
  const [sessionFacet, setSessionFacet] = useState<SessionFacet>(null);
  const [selectedMuscles, setSelectedMuscles] = useState<Set<string>>(new Set());
  const [selectedEquipment, setSelectedEquipment] = useState<Set<string>>(new Set());
  const [selectedSessionLabels, setSelectedSessionLabels] = useState<Set<string>>(new Set());
  const [sessionScheduleTarget, setSessionScheduleTarget] = useState<ProgramSummaryDTO | null>(null);

  // Esc exits select mode (§4.4)
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectMode(false);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode]);

  const switchTab = (t: Tab) => {
    if (t !== "routines") {
      setSelectMode(false);
      setSelectedIds(new Set());
    }
    setTab(t);
  };

  // ---------- mutations ----------
  const createProgram = async (name: string, programKind: "ROUTINE" | "SESSION") => {
    if (!name) return;
    const ok = await run(() => routinesApi.create({ name, kind: programKind }), {
      path: "/api/routines",
      method: "POST",
      body: { name, kind: programKind },
      label: `Created ${name}`,
    });
    if (ok) {
      invalidate.programs();
      toast.success(
        programKind === "SESSION" ? `Session “${name}” created` : `Routine “${name}” created`,
      );
    }
  };

  const copyProgram = async (program: ProgramSummaryDTO) => {
    const ok = await run(() => routinesApi.copy(program.id), {
      path: `/api/routines/${program.id}/copy`,
      method: "POST",
      label: "Duplicate program",
    });
    if (ok) {
      invalidate.programs();
      toast.success(`Duplicated “${program.name}”`);
    }
  };

  const deleteProgram = async (program: ProgramSummaryDTO) => {
    const ok = await run(() => routinesApi.remove(program.id), {
      path: `/api/routines/${program.id}`,
      method: "DELETE",
      label: `Deleted ${program.name}`,
    });
    if (ok) {
      invalidate.programs();
      toast.success(`Deleted “${program.name}”`);
    }
  };

  const followProgram = async (program: ProgramSummaryDTO) => {
    const res = await programRun(
      () => programsApi.follow(program.id),
      {
        path: `/api/programs/${program.id}/follow`,
        method: "POST",
        body: {},
        label: `Following ${program.name}`,
      },
    );
    if (res) toast.success(`Following ${program.name} · Day ${res.dayIndex + 1}`);
  };

  const onFollowClick = (program: ProgramSummaryDTO) => {
    if (followed && followed.routineId !== program.id) {
      setFollowTarget(program); // destructive: replaces the current follow
      return;
    }
    void followProgram(program);
  };

  const startSession = async (program: ProgramSummaryDTO) => {
    if (!online) {
      toast.info("Starting a session needs a connection");
      return;
    }
    try {
      await programsApi.startDay(program.id);
      invalidate.workout();
      invalidate.dashboard();
      invalidate.schedule();
      toast.success(`Started ${program.name}`);
      navigate("/today");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // §4.4 — routine favourite star: optimistic patch of the routines cache
  const toggleRoutineFavourite = async (program: ProgramSummaryDTO) => {
    const current = routinesById.get(program.id)?.isFavorite ?? false;
    const next = !current;
    qc.setQueryData<{ routines: RoutineDTO[] }>(qk.routines, (old) =>
      old
        ? { ...old, routines: old.routines.map((r) => (r.id === program.id ? { ...r, isFavorite: next } : r)) }
        : old,
    );
    const path = `/api/programs/${program.id}/meta`;
    const body = { isFavorite: next };
    if (!online) {
      queueMutation(path, "PUT", body, next ? "Added to favourites" : "Removed from favourites");
      toast.info(`${next ? "Added to favourites" : "Removed from favourites"} — saved offline, will sync when reconnected`);
      return;
    }
    try {
      await programsMetaApi.update(program.id, body);
      invalidate.routines();
      toast.success(next ? `“${program.name}” added to favourites` : `“${program.name}” removed from favourites`);
    } catch (e) {
      invalidate.routines();
      toast.error(errorMessage(e));
    }
  };

  // §4.4 — select mode bulk delete (destructive confirm)
  const deleteSelected = async () => {
    const ids = [...selectedIds];
    let ok = 0;
    for (const id of ids) {
      const done = await run(() => routinesApi.remove(id), {
        path: `/api/routines/${id}`,
        method: "DELETE",
        label: "Routine deleted",
      });
      if (done) ok += 1;
    }
    if (ok > 0) {
      invalidate.programs();
      invalidateExtras();
      toast.success(`Deleted ${ok} ${ok === 1 ? "routine" : "routines"}`);
    }
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  // §4.8 — session ⋮ "Mark off" on the session's single workout day
  const sessionWorkoutDay = (program: ProgramSummaryDTO): RoutineDayDTO | null => {
    const r = routinesById.get(program.id);
    if (!r) return null;
    return r.days.find((d) => (d.dayType ?? "WORKOUT") === "WORKOUT") ?? null;
  };

  const markSessionOff = async (program: ProgramSummaryDTO) => {
    const day = sessionWorkoutDay(program);
    if (!day) {
      toast.info("This session has no workout day to mark off");
      return;
    }
    if (!online) {
      toast.info("Marking a session off needs a connection");
      return;
    }
    try {
      const res = await programsMetaApi.markOff(program.id, day.id);
      invalidateExtras(program.id);
      toast.success(`Session marked off${res.advanced ? " · program advanced" : ""}`, {
        action: {
          label: "Undo",
          onClick: () => {
            void (async () => {
              try {
                await unmarkDayOffFull(program.id, day.id);
                invalidateExtras(program.id);
                toast.success("Session unmarked");
              } catch (e) {
                toast.error(errorMessage(e));
              }
            })();
          },
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // ---------- §4.4 filtering + grouping ----------
  const allLabels = useMemo(() => {
    const s = new Set<string>();
    for (const r of routinesQuery.data?.routines ?? []) {
      if ((r.kind ?? "ROUTINE") !== "ROUTINE") continue;
      for (const l of r.labels ?? []) s.add(l);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [routinesQuery.data]);

  const visibleRoutines = useMemo(() => {
    return programs.filter((p) => {
      const meta = routinesById.get(p.id);
      if (routineChip !== "ALL" && (meta?.difficulty ?? null) !== routineChip) return false;
      if (favOnly && !(meta?.isFavorite ?? false)) return false;
      if (selectedLabels.size > 0) {
        const labels = meta?.labels ?? [];
        if (![...selectedLabels].some((l) => labels.includes(l))) return false;
      }
      return true;
    });
  }, [programs, routinesById, routineChip, favOnly, selectedLabels]);

  /** grouped sections (only in the All view; uncategorised last) */
  const routineSections = useMemo<
    Array<{ key: string; label: string | null; items: ProgramSummaryDTO[] }>
  >(() => {
    if (routineChip !== "ALL") {
      return [{ key: routineChip, label: null, items: visibleRoutines }];
    }
    const sections: Array<{ key: string; label: string | null; items: ProgramSummaryDTO[] }> =
      DIFFICULTIES.map((d) => ({
        key: d,
        label: difficultyLabel(d),
        items: visibleRoutines.filter((p) => (routinesById.get(p.id)?.difficulty ?? null) === d),
      })).filter((s) => s.items.length > 0);
    const uncategorised = visibleRoutines.filter(
      (p) => !(routinesById.get(p.id)?.difficulty ?? null),
    );
    if (uncategorised.length > 0) {
      sections.push({ key: "UNCATEGORISED", label: "Uncategorised", items: uncategorised });
    }
    return sections;
  }, [routineChip, visibleRoutines, routinesById]);

  // ---------- §4.8 sessions catalog filtering ----------

  const sessionsMeta = useMemo(() => {
    // per-session derived: estMinutes · single-day muscles · equipment · labels
    const m = new Map<string, { est: number | null; muscles: string[]; equipment: string[]; labels: string[] }>();
    for (const p of programs) {
      const r = routinesById.get(p.id);
      const day = r?.days.find((d) => (d.dayType ?? "WORKOUT") === "WORKOUT") ?? null;
      const est = r?.estMinutes ?? day?.estMinutes ?? null;
      const muscles = (day?.primaryMuscles ?? []).filter((x) => x);
      const equipment = [...new Set((day?.exercises ?? []).flatMap((re) => re.exercise.equipment ?? []))];
      m.set(p.id, { est, muscles, equipment, labels: r?.labels ?? [] });
    }
    return m;
  }, [programs, routinesById]);

  const sessionMuscleOptions = useMemo(() => {
    const s = new Set<string>();
    for (const v of sessionsMeta.values()) for (const m of v.muscles) s.add(m);
    return [...s].sort((a, b) => sessionMuscleLabel(a).localeCompare(sessionMuscleLabel(b)));
  }, [sessionsMeta]);

  const sessionEquipmentOptions = useMemo(() => {
    const s = new Set<string>();
    for (const v of sessionsMeta.values()) for (const e of v.equipment) s.add(e);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [sessionsMeta]);

  const sessionLabelOptions = useMemo(() => {
    const s = new Set<string>();
    for (const v of sessionsMeta.values()) for (const l of v.labels) s.add(l);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [sessionsMeta]);

  const visibleSessions = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return programs.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !(p.notes ?? "").toLowerCase().includes(q)) return false;
      const meta = sessionsMeta.get(p.id);
      if (sessionChip === "FAVOURITES" && !(routinesById.get(p.id)?.isFavorite ?? false)) return false;
      if (sessionChip === "M20" && (meta?.est == null || meta.est > 20)) return false;
      if (sessionChip === "M40" && (meta?.est == null || meta.est > 40)) return false;
      if (sessionChip === "M60" && (meta?.est == null || meta.est > 60)) return false;
      if (selectedMuscles.size > 0) {
        const ms = meta?.muscles ?? [];
        if (![...selectedMuscles].some((m) => ms.includes(m))) return false;
      }
      if (selectedEquipment.size > 0) {
        const es = meta?.equipment ?? [];
        if (![...selectedEquipment].some((e) => es.includes(e))) return false;
      }
      if (selectedSessionLabels.size > 0) {
        const ls = meta?.labels ?? [];
        if (![...selectedSessionLabels].some((l) => ls.includes(l))) return false;
      }
      return true; // "Mine" and "All" — sessions are per-user (§4.8)
    });
  }, [programs, searchInput, sessionChip, sessionsMeta, routinesById, selectedMuscles, selectedEquipment, selectedSessionLabels]);

  const sessionFacetOptions: Record<Exclude<SessionFacet, null>, string[]> = {
    muscle: sessionMuscleOptions,
    equipment: sessionEquipmentOptions,
    labels: sessionLabelOptions,
  };

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (v: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  const clearSessionFilters = () => {
    setSearchInput("");
    setSessionChip("ALL");
    setSessionFacet(null);
    setSelectedMuscles(new Set());
    setSelectedEquipment(new Set());
    setSelectedSessionLabels(new Set());
  };

  // ---------- rows ----------
  const renderStar = (program: ProgramSummaryDTO, isFav: boolean) => (
    <Button
      type="button"
      variant="ghost"
      className={cn("h-11 w-11 flex-none p-0", isFav && "text-amber-500 hover:text-amber-500")}
      aria-pressed={isFav}
      aria-label={isFav ? `Unfavourite ${program.name}` : `Favourite ${program.name}`}
      tour={{ id: "programs.favourite", label: "Favourite", help: "Star the program to find it faster.", order: 120 }}
      onClick={(e) => {
        e.stopPropagation();
        void toggleRoutineFavourite(program);
      }}
    >
      <Star className="h-5 w-5" aria-hidden fill={isFav ? "currentColor" : "none"} />
    </Button>
  );

  const renderOverflowMenu = (program: ProgramSummaryDTO, isSession: boolean) => (
    <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-11 p-0"
            aria-label={`Actions for ${program.name}`}
            tour={{ id: "programs.rowMenu", label: "Row menu", help: "Edit, schedule, copy, mark off or delete.", order: 130 }}
          >
            <MoreVertical className="h-5 w-5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {isSession ? (
            <>
              <DropdownMenuItem onClick={() => setSessionScheduleTarget(program)}>
                <CalendarClock className="h-4 w-4" aria-hidden /> Schedule…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/history?routineId=${program.id}`)}>
                <History className="h-4 w-4" aria-hidden /> History
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void markSessionOff(program)}>
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Mark off
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/programs/${program.id}`)}>
                <Pencil className="h-4 w-4" aria-hidden /> Edit
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={() => navigate(`/programs/${program.id}`)}>
                <Pencil className="h-4 w-4" aria-hidden /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setScheduleTarget(program)}>
                <CalendarClock className="h-4 w-4" aria-hidden /> Schedule…
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onClick={() => void copyProgram(program)}>
            <Copy className="h-4 w-4" aria-hidden /> Copy
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteTarget(program)}
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );

  const renderRoutineRow = (program: ProgramSummaryDTO) => {
    const isFollowed = !!program.isFollowed;
    const hasWorkoutDay = program.dayCount - program.restCount > 0;
    const cursor = program.cursor ?? null;
    const meta = routinesById.get(program.id);
    const isFav = meta?.isFavorite ?? false;
    const metaLine = formatProgramMeta({
      difficulty: meta?.difficulty ?? null,
      daysPerWeek: meta?.daysPerWeek ?? null,
      phaseCount: meta?.phases?.length ?? null,
      estMinutes: meta?.estMinutes ?? null,
      usedAgo: usedAgoFromDayKey(program.lastUsedAt),
    });
    const selected = selectedIds.has(program.id);

    return (
      <div
        key={program.id}
        data-row
        role="button"
        tabIndex={0}
        aria-label={`${program.name} — ${program.dayCount} days, ${program.exerciseCount} exercises, ${usedAgoFromDayKey(program.lastUsedAt)}`}
        aria-pressed={selectMode ? selected : undefined}
        {...tourAttrs({ id: "programs.row", label: "Routine row", help: "Open the routine to see and edit its days.", order: 80 })}
        className={cn(ROW_CLS, selectMode && selected && "border-primary/60 bg-primary/5")}
        onClick={() => {
          if (selectMode) {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (next.has(program.id)) next.delete(program.id);
              else next.add(program.id);
              return next;
            });
            return;
          }
          navigate(`/programs/${program.id}`);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (selectMode) {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(program.id)) next.delete(program.id);
                else next.add(program.id);
                return next;
              });
            } else {
              navigate(`/programs/${program.id}`);
            }
          }
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span className="truncate text-sm font-semibold leading-none">{program.name}</span>
          <span className="truncate text-xs leading-none text-muted-foreground">{metaLine}</span>
        </div>
        {selectMode ? (
          <span
            className="flex h-11 w-[96px] flex-none items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={selected}
              aria-label={`Select ${program.name}`}
              className="h-6 w-6"
              {...tourAttrs({ skipTour: true, reason: "Row checkbox inside bulk-select mode rows" })}
              onCheckedChange={() => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(program.id)) next.delete(program.id);
                  else next.add(program.id);
                  return next;
                });
              }}
            />
          </span>
        ) : (
          <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
            {hasWorkoutDay ? (
              <Button
                type="button"
                variant={isFollowed ? "default" : "outline"}
                className={cn(
                  "h-11 w-[96px] flex-none gap-1 whitespace-nowrap px-1.5 font-bold",
                  cursor ? "text-[10px]" : "text-xs",
                )}
                aria-pressed={isFollowed}
                aria-label={
                  isFollowed
                    ? `Following ${program.name}${cursor ? ` · Day ${cursor.dayIndex + 1} of ${cursor.dayCount}` : ""}`
                    : `Follow ${program.name}`
                }
                tour={{ id: "programs.follow", label: "Follow", help: "Make this routine drive your daily workouts.", order: 100 }}
                onClick={() => onFollowClick(program)}
              >
                {isFollowed ? (
                  cursor ? (
                    `Following · ${cursor.dayIndex + 1}/${cursor.dayCount}`
                  ) : (
                    <>
                      <Check className="h-4 w-4" aria-hidden />
                      Following
                    </>
                  )
                ) : (
                  "Follow"
                )}
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled
                    className="h-11 w-[96px] flex-none whitespace-nowrap px-2 text-xs font-bold"
                    aria-label="Follow disabled — needs a workout day"
                    tour={{ skipTour: true, reason: "Disabled follow; routine has no workout day" }}
                  >
                    Follow
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Needs at least one workout day</TooltipContent>
              </Tooltip>
            )}
          </span>
        )}
        {selectMode ? null : renderStar(program, isFav)}
        {renderOverflowMenu(program, false)}
      </div>
    );
  };

  const renderSessionRow = (program: ProgramSummaryDTO) => {
    const routine = routinesById.get(program.id);
    const meta = sessionsMeta.get(program.id);
    const isFav = routine?.isFavorite ?? false;
    const parts: string[] = [];
    if (meta?.est != null && meta.est > 0) parts.push(`~${meta.est} min`);
    parts.push(`${program.exerciseCount} ${program.exerciseCount === 1 ? "exercise" : "exercises"}`);
    const muscles = meta?.muscles ?? [];
    if (muscles.length > 0) {
      parts.push(muscles.map((m) => sessionMuscleLabel(m)).join(", "));
    }

    return (
      <div
        key={program.id}
        data-row
        role="button"
        tabIndex={0}
        aria-label={`${program.name} — ${program.exerciseCount} exercises, ${usedAgoFromDayKey(program.lastUsedAt)}`}
        {...tourAttrs({ id: "programs.sessionRow", label: "Session row", help: "Open the session to see its exercises.", order: 90 })}
        className={ROW_CLS}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input, a, [role=menuitem]")) return;
          navigate(`/programs/${program.id}`);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/programs/${program.id}`);
          }
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span className="truncate text-sm font-semibold leading-none">{program.name}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs leading-none text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{parts.join(" · ")}</span>
            <MuscleDots
              muscles={muscles}
              max={3}
              show={settings?.showMuscleChips ?? true}
            />
          </span>
        </div>
        <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            className="h-11 w-[72px] flex-none gap-1 whitespace-nowrap px-2 text-xs font-bold"
            aria-label={`Start session ${program.name}`}
            tour={{ id: "programs.start", label: "Start session", help: "Start this session now and jump to Today.", order: 110 }}
            onClick={() => void startSession(program)}
          >
            <Play className="h-4 w-4" aria-hidden />
            Start
          </Button>
        </span>
        {renderStar(program, isFav)}
        {renderOverflowMenu(program, true)}
      </div>
    );
  };

  const canSessionFromWorkout = (todayWorkout?.exercises.length ?? 0) > 0;
  const empty = !programsQuery.isLoading && programs.length === 0;
  const filteredEmpty =
    !programsQuery.isLoading && programs.length > 0 &&
    (tab === "routines" ? visibleRoutines.length === 0 : visibleSessions.length === 0);

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          title="Programs"
          actions={
            <>
              {tab === "sessions" ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 flex-none"
                      aria-label="Sessions catalogue actions"
                      tour={{ id: "programs.dictionary", label: "Catalogue menu", help: "Open the built-in sessions dictionary.", order: 180 }}
                    >
                      <MoreVertical className="h-5 w-5" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => navigate("/dictionary")}>
                      <BookOpen className="h-4 w-4" aria-hidden /> Dictionary
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {tab === "routines" ? (
                <Button
                  type="button"
                  variant={selectMode ? "default" : "outline"}
                  className="h-11 flex-none gap-1.5 px-3 text-xs font-bold"
                  aria-pressed={selectMode}
                  tour={{ id: "programs.select", label: "Select routines", help: "Multi-select routines to delete in bulk.", order: 140 }}
                  onClick={() => {
                    setSelectedIds(new Set());
                    setSelectMode((m) => !m);
                  }}
                >
                  <ListChecks className="h-4 w-4" aria-hidden />
                  {selectMode ? "Done" : "Select"}
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 flex-none"
                    aria-label="New program"
                    tour={{ id: "programs.new", label: "New program", help: "Create a routine, session or builder program.", order: 10 }}
                  >
                    <Plus className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setCreating("ROUTINE")}>
                    <Layers className="h-4 w-4" aria-hidden /> New routine
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCreating("SESSION")}>
                    <Play className="h-4 w-4" aria-hidden /> New session
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/programs/new/builder")}>
                    <Hammer className="h-4 w-4" aria-hidden /> Program builder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canSessionFromWorkout}
                    onClick={() => {
                      if (todayWorkout) sessionFromWorkout.openFor(todayWorkout.id, todayDateKey);
                    }}
                  >
                    <Dumbbell className="h-4 w-4" aria-hidden /> Session from today&apos;s workout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        tab === "sessions" ? (
          // §4.8 — the SubBar becomes the sessions search row (back chip returns)
          <SubBar>
            <div className="flex h-11 w-full min-w-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-none gap-1 px-2 text-xs font-bold"
                aria-label="Back to routines"
                tour={{ id: "programs.backToRoutines", label: "Back to routines", help: "Leave the sessions search and return.", order: 40 }}
                onClick={() => switchTab("routines")}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Routines
              </Button>
              <div className="flex h-11 min-w-0 flex-1 items-center rounded-lg border border-input bg-transparent pl-3 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] dark:bg-input/30">
                <Search className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search sessions…"
                  aria-label="Search sessions"
                  {...tourAttrs({ id: "programs.search", label: "Search sessions", help: "Filter the sessions list by name.", order: 50 })}
                  className="h-full w-full min-w-0 flex-1 rounded-none border-0 bg-transparent pl-2 pr-3 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
                />
              </div>
            </div>
          </SubBar>
        ) : (
          <SubBar>
            <div role="tablist" aria-label="Program kind" className="flex h-11 w-full items-center gap-2">
              {(["routines", "sessions"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => switchTab(t)}
                  {...tourAttrs(
                    t === "routines"
                      ? { id: "programs.tabRoutines", label: "Routines tab", help: "Browse multi-week routines to follow.", order: 20 }
                      : { id: "programs.tabSessions", label: "Sessions tab", help: "Browse saved one-off sessions to start.", order: 30 },
                  )}
                  className={cn(
                    "h-11 min-w-0 flex-1 rounded-lg border text-sm font-bold capitalize transition-colors",
                    tab === t
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-accent/40",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </SubBar>
        )
      }
      bottomBar={
        selectMode ? (
          <BottomBar>
            <Button
              type="button"
              className="h-11 w-full gap-2 bg-destructive text-white font-bold hover:bg-destructive/90"
              disabled={selectedIds.size === 0}
              tour={{ id: "programs.deleteSelected", label: "Delete selected", help: "Remove every checked routine after confirm.", order: 150, when: ["select"] }}
              onClick={() => setDeleteManyOpen(true)}
            >
              <Trash2 className="h-5 w-5" aria-hidden />
              Delete {selectedIds.size}
            </Button>
          </BottomBar>
        ) : undefined
      }
    >
      <ScrollBody contentClassName="lg:grid lg:grid-cols-2 lg:gap-3">
        {tab === "routines" ? (
          <>
            {/* §4.4 filter chips */}
            <div data-row data-chip-scroller role="group" aria-label="Routine filters" className={cn(CHIP_ROW_CLS, "lg:col-span-2")}>
              <button
                type="button"
                aria-pressed={routineChip === "ALL" && !favOnly}
                className={chipClass(routineChip === "ALL" && !favOnly)}
                {...tourAttrs({ id: "programs.filterAll", label: "All filter", help: "Clear difficulty and favourite filters.", order: 60 })}
                onClick={() => {
                  setRoutineChip("ALL");
                  setFavOnly(false);
                }}
              >
                All
              </button>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={routineChip === d}
                  className={chipClass(routineChip === d)}
                  {...tourAttrs({ skipTour: true, reason: "Data-driven difficulty filter chips" })}
                  onClick={() => setRoutineChip(d)}
                >
                  <DifficultyPill difficulty={d} className="h-6 min-w-0 px-1.5 text-[10px]" />
                </button>
              ))}
              <button
                type="button"
                aria-pressed={favOnly}
                className={chipClass(favOnly)}
                {...tourAttrs({ id: "programs.filterFavourites", label: "Favourites filter", help: "Show only the programs you starred.", order: 70 })}
                onClick={() => setFavOnly((f) => !f)}
              >
                <Star className="h-3.5 w-3.5" aria-hidden fill={favOnly ? "currentColor" : "none"} />
                Favourites
              </button>
              <button
                type="button"
                aria-pressed={labelsOpen}
                className={chipClass(labelsOpen)}
                {...tourAttrs({ skipTour: true, reason: "Labels filter expander for the facet chip row" })}
                onClick={() => setLabelsOpen((o) => !o)}
              >
                Labels
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", labelsOpen ? "" : "-rotate-90")} aria-hidden />
              </button>
            </div>
            {labelsOpen ? (
              <FacetChipRow
                options={allLabels}
                selected={selectedLabels}
                labelOf={(l) => l}
                onToggle={toggleSet(setSelectedLabels)}
                span
                ariaLabel="Label filters"
              />
            ) : null}
          </>
        ) : (
          <>
            {/* §4.8 sessions catalog chips */}
            <div data-row data-chip-scroller role="group" aria-label="Session filters" className={cn(CHIP_ROW_CLS, "lg:col-span-2")}>
              <button
                type="button"
                aria-pressed={sessionChip === "ALL"}
                className={chipClass(sessionChip === "ALL")}
                {...tourAttrs({ skipTour: true, reason: "Sessions tab All filter chip" })}
                onClick={() => setSessionChip("ALL")}
              >
                All
              </button>
              <button
                type="button"
                aria-pressed={sessionChip === "FAVOURITES"}
                className={chipClass(sessionChip === "FAVOURITES")}
                {...tourAttrs({ skipTour: true, reason: "Sessions tab favourites filter chip" })}
                onClick={() => setSessionChip("FAVOURITES")}
              >
                Favourites
              </button>
              <button
                type="button"
                aria-pressed={sessionChip === "MINE"}
                className={chipClass(sessionChip === "MINE")}
                {...tourAttrs({ skipTour: true, reason: "Sessions tab mine filter chip" })}
                onClick={() => setSessionChip("MINE")}
              >
                Mine
              </button>
              {([20, 40, 60] as const).map((m) => {
                const key = `M${m}` as const;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={sessionChip === key}
                    className={chipClass(sessionChip === key)}
                    {...tourAttrs({ skipTour: true, reason: "Sessions tab duration filter chips" })}
                    onClick={() => setSessionChip(key)}
                  >
                    ≤{m}m
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={sessionFacet === "muscle"}
                className={chipClass(sessionFacet === "muscle")}
                {...tourAttrs({ skipTour: true, reason: "Muscle facet expander for session filters" })}
                onClick={() => setSessionFacet((f) => (f === "muscle" ? null : "muscle"))}
              >
                Muscle
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", sessionFacet === "muscle" ? "" : "-rotate-90")} aria-hidden />
              </button>
              <button
                type="button"
                aria-pressed={sessionFacet === "equipment"}
                className={chipClass(sessionFacet === "equipment")}
                {...tourAttrs({ skipTour: true, reason: "Equipment facet expander for session filters" })}
                onClick={() => setSessionFacet((f) => (f === "equipment" ? null : "equipment"))}
              >
                Equipment
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", sessionFacet === "equipment" ? "" : "-rotate-90")} aria-hidden />
              </button>
              <button
                type="button"
                aria-pressed={sessionFacet === "labels"}
                className={chipClass(sessionFacet === "labels")}
                {...tourAttrs({ skipTour: true, reason: "Labels facet expander for session filters" })}
                onClick={() => setSessionFacet((f) => (f === "labels" ? null : "labels"))}
              >
                Labels
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", sessionFacet === "labels" ? "" : "-rotate-90")} aria-hidden />
              </button>
            </div>
            {sessionFacet === "muscle" ? (
              <FacetChipRow
                options={sessionFacetOptions.muscle}
                selected={selectedMuscles}
                labelOf={sessionMuscleLabel}
                onToggle={toggleSet(setSelectedMuscles)}
                span
                ariaLabel="Muscle filters"
              />
            ) : null}
            {sessionFacet === "equipment" ? (
              <FacetChipRow
                options={sessionFacetOptions.equipment}
                selected={selectedEquipment}
                labelOf={(e) => e.replace(/_/g, " ").toLowerCase()}
                onToggle={toggleSet(setSelectedEquipment)}
                span
                ariaLabel="Equipment filters"
              />
            ) : null}
            {sessionFacet === "labels" ? (
              <FacetChipRow
                options={sessionFacetOptions.labels}
                selected={selectedSessionLabels}
                labelOf={(l) => l}
                onToggle={toggleSet(setSelectedSessionLabels)}
                span
                ariaLabel="Session label filters"
              />
            ) : null}
          </>
        )}

        {creating ? (
          <div
            data-row
            className="flex h-18 items-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border border-primary/40 bg-primary/5 pl-2 pr-1 lg:col-span-2"
          >
            <span className="flex h-6 w-6 flex-none items-center justify-center text-muted-foreground/60">
              {creating === "SESSION" ? (
                <Play className="h-4 w-4" aria-hidden />
              ) : (
                <Layers className="h-4 w-4" aria-hidden />
              )}
            </span>
            <InlineInput
              value=""
              placeholder={creating === "SESSION" ? "New session name…" : "New routine name…"}
              ariaLabel={creating === "SESSION" ? "New session name" : "New routine name"}
              onCommit={(name) => {
                const kind2 = creating;
                setCreating(null);
                void createProgram(name, kind2);
              }}
              onCancel={() => setCreating(null)}
              className="h-11 min-w-0 flex-1"
            />
          </div>
        ) : null}

        {programsQuery.isLoading ? (
          <div className="flex flex-col gap-3 lg:col-span-2" aria-busy="true" aria-label="Loading programs">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-18 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : empty ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border lg:col-span-2">
            {tab === "sessions" ? (
              <Play className="h-6 w-6 text-muted-foreground" aria-hidden />
            ) : (
              <Layers className="h-6 w-6 text-muted-foreground" aria-hidden />
            )}
            <p className="text-sm font-semibold">
              {tab === "sessions" ? "No sessions yet" : "Create your first routine"}
            </p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              {tab === "sessions"
                ? "Save a finished workout as a session to reuse it in one tap."
                : "Split your training into days, then follow the program from Home."}
            </p>
            <Button
              type="button"
              className="gap-1.5"
              tour={{ id: "programs.createFirst", label: "Create first", help: "Add your first routine or session here.", order: 160, when: ["empty"] }}
              onClick={() => setCreating(tab === "sessions" ? "SESSION" : "ROUTINE")}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {tab === "sessions" ? "New session" : "New routine"}
            </Button>
          </div>
        ) : filteredEmpty ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border lg:col-span-2">
            <Search className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">Nothing matches these filters</p>
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              tour={{ id: "programs.clearFilters", label: "Clear filters", help: "Reset the filters when nothing matches.", order: 170 }}
              onClick={tab === "routines" ? () => {
              setRoutineChip("ALL");
              setFavOnly(false);
              setLabelsOpen(false);
              setSelectedLabels(new Set());
            } : clearSessionFilters}>
              Clear filters
            </Button>
          </div>
        ) : tab === "routines" ? (
          routineSections.map((section) => (
            <Fragment key={section.key}>
              {section.label ? <SectionHeader label={section.label} span /> : null}
              {section.items.map((program) => renderRoutineRow(program))}
            </Fragment>
          ))
        ) : (
          visibleSessions.map((program) => renderSessionRow(program))
        )}

        {/* destructive confirm: program delete */}
        <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {tab === "sessions" ? "session" : "routine"}?</AlertDialogTitle>
              <AlertDialogDescription>
                “{deleteTarget?.name}” and its {deleteTarget?.dayCount ?? 0} day
                {(deleteTarget?.dayCount ?? 0) === 1 ? "" : "s"} will be removed. Logged workouts stay
                untouched. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={(e) => {
                  e.preventDefault();
                  const target = deleteTarget;
                  setDeleteTarget(null);
                  if (target) void deleteProgram(target);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* §4.4 destructive confirm: bulk delete in select mode */}
        <AlertDialog open={deleteManyOpen} onOpenChange={(o) => !o && setDeleteManyOpen(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedIds.size} routine{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
              <AlertDialogDescription>
                The selected routine{selectedIds.size === 1 ? "" : "s"} and{" "}
                {selectedIds.size === 1 ? "its" : "their"} days will be removed. Logged workouts stay
                untouched. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={(e) => {
                  e.preventDefault();
                  setDeleteManyOpen(false);
                  void deleteSelected();
                }}
              >
                Delete {selectedIds.size}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* destructive confirm: replace the followed routine */}
        <AlertDialog open={followTarget != null} onOpenChange={(o) => !o && setFollowTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Unfollow {followed?.routineName ?? "your program"} and start {followTarget?.name} from
                Day 1?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Only one program can drive your Home dashboard and day rollover at a time. Your logged
                workouts are never touched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  const target = followTarget;
                  setFollowTarget(null);
                  if (target) void followProgram(target);
                }}
              >
                Start from Day 1
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* date picker → schedule picker for the chosen program */}
        <DatePickerDialog
          open={scheduleTarget != null}
          onOpenChange={(o) => !o && setScheduleTarget(null)}
          initialKey={todayDateKey}
          title={`Schedule ${scheduleTarget?.name ?? ""}`}
          description="Pick the date — then choose the day to schedule."
          onSelect={(dayKey) => {
            setScheduleTarget(null);
            navigate(`/schedule/pick?date=${dayKey}`);
          }}
        />

        {/* §4.8 session row ⋮ Schedule → direct create (with Replace handling) */}
        <DatePickerDialog
          open={sessionScheduleTarget != null}
          onOpenChange={(o) => !o && setSessionScheduleTarget(null)}
          initialKey={todayDateKey}
          title={`Schedule ${sessionScheduleTarget?.name ?? ""}`}
          description="Pick the date for this session."
          onSelect={(dayKey) => {
            const target = sessionScheduleTarget;
            setSessionScheduleTarget(null);
            if (!target) return;
            const day = sessionWorkoutDay(target);
            void scheduleCreate.create({
              date: dayKey,
              routineId: target.id,
              ...(day ? { dayId: day.id } : {}),
              toastLabel: `Scheduled ${target.name} for ${dayKey}`,
            });
          }}
        />
        {scheduleCreate.conflictDialog}

        {sessionFromWorkout.dialog}
      </ScrollBody>
    </Screen>
  );
}
