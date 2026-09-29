"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProgramsScreen — #/programs (Part 8 §3.5 — VIEW-ONLY program list).
//
//   TopBar (56)  : BackButton → #/workout · "Programs" · 📅 → #/calendar ·
//                  TopBarHelp. NO `+` — creation lives in the Builder (#/builder).
//   ScrollBody   : "Following" section (only when an ActiveRoutine exists):
//                  56px row — 4px program bar · name · `Day i/n` right +
//                  chevron, second line `Intermediate · 6 days` muted →
//                  #/programs/{id}. Highlight border-primary/40.
//                  ChipRow 40 (All · Beginner · Intermediate · Advanced ·
//                  Favourites · Labels ▾ + multi-select row).
//                  "My programs" — ROUTINE-kind rows the user touched or
//                  created; "Templates" — the untouched seeded programs.
//                  72px RoutineRows (name / meta line | Follow 96px · star ·
//                  ⋮ Copy / Edit in Builder / Delete).
//
// Stripped vs Part 5/6 (creation is the Builder's job now): sessions tab
// (sessions are On Demand at #/on-demand), `+` creation menu, session-from-
// workout, select-mode bulk delete, desktop grid, row Schedule menu item.
// Kept: the list query/filter machinery (usePrograms + routines metadata join,
// difficulty/favourites/labels chips), follow + replace confirm, favourite
// star with optimistic patch, copy/delete with destructive confirms.
//
// §3.5 section split (no server-side "owned" flag exists): a program is a
// TEMPLATE iff it is untouched (not followed, never used, not favourited) AND
// carries seeded marketing copy (`highlights` — only the seeder writes it).
// Everything the user favourite(d)/follow(ed)/used/copied/created is "Mine".
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
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
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Hammer,
  Layers,
  MoreVertical,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { programsApi, programsMetaApi, routinesApi } from "@/lib/client/api";
import { qk, useDashboard, useInvalidate, useOnline, usePrograms } from "@/lib/client/query";
import { queueMutation } from "@/lib/client/offline";
import type { ProgramSummaryDTO, RoutineDTO } from "@/lib/types";
import { DIFFICULTIES } from "@/lib/constants";
import { errorMessage, usedAgoFromDayKey, useProgramRun, useRoutineRun } from "./screen-helpers";
import { DifficultyPill, difficultyLabel, formatProgramMeta } from "./program-meta";

/** §4.4 primary chip values (kept from the Part 6 list). */
type RoutineChip = "ALL" | (typeof DIFFICULTIES)[number];

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

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span className="truncate">{label}</span>
    </p>
  );
}

/** §4.4 multi-select chip row (labels). */
function FacetChipRow({
  options,
  selected,
  labelOf,
  onToggle,
  ariaLabel,
}: {
  options: string[];
  selected: Set<string>;
  labelOf: (v: string) => string;
  onToggle: (v: string) => void;
  ariaLabel: string;
}) {
  if (options.length === 0) return null;
  return (
    <div
      data-row
      data-chip-scroller
      role="group"
      aria-label={ariaLabel}
      className={CHIP_ROW_CLS}
    >
      {options.map((v) => {
        const active = selected.has(v);
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            className={chipClass(active)}
            {...tourAttrs({ skipTour: true, reason: "Data-driven label facet chips" })}
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

/**
 * `Intermediate · 6 days · ~50 min` — the §3.5 meta line shared by the list's
 * Following row and the detail screen's meta row (defined here; both files
 * belong to the same Part 8 §3.5 task). `days` = daysPerWeek when seeded,
 * else the day count.
 */
export function programMetaLine(input: {
  difficulty?: string | null;
  daysPerWeek?: number | null;
  dayCount: number;
  estMinutes?: number | null;
}): string {
  const parts: string[] = [];
  const dl = difficultyLabel(input.difficulty ?? null);
  if (dl) parts.push(dl);
  const days = input.daysPerWeek ?? input.dayCount;
  if (days > 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (input.estMinutes != null && input.estMinutes > 0) parts.push(`~${input.estMinutes} min`);
  return parts.join(" · ");
}

const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (v: string) => {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  });
};

export default function RoutinesScreen() {
  const navigate = useApp((s) => s.navigate);
  const online = useOnline();
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const { run } = useRoutineRun();
  const { run: programRun } = useProgramRun();

  // ---------- data ----------
  const programsQuery = usePrograms("ROUTINE");
  const programs = useMemo(
    () => [...(programsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [programsQuery.data],
  );

  // full routine payloads — §4.4 metadata join (favourite/difficulty/labels)
  const routinesQuery = useQuery({ queryKey: qk.routines, queryFn: () => routinesApi.list() });
  const routinesById = useMemo(() => {
    const m = new Map<string, RoutineDTO>();
    for (const r of routinesQuery.data?.routines ?? []) {
      if ((r.kind ?? "ROUTINE") !== "ROUTINE") continue;
      m.set(r.id, r);
    }
    return m;
  }, [routinesQuery.data]);

  const dashboard = useDashboard();
  const followed = dashboard.data?.active ?? null;

  // ---------- ui state ----------
  const [deleteTarget, setDeleteTarget] = useState<ProgramSummaryDTO | null>(null);
  const [followTarget, setFollowTarget] = useState<ProgramSummaryDTO | null>(null);

  // §4.4 — routines filters (kept)
  const [routineChip, setRoutineChip] = useState<RoutineChip>("ALL");
  const [favOnly, setFavOnly] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());

  // ---------- mutations ----------
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

  // ---------- §4.4 filtering + §3.5 sections ----------
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

  /** §3.5 two sections: Mine (touched/created) · Templates (untouched seeded). */
  const sections = useMemo<
    Array<{ key: string; label: string; items: ProgramSummaryDTO[] }>
  >(() => {
    const mine: ProgramSummaryDTO[] = [];
    const templates: ProgramSummaryDTO[] = [];
    for (const p of visibleRoutines) {
      const meta = routinesById.get(p.id);
      const touched = p.isFollowed || p.lastUsedAt != null || (meta?.isFavorite ?? false);
      const seededCopy = (meta?.highlights?.length ?? 0) > 0;
      (touched || !seededCopy ? mine : templates).push(p);
    }
    return [
      { key: "MINE", label: "My programs", items: mine },
      { key: "TEMPLATES", label: "Templates", items: templates },
    ].filter((s) => s.items.length > 0);
  }, [visibleRoutines, routinesById]);

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

  const renderOverflowMenu = (program: ProgramSummaryDTO) => (
    <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-11 p-0"
            aria-label={`Actions for ${program.name}`}
            tour={{ id: "programs.rowMenu", label: "Row menu", help: "Copy this program, edit it in the Builder, or delete it.", order: 130 }}
          >
            <MoreVertical className="h-5 w-5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => navigate(`/builder/program/${program.id}`)}>
            <Hammer className="h-4 w-4" aria-hidden /> Edit in Builder
          </DropdownMenuItem>
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

    return (
      <div
        key={program.id}
        data-row
        role="button"
        tabIndex={0}
        aria-label={`${program.name} — ${program.dayCount} days, ${program.exerciseCount} exercises, ${usedAgoFromDayKey(program.lastUsedAt)}`}
        {...tourAttrs({ id: "programs.row", label: "Program row", help: "Open the program to see its days and exercise groups.", order: 80 })}
        className={ROW_CLS}
        onClick={() => navigate(`/programs/${program.id}`)}
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
          <span className="truncate text-xs leading-none text-muted-foreground">{metaLine}</span>
        </div>
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
        {renderStar(program, isFav)}
        {renderOverflowMenu(program)}
      </div>
    );
  };

  /** §3.5 Following row — the ActiveRoutine, first row of the list. */
  const renderFollowingRow = () => {
    if (dashboard.isPending && !dashboard.data) {
      return (
        <div
          data-row
          aria-busy="true"
          aria-label="Loading followed program"
          className="relative h-14 w-full flex-none overflow-hidden rounded-lg border border-primary/40"
        >
          <div className="absolute inset-y-0 left-0 w-1 bg-primary/40" aria-hidden />
          <div className="h-full w-full animate-pulse bg-muted/30" />
        </div>
      );
    }
    if (!followed) return null;
    const meta = routinesById.get(followed.routineId);
    const metaLine = programMetaLine({
      difficulty: meta?.difficulty ?? null,
      daysPerWeek: meta?.daysPerWeek ?? null,
      dayCount: followed.dayCount,
      estMinutes: meta?.estMinutes ?? null,
    });
    return (
      <div
        data-row
        role="button"
        tabIndex={0}
        aria-label={`Following ${followed.routineName} — Day ${followed.cursorDayIndex + 1} of ${followed.dayCount}`}
        {...tourAttrs({ id: "programs.following", label: "Following", help: "The program driving your plan, and the day you're on.", order: 90 })}
        className="relative flex h-14 cursor-pointer select-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-primary/40 bg-primary/5 pl-3 pr-2 transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => navigate(`/programs/${followed.routineId}`)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/programs/${followed.routineId}`);
          }
        }}
      >
        {/* 4px program colour bar */}
        <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 pl-1">
          <span className="truncate text-sm font-semibold leading-none">{followed.routineName}</span>
          <span className="truncate text-xs leading-none text-muted-foreground">{metaLine}</span>
        </div>
        <span className="flex-none text-sm font-semibold leading-none text-primary">
          Day {followed.cursorDayIndex + 1}/{followed.dayCount}
        </span>
        <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
      </div>
    );
  };

  const empty = !programsQuery.isLoading && programs.length === 0;
  const filteredEmpty =
    !programsQuery.isLoading && programs.length > 0 && visibleRoutines.length === 0;

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/workout" label="Back to Workout" />}
          title="Programs"
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 flex-none"
                aria-label="Open calendar"
                tour={{ id: "programs.calendar", label: "Calendar", help: "Open the training calendar.", order: 10 }}
                onClick={() => navigate("/calendar")}
              >
                <Calendar className="h-5 w-5" aria-hidden />
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
    >
      <ScrollBody contentClassName="">
        {/* §3.5 — Following section (ActiveRoutine only) */}
        {followed || (dashboard.isPending && !dashboard.data) ? (
          <>
            <SectionHeader label="Following" />
            {renderFollowingRow()}
          </>
        ) : null}

        {/* §4.4 filter chips (kept) */}
        <div data-row data-chip-scroller role="group" aria-label="Program filters" className={CHIP_ROW_CLS}>
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
            ariaLabel="Label filters"
          />
        ) : null}

        {programsQuery.isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading programs">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-18 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : empty ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <Layers className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">No programs yet</p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              Programs are built in the Builder — follow one to drive your daily workouts.
            </p>
            <Button
              type="button"
              className="gap-1.5"
              tour={{ id: "programs.createFirst", label: "Open Builder", help: "Create your first program in the Builder.", order: 160, when: ["empty"] }}
              onClick={() => navigate("/builder")}
            >
              <Hammer className="h-4 w-4" aria-hidden />
              Open the Builder
            </Button>
          </div>
        ) : filteredEmpty ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <Search className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">Nothing matches these filters</p>
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              tour={{ id: "programs.clearFilters", label: "Clear filters", help: "Reset the filters when nothing matches.", order: 170 }}
              onClick={() => {
                setRoutineChip("ALL");
                setFavOnly(false);
                setLabelsOpen(false);
                setSelectedLabels(new Set());
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          sections.map((section) => (
            <Fragment key={section.key}>
              <SectionHeader label={section.label} />
              {section.items.map((program) => renderRoutineRow(program))}
            </Fragment>
          ))
        )}

        {/* destructive confirm: program delete */}
        <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete program?</AlertDialogTitle>
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

        {/* destructive confirm: replace the followed program */}
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
      </ScrollBody>
    </Screen>
  );
}
