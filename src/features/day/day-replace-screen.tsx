"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DayReplaceScreen — #/days/{dayId}/replace/{reId} (Part 9 §5.2).
//
//   TopBar (56)  : BackButton (→ the day) · "Replace exercise" · TopBarHelp
//   ScrollBody   : "Current" muted label · current exercise name (bold) ·
//                  muscle chips (32px scroller)
//   SubBar (48)  : search input (repo SubBar search pattern)
//   ScrollBody   : filter chips row (32px): "Muscle group ▾" · "Equipment ▾"
//                  (DropdownMenu multi-select; options from YOUR exercises'
//                  distinct values) → "Suggestions" (≤8 same altGroup / muscle
//                  overlap, from exerciseSuggestionsApi on the CURRENT
//                  exercise) → "All results" (search + filters, client-side).
//   Rows (56)    : name · muscles muted · right Check icon when selected
//                  (single-select; tapping a row replaces the selection).
//   BottomBar(56): [Apply] — disabled until a selection → dayApi.putOverride(
//                  dayId, { replacements: {...existing, [reId]: newId} }) →
//                  back → toast "Replaced with {name}". The SERVER keeps the
//                  original SeriesExercise's prescribed sets.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, CheckSquare, ChevronDown, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { dayApi, exerciseSuggestionsApi } from "@/lib/client/api";
import { qk, useExercises, useOnline } from "@/lib/client/query";
import { MUSCLE_LABELS, EQUIPMENT_LABELS, muscleColour, type Equipment, type Muscle } from "@/lib/constants";
import { errorMessage } from "@/features/routines/screen-helpers";
import { useDebounced } from "@/features/library/library-shared";
import type { ExerciseDTO } from "@/lib/types";

const muscleLabel = (m: string) => MUSCLE_LABELS[m as Muscle] ?? m.replace(/_/g, " ").toLowerCase();
const equipmentLabel = (e: string) => EQUIPMENT_LABELS[e as Equipment] ?? e.replace(/_/g, " ").toLowerCase();

const chipClass = (active: boolean) =>
  cn(
    "flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
    active
      ? "border-primary/60 bg-primary/10 text-primary"
      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
  );

/** 32px section header (not a data-row — height law). */
function SectionHeader({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <h2
      className={cn(
        "flex h-8 flex-none items-center gap-2 overflow-hidden px-1 text-xs font-bold uppercase tracking-wider",
        muted ? "text-muted-foreground/60" : "text-muted-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
    </h2>
  );
}

type RowExercise = Pick<ExerciseDTO, "id" | "name" | "primaryMuscles" | "equipment">;

/** One 56px selectable row (single-select). */
function ExerciseRow({
  exercise,
  selected,
  onSelect,
}: {
  exercise: RowExercise;
  selected: boolean;
  onSelect: () => void;
}) {
  const muscles = (exercise.primaryMuscles ?? []).map(muscleLabel).slice(0, 3).join(" · ");
  return (
    <button
      type="button"
      data-row
      role="radio"
      aria-checked={selected}
      aria-label={`Replace with ${exercise.name}`}
      {...tourAttrs({ id: "dayReplace.row", label: "Exercise row", help: "Pick this exercise as the replacement.", order: 50 })}
      onClick={onSelect}
      className={cn(
        "flex h-14 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border px-3 text-left transition-colors",
        selected
          ? "border-primary/60 bg-primary/10"
          : "border-border bg-card hover:border-primary/40 hover:bg-accent/40",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{exercise.name}</span>
      <span className="max-w-[120px] flex-none truncate text-xs leading-none text-muted-foreground">
        {muscles || (exercise.equipment?.[0] ? equipmentLabel(exercise.equipment[0]) : "")}
      </span>
      {selected ? <Check className="h-4 w-4 flex-none text-primary" aria-hidden /> : null}
    </button>
  );
}

export default function DayReplaceScreen({ dayId, reId }: { dayId: string; reId?: string }) {
  return <DayReplaceInner key={`${dayId}:${reId ?? ""}`} dayId={dayId} reId={reId} />;
}

function DayReplaceInner({ dayId, reId }: { dayId: string; reId?: string }) {
  const navigate = useApp((s) => s.navigate);
  const online = useOnline();
  const qc = useQueryClient();

  // ---------- data: the merged day (server already applied replacements) ----------
  const { data: day, isLoading, error } = useQuery({
    queryKey: qk.day(dayId),
    queryFn: () => dayApi.get(dayId),
    retry: 1,
  });
  const current = useMemo(
    () => day?.exercises.find((e) => e.id === reId) ?? null,
    [day, reId],
  );

  // ---------- ui state ----------
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 250);
  const [muscleFilter, setMuscleFilter] = useState<string[]>([]);
  const [equipmentFilter, setEquipmentFilter] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // ---------- suggestions (§5.2: same altGroup OR muscle overlap, ≤8) ----------
  const suggestionsQuery = useQuery({
    queryKey: qk.exerciseSuggestions(current?.exerciseId ?? ""),
    queryFn: () => exerciseSuggestionsApi.list(current!.exerciseId),
    enabled: current != null,
    staleTime: 60_000,
  });
  const suggestions = useMemo(
    () => (suggestionsQuery.data?.suggestions ?? []).filter((s) => s.id !== current?.exerciseId),
    [suggestionsQuery.data, current?.exerciseId],
  );

  // ---------- all exercises (search server-side; muscle/equipment client-side) ----------
  const exercisesQuery = useExercises(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : undefined);
  const allExercises = useMemo(() => exercisesQuery.data ?? [], [exercisesQuery.data]);

  /** Distinct muscle / equipment values across the user's exercises. */
  const muscleOptions = useMemo(
    () => [...new Set(allExercises.flatMap((e) => e.primaryMuscles ?? []))].sort(),
    [allExercises],
  );
  const equipmentOptions = useMemo(
    () => [...new Set(allExercises.flatMap((e) => e.equipment ?? []))].sort(),
    [allExercises],
  );

  const results = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return allExercises.filter((e) => {
      if (e.id === current?.exerciseId) return false; // replacing with itself is a no-op
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (muscleFilter.length > 0 && !(e.primaryMuscles ?? []).some((m) => muscleFilter.includes(m))) return false;
      if (equipmentFilter.length > 0 && !(e.equipment ?? []).some((eq) => equipmentFilter.includes(eq))) return false;
      return true;
    });
  }, [allExercises, debouncedSearch, muscleFilter, equipmentFilter, current?.exerciseId]);

  const selected = useMemo(
    () => allExercises.find((e) => e.id === selectedId) ?? suggestions.find((s) => s.id === selectedId) ?? null,
    [allExercises, suggestions, selectedId],
  );

  const toggleFilter = (kind: "muscle" | "equipment", value: string) => {
    const setter = kind === "muscle" ? setMuscleFilter : setEquipmentFilter;
    const list = kind === "muscle" ? muscleFilter : equipmentFilter;
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  // ---------- apply (§5.2: replacements merged onto the existing map) ----------
  const apply = async () => {
    if (!day || !reId || !selectedId || applying) return;
    if (!online) {
      toast.info("Replacing needs a connection");
      return;
    }
    setApplying(true);
    try {
      const existing = day.override?.replacements ?? {};
      await dayApi.putOverride(dayId, {
        replacements: { ...existing, [reId]: selectedId },
      });
      qc.invalidateQueries({ queryKey: ["day"] });
      toast.success(`Replaced with ${selected?.name ?? "the selection"}`, {
        description: "Sets are kept from the original exercise.",
      });
      navigate(`/days/${dayId}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setApplying(false);
    }
  };

  const back = () => {
    if (window.history.length > 1) window.history.back();
    else navigate(`/days/${dayId}`);
  };

  // resync selection when data reloads (e.g. after invalidation)
  useEffect(() => {
    if (selectedId != null && selected == null) setSelectedId(null);
  }, [selectedId, selected]);

  const currentMuscles = current?.exercise.primaryMuscles ?? [];

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash={`#/days/${dayId}`} label="Back to the day" />}
          title="Replace exercise"
          actions={<TopBarHelp />}
        />
      }
      subBar={
        <SubBar>
          <div className="flex h-11 w-full min-w-0 items-center gap-2">
            <Search className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exercises…"
              aria-label="Search exercises to replace with"
              {...tourAttrs({ id: "dayReplace.search", label: "Search", help: "Find a replacement by name.", order: 10 })}
              className="h-full w-full min-w-0 flex-1 rounded-none border-0 bg-transparent pl-2 pr-3 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
        </SubBar>
      }
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            className="h-11 w-full gap-1.5 whitespace-nowrap text-sm font-bold"
            disabled={applying || selectedId == null}
            aria-label="Apply the replacement"
            tour={{ id: "dayReplace.apply", label: "Apply", help: "Swap the exercise; the prescribed sets are kept.", order: 60 }}
            onClick={() => void apply()}
          >
            {applying ? <Skeleton className="h-4 w-4 rounded-full" /> : <CheckSquare className="h-4 w-4" aria-hidden />}
            {applying ? "Applying…" : selected ? `Apply — ${selected.name}` : "Apply"}
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody>
        {error || (!isLoading && !day) ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Day not found</p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Error-state back link for a missing day" }}
              onClick={() => navigate("/workout")}
            >
              Back to workout
            </Button>
          </div>
        ) : isLoading || !day ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading day">
            <Skeleton className="h-8 w-1/2 rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : !current ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Exercise not found in this day</p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Error-state back link for a missing day exercise" }}
              onClick={() => navigate(`/days/${dayId}`)}
            >
              Back to the day
            </Button>
          </div>
        ) : (
          <>
            {/* current exercise header */}
            <p className="flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Current
            </p>
            <div data-row className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3">
              <span className="min-w-0 flex-1 truncate text-base font-semibold leading-none">
                {current.exercise.name}
              </span>
              <span className="flex-none text-xs text-muted-foreground">
                {current.sets.length} {current.sets.length === 1 ? "set" : "sets"} kept
              </span>
            </div>
            {currentMuscles.length > 0 ? (
              <div
                data-row
                data-chip-scroller
                role="group"
                aria-label="Current muscles"
                className="no-scrollbar flex h-10 w-full flex-none items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
              >
                {currentMuscles.map((m) => (
                  <span
                    key={m}
                    {...tourAttrs({ skipTour: true, reason: "Data-driven muscle chips of the current exercise" })}
                    className="flex h-8 flex-none items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold"
                  >
                    <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: muscleColour(m) }} aria-hidden />
                    {muscleLabel(m)}
                  </span>
                ))}
              </div>
            ) : null}

            {/* filter chips (32px): Muscle group ▾ · Equipment ▾ (multi-select) */}
            <div
              data-row
              data-chip-scroller
              role="group"
              aria-label="Replacement filters"
              className="no-scrollbar flex h-10 w-full flex-none items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={chipClass(muscleFilter.length > 0)}
                    aria-pressed={muscleFilter.length > 0}
                    aria-expanded={false}
                    {...tourAttrs({ id: "dayReplace.filterMuscle", label: "Muscle filter", help: "Narrow results by muscle group.", order: 20 })}
                  >
                    Muscle group
                    {muscleFilter.length > 0 ? (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none tabular-nums text-primary-foreground">
                        {muscleFilter.length}
                      </span>
                    ) : null}
                    <ChevronDown className="h-3.5 w-3.5 flex-none" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-y-auto">
                  {muscleOptions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No muscle data on your exercises</p>
                  ) : (
                    muscleOptions.map((m) => (
                      <DropdownMenuCheckboxItem
                        key={m}
                        checked={muscleFilter.includes(m)}
                        onCheckedChange={() => toggleFilter("muscle", m)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {muscleLabel(m)}
                      </DropdownMenuCheckboxItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={chipClass(equipmentFilter.length > 0)}
                    aria-pressed={equipmentFilter.length > 0}
                    aria-expanded={false}
                    {...tourAttrs({ id: "dayReplace.filterEquipment", label: "Equipment filter", help: "Narrow results by equipment.", order: 30 })}
                  >
                    Equipment
                    {equipmentFilter.length > 0 ? (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none tabular-nums text-primary-foreground">
                        {equipmentFilter.length}
                      </span>
                    ) : null}
                    <ChevronDown className="h-3.5 w-3.5 flex-none" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-y-auto">
                  {equipmentOptions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No equipment data on your exercises</p>
                  ) : (
                    equipmentOptions.map((e) => (
                      <DropdownMenuCheckboxItem
                        key={e}
                        checked={equipmentFilter.includes(e)}
                        onCheckedChange={() => toggleFilter("equipment", e)}
                        onSelect={(e2) => e2.preventDefault()}
                      >
                        {equipmentLabel(e)}
                      </DropdownMenuCheckboxItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {muscleFilter.length + equipmentFilter.length > 0 ? (
                <button
                  type="button"
                  className={chipClass(false)}
                  {...tourAttrs({ id: "dayReplace.clearFilters", label: "Clear filters", help: "Remove the muscle and equipment filters.", order: 40 })}
                  onClick={() => {
                    setMuscleFilter([]);
                    setEquipmentFilter([]);
                  }}
                >
                  <X className="h-3.5 w-3.5 flex-none" aria-hidden />
                  Clear
                </button>
              ) : null}
            </div>

            {/* Suggestions (§5.2) */}
            {current != null && suggestionsQuery.isLoading ? (
              <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading suggestions">
                <Skeleton className="h-8 w-32 rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            ) : suggestions.length > 0 ? (
              <>
                <SectionHeader label="Suggestions" />
                <div className="flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <ExerciseRow
                      key={s.id}
                      exercise={s}
                      selected={selectedId === s.id}
                      onSelect={() => setSelectedId(selectedId === s.id ? null : s.id)}
                    />
                  ))}
                </div>
              </>
            ) : null}

            {/* All results */}
            <SectionHeader label={`All results (${results.length})`} muted={results.length === 0} />
            {exercisesQuery.isLoading && allExercises.length === 0 ? (
              <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading exercises">
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            ) : results.length === 0 ? (
              <div
                data-row
                className="flex h-12 items-center overflow-hidden whitespace-nowrap rounded-lg border border-dashed px-3 text-sm text-muted-foreground"
              >
                No matches — clear the filters or search for something else
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {results.map((e) => (
                  <ExerciseRow
                    key={e.id}
                    exercise={e}
                    selected={selectedId === e.id}
                    onSelect={() => setSelectedId(selectedId === e.id ? null : e.id)}
                  />
                ))}
              </div>
            )}
            <div className="h-2 flex-none" aria-hidden />
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}
