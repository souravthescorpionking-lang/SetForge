"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PickerScreen — the full-screen exercise picker (#/exercises), Part 3 ORDER OF
// WORK step 5 + Part 6 §4.3 upgrades. NOT a sheet: a real screen composed from
// the layout primitives.
//
//   TopBar (56)  : back (→ #/today?date=…) · search input (fills) · ⋮ (New
//                  exercise → INLINE editor block at the top of the list)
//   SubBar area  : horizontal chip scroller (the ONLY extra scroll container
//                  allowed on a screen): All · Favorites · Recent · categories
//                  · Equipment ▾ · Muscle ▾ (§4.3a). Single row, 40px,
//                  overflow-x scroll, no wrap. Tapping a ▾ chip opens a SECOND
//                  40px filter row directly beneath it (same SubBar slot — the
//                  slot is a plain flex sibling, so both rows stack without
//                  touching the 48px SubBar law elsewhere). Multi-select;
//                  applied chips carry × (tap to remove). Muscle/equipment
//                  filtering is client-side over the loaded list.
//   ScrollBody   : sections with 32px sticky-in-body headers; 48px rows:
//                  [star 24px] [A1 code chip — select mode only] name (ellipsis)
//                  [≤3 muscle dots when showMuscleChips — §4.3b] | meta 96px
//                  right `12 · 3d` | ⋮ (Select / Edit inline / Favorite /
//                  History / Delete confirm)
//   BottomBar    : select mode — `Cancel · Add N · Add as superset` (§4.3c/d).
//
// Query-param contract (read via Route.query):
//   date=YYYY-MM-DD  day context (default today) — picks target this day
//   replace={weId}   replace mode: single-select; picking swaps that workout
//                    exercise (remove + add + copy the logged sets). Select
//                    mode is DISABLED here (replace is strictly single).
//   multi=1          multi-select mode with the BottomBar `Add N` (URL-driven;
//                    also gains `Add as superset`)
//   context=routine&routineId={id}&dayId={dayId}  routine-day add context
//   (plain visit)    browse/manage mode — tapping a row opens the
//                    exercise-overview screen (#/exercise-overview/{id})
//
// §4.3c select mode: entered by long-press (420ms — SetRow TypeCell precedent)
// or the row ⋮ “Select” item. Row taps toggle selection (bg-primary/10);
// selection order defines the superset member order (A1, A2… preview chips are
// DERIVED via computeGroupCodes — never stored). `Add as superset` adds the
// exercises in order then creates ONE WorkoutGroup holding them (workout
// context); routine-day context has no group API yet → sequential add + toast
// (documented fallback). Exit: Esc, the Cancel chip, or emptying the selection.
//
// p3-3 gap #3 fixed here: picking for a day with no workout createOrGets the
// workout first, then adds the exercise (legacy quick-add flow).
//
// Chip-scroller note: the scroller is a deliberate horizontal scroll container
// (data-chip-scroller, no-scrollbar). Chips that are scrolled out of the
// scroller's clip rect get visibility:hidden via useChipScrollerVisibility —
// they are genuinely not visible, and this keeps their raw rects from tripping
// right-edge overflow audits while the row stays truly scrollable.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { tourAttrs } from "@/lib/tour/attrs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronLeft,
  History,
  Link2,
  ListChecks,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { exercisesApi, recordsApi, routinesApi, workoutsApi } from "@/lib/client/api";
import { qk, useCategories, useExercises, useInvalidate, useWorkoutByDate } from "@/lib/client/query";
import { hapticSelection, hapticTap } from "@/lib/client/haptics";
import { todayKey } from "@/lib/client/format";
import { useHashRoute } from "@/features/shell/router";
import { computeGroupCodes } from "@/lib/group-codes";
import { MuscleDots } from "@/components/shared/muscle-dots";
import { useChipScrollerVisibility } from "@/features/picker/chip-visibility";
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  EXERCISE_TYPES,
  MUSCLES,
  MUSCLE_LABELS,
  muscleColour,
} from "@/lib/constants";
import { typeLabel } from "@/features/exercises/labels";
import { useToggleFavourite } from "@/features/exercises/use-favourite";
import type { CategoryDTO, ExerciseDTO, SetDTO } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Part 7 LAW 2 — the screen's tour/help contract lives in the screen slot
// (src/features/screens/picker.tsx); this module only declares the inline
// exercises.* steps.

const DEFAULT_UNIT = "__default__";
const LONG_PRESS_MS = 420; // SetRow TypeCell long-press precedent
const HOLD_SLOP_PX = 8; // pointer travel that cancels a long-press

/** Filter dimension for the second chip row (§4.3a). */
type FilterDim = "muscle" | "equipment";

/**
 * True when an event originates from an interactive control INSIDE the row —
 * or from portal content that React bubbles through the row (Radix menu items
 * live in a body portal but still propagate synthetic events up the React tree
 * to the row, so [role=menuitem]/[role=menu] must be guarded too — without it
 * every row-menu action double-fires the row tap; pre-existing picker bug,
 * fixed with §4.3 because the new “Select” item needs a clean path).
 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return false;
  return !!el.closest("button, input, a, [role=menuitem], [role=menu], [data-radix-popper-content-wrapper]");
}

/** `12 · 3d` — total sets logged · days since last performed. */
function metaLabel(ex: ExerciseDTO, setCount: number | undefined): string {
  const sets = setCount ?? 0;
  if (!ex.lastPerformed) return `${sets} · –`;
  const days = Math.floor((Date.now() - new Date(ex.lastPerformed).getTime()) / 86_400_000);
  let since: string;
  if (days <= 0) since = "today";
  else if (days < 30) since = `${days}d`;
  else if (days < 365) since = `${Math.floor(days / 30)}mo`;
  else since = `${Math.floor(days / 365)}y`;
  return `${sets} · ${since}`;
}

/** Shared chip look for the main ChipRow and the filter rows (40px rows, 32px chips). */
function pickerChipClass(active: boolean) {
  return cn(
    "flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
    active
      ? "border-primary/60 bg-primary/10 text-primary"
      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
  );
}

export default function PickerScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const route = useHashRoute();
  const invalidate = useInvalidate();
  const toggleFavourite = useToggleFavourite();

  // §4.3b: muscle dots honour the Display setting (default true).
  const showMuscleDots = settings?.showMuscleChips ?? true;

  // ---------- route query ----------
  const routeDate = route.name === "exercises" ? route.query.get("date") : null;
  const dateKey = routeDate && DATE_RE.test(routeDate) ? routeDate : todayKey();
  const replaceWeId = route.name === "exercises" ? route.query.get("replace") : null;
  const multiMode = route.name === "exercises" && route.query.get("multi") === "1";
  // p3-5 contract: context=routine&routineId={id}&dayId={dayId} — picking adds
  // the exercise to that routine day and returns to the routine detail.
  const routineCtx = route.name === "exercises" ? route.query.get("context") : null;
  const routineCtxId = route.name === "exercises" ? route.query.get("routineId") : null;
  const routineCtxDayId = route.name === "exercises" ? route.query.get("dayId") : null;
  const routineMode = routineCtx === "routine" && !!routineCtxId && !!routineCtxDayId;
  const pickMode = !replaceWeId && !multiMode && (routineMode || !!(routeDate && DATE_RE.test(routeDate)));
  const backHref = routineMode ? `/programs/${routineCtxId}` : dateKey === todayKey() ? "/today" : `/today?date=${dateKey}`;
  const todayHref = backHref;

  const { data: categories = [] } = useCategories();
  const { data: dayData } = useWorkoutByDate(dateKey);
  const workout = dayData?.workout ?? null;

  // the workout exercise being replaced (for the banner + set copy)
  const replaceWe = useMemo(
    () => (replaceWeId ? (workout?.exercises.find((w) => w.id === replaceWeId) ?? null) : null),
    [workout, replaceWeId],
  );

  // ---------- search (debounced, server-side) ----------
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);
  const searchActive = search.length > 0;

  // ---------- chip filter (server-side: search + category + favourites) ----------
  const [chip, setChip] = useState<string>("ALL"); // ALL | FAVORITES | RECENT | categoryId

  const params = useMemo(
    () => ({
      ...(search ? { search } : {}),
      ...(chip === "FAVORITES" ? { favoritesOnly: true } : {}),
      ...(chip !== "ALL" && chip !== "FAVORITES" && chip !== "RECENT" ? { categoryId: chip } : {}),
    }),
    [search, chip],
  );
  const { data: exercises, isLoading } = useExercises(params);
  const list = exercises ?? [];

  // ---------- §4.3a: Equipment / Muscle client-side filters ----------
  // Server handles search + category; muscle/equipment filter the loaded list
  // client-side (ExerciseDTO carries optional arrays — missing counts as []).
  const [filterRow, setFilterRow] = useState<FilterDim | null>(null);
  const [muscleFilters, setMuscleFilters] = useState<string[]>([]);
  const [equipmentFilters, setEquipmentFilters] = useState<string[]>([]);
  const filtersActive = muscleFilters.length > 0 || equipmentFilters.length > 0;

  const toggleFilterRow = (dim: FilterDim) => {
    hapticSelection();
    setFilterRow((prev) => (prev === dim ? null : dim));
  };
  const toggleMuscleFilter = (m: string) => {
    hapticSelection();
    setMuscleFilters((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };
  const toggleEquipmentFilter = (eq: string) => {
    hapticSelection();
    setEquipmentFilters((prev) => (prev.includes(eq) ? prev.filter((x) => x !== eq) : [...prev, eq]));
  };

  const filteredList = useMemo(() => {
    if (!filtersActive) return list;
    return list.filter((ex) => {
      if (muscleFilters.length > 0) {
        const muscles = [...(ex.primaryMuscles ?? []), ...(ex.secondaryMuscles ?? [])];
        if (!muscleFilters.some((m) => muscles.includes(m))) return false;
      }
      if (equipmentFilters.length > 0) {
        const equip = ex.equipment ?? [];
        if (!equipmentFilters.some((eq) => equip.includes(eq))) return false;
      }
      return true;
    });
  }, [list, muscleFilters, equipmentFilters, filtersActive]);

  // total sets logged per exercise (meta column)
  const records = useQuery({
    queryKey: qk.records,
    queryFn: () => recordsApi.all(),
    staleTime: 60_000,
  });
  const setCountById = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of records.data?.records ?? []) m.set(r.exerciseId, r.setCount);
    return m;
  }, [records.data]);

  // ---------- sections ----------
  type Section = { key: string; title: string; colour?: string; items: ExerciseDTO[] };
  const sections = useMemo<Section[]>(() => {
    if (searchActive) {
      return [{ key: "results", title: `${filteredList.length} result${filteredList.length === 1 ? "" : "s"}`, items: filteredList }];
    }
    if (chip === "FAVORITES") {
      return [{ key: "favorites", title: "Favorites", items: filteredList.filter((e) => e.isFavorite) }];
    }
    if (chip === "RECENT") {
      const recent = filteredList
        .filter((e) => e.lastPerformed)
        .sort((a, b) => (a.lastPerformed! < b.lastPerformed! ? 1 : -1))
        .slice(0, 10);
      return [{ key: "recent", title: "Recent", items: recent }];
    }
    if (chip !== "ALL") {
      const cat = categories.find((c) => c.id === chip);
      return [{ key: chip, title: cat?.name ?? "Category", colour: cat?.colour, items: filteredList.filter((e) => e.categoryId === chip) }];
    }
    // ALL: Favorites / Recent (top 5) / per-category — a picker groups the
    // same exercise under several browsing angles by design.
    const out: Section[] = [];
    const favs = filteredList.filter((e) => e.isFavorite);
    if (favs.length > 0) out.push({ key: "favorites", title: "Favorites", items: favs });
    const recent = filteredList
      .filter((e) => e.lastPerformed)
      .sort((a, b) => (a.lastPerformed! < b.lastPerformed! ? 1 : -1))
      .slice(0, 5);
    if (recent.length > 0) out.push({ key: "recent", title: "Recent", items: recent });
    for (const cat of categories) {
      const items = filteredList.filter((e) => e.categoryId === cat.id);
      if (items.length > 0) out.push({ key: cat.id, title: cat.name, colour: cat.colour, items });
    }
    const known = new Set(categories.map((c) => c.id));
    const uncat = filteredList.filter((e) => !known.has(e.categoryId));
    if (uncat.length > 0) out.push({ key: "uncat", title: "No category", items: uncat });
    return out;
  }, [filteredList, categories, chip, searchActive]);

  const emptyMessage = searchActive && filtersActive
    ? "No exercises match your search and filters."
    : searchActive
      ? "No exercises match your search."
      : filtersActive
        ? "No exercises match your filters."
        : "No exercises here yet.";

  // the routine day being edited (routine mode: duplicate guard + banner)
  const { data: routineCtxData } = useQuery({
    queryKey: qk.routine(routineCtxId ?? ""),
    queryFn: () => routinesApi.get(routineCtxId!),
    enabled: routineMode,
    staleTime: 5_000,
  });
  const routineDayExercises = useMemo(() => {
    if (!routineMode || !routineCtxData) return [];
    const day = routineCtxData.days.find((d) => d.id === routineCtxDayId);
    return day ? [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : [];
  }, [routineMode, routineCtxData, routineCtxDayId]);

  // ---------- ui state ----------
  const [editorFor, setEditorFor] = useState<string | null>(null); // "new" | exercise.id
  const [deleteTarget, setDeleteTarget] = useState<ExerciseDTO | null>(null);
  // §4.3c: ordered selection — the order defines superset member order (A1, A2…).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false); // internal select mode (⋮ Select / long-press)
  const [busy, setBusy] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectActive = multiMode || selectMode;
  const routineDayExerciseIds = useMemo(
    () => new Set(routineDayExercises.map((re) => re.exerciseId)),
    [routineDayExercises],
  );

  const existingExerciseIds = useMemo(
    () => new Set((workout?.exercises ?? []).map((w) => w.exerciseId)),
    [workout],
  );

  // §4.3c: A1/A2… preview chips are DERIVED (computeGroupCodes) — display only.
  const previewCodes = useMemo(() => {
    if (!selectActive || selectedIds.length === 0) return new Map<string, string>();
    return computeGroupCodes(selectedIds.map((id, i) => ({ id, groupId: "preview", sortOrder: i }))).codes;
  }, [selectActive, selectedIds]);

  // ---------- §4.3c/d: select-mode enter / toggle / exit ----------
  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds([]);
  }, []);

  const enterSelectWith = useCallback(
    (ex: ExerciseDTO) => {
      if (replaceWeId) return; // replace mode is strictly single-select
      hapticTap(); // mode enter
      setSelectMode(true);
      setSelectedIds((prev) => (prev.includes(ex.id) ? prev : [...prev, ex.id]));
    },
    [replaceWeId],
  );

  const toggleSelected = (id: string) => {
    hapticSelection();
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    setSelectedIds(next);
    // §4.3d: emptying the selection returns to normal mode.
    if (next.length === 0 && selectMode) setSelectMode(false);
  };

  // §4.3d: Esc exits select mode (open menus / alert dialogs consume Esc first).
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[data-state="open"][role="menu"], [role="alertdialog"][data-state="open"]')) return;
      exitSelectMode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode, exitSelectMode]);

  // long-press machinery (shared across rows — only one hold can be active)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const endHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdStart.current = null;
  }, []);
  useEffect(() => () => endHold(), [endHold]);

  // ---------- picking ----------
  const finishBack = () => navigate(backHref);

  const pickExercise = async (ex: ExerciseDTO) => {
    if (busy) return;
    setBusy(true);
    try {
      if (routineMode) {
        // routine-day mode: add to the template and return to the routine.
        const already = routineDayExercises.some((re) => re.exerciseId === ex.id);
        if (already) {
          toast.info(`${ex.name} is already in this day`);
          return;
        }
        await routinesApi.addExercise(routineCtxId!, routineCtxDayId!, ex.id);
        invalidate.routines();
        toast.success(`${ex.name} added to the day`);
        navigate(`/programs/${routineCtxId}`);
        return;
      }
      // createOrGet FIRST — days without a workout still get one (p3-3 gap #3)
      const w = await workoutsApi.createOrGet(dateKey);
      if (replaceWeId) {
        // replace mode: swap the exercise, preserving the logged set structure
        const oldWe = w.exercises.find((x) => x.id === replaceWeId) ?? null;
        if (oldWe && oldWe.exerciseId !== ex.id) {
          const oldSets = [...oldWe.sets].sort((a, b) => a.sortOrder - b.sortOrder);
          await workoutsApi.removeExercise(w.id, oldWe.id);
          const added = await workoutsApi.addExercise(w.id, ex.id);
          for (const s of oldSets) {
            await workoutsApi.addSet(w.id, added.workoutExerciseId, {
              weight: s.weight,
              reps: s.reps,
              distance: s.distance,
              timeSec: s.timeSec,
              setType: s.setType ?? "NORMAL",
              rpe: s.rpe ?? null,
              tempo: s.tempo ?? null,
              restPlannedSec: s.restPlannedSec ?? null,
              isComplete: s.isComplete,
            });
          }
          toast.success(`Replaced with ${ex.name}`, {
            description: `${oldSets.length} set${oldSets.length === 1 ? "" : "s"} carried over`,
          });
        } else {
          await workoutsApi.addExercise(w.id, ex.id);
          toast.success(`Replaced with ${ex.name}`);
        }
      } else if (existingExerciseIds.has(ex.id)) {
        invalidate.workout(dateKey);
        toast.info(`${ex.name} is already in this workout`);
        finishBack();
        return;
      } else {
        await workoutsApi.addExercise(w.id, ex.id);
        toast.success(`${ex.name} added`);
      }
      invalidate.workout(dateKey);
      invalidate.exercises();
      finishBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add exercise");
    } finally {
      setBusy(false);
    }
  };

  // §4.3c `Add {n}` — plain multi-add in EITHER context the picker serves.
  const addSelected = async () => {
    if (busy) return;
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      if (routineMode) {
        let added = 0;
        let skipped = 0;
        for (const id of ids) {
          if (routineDayExerciseIds.has(id)) {
            skipped++;
            continue;
          }
          await routinesApi.addExercise(routineCtxId!, routineCtxDayId!, id);
          added++;
        }
        invalidate.routines();
        if (added === 0) {
          toast.info("Already in this day");
          return;
        }
        toast.success(
          `Added ${added} exercise${added === 1 ? "" : "s"}${skipped > 0 ? ` · ${skipped} already in day` : ""}`,
        );
        finishBack();
        return;
      }
      const w = await workoutsApi.createOrGet(dateKey);
      let added = 0;
      for (const id of ids) {
        if (existingExerciseIds.has(id)) continue;
        await workoutsApi.addExercise(w.id, id);
        added++;
      }
      invalidate.workout(dateKey);
      invalidate.exercises();
      if (added === 0) {
        toast.info("Already in this workout");
        return;
      }
      toast.success(`Added ${added} exercise${added === 1 ? "" : "s"}`);
      finishBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add exercises");
    } finally {
      setBusy(false);
    }
  };

  // §4.3c `Add as superset` — add in order, then create ONE group holding them.
  //   workout context : workoutsApi.createGroup({ exerciseIds }) — codes are
  //                     DERIVED display (computeGroupCodes) on the Today screen.
  //   routine-day     : no routine-group creation API exists yet (checked:
  //                     routinesApi has updateExercise(groupId) but no group
  //                     create; card-popovers is workout-only) → §4.3 spec
  //                     fallback: sequential add + toast.
  const addSelectedAsSuperset = async () => {
    if (busy) return;
    const ids = [...selectedIds];
    if (ids.length < 2) return;
    setBusy(true);
    try {
      if (routineMode) {
        let added = 0;
        let skipped = 0;
        for (const id of ids) {
          if (routineDayExerciseIds.has(id)) {
            skipped++;
            continue;
          }
          await routinesApi.addExercise(routineCtxId!, routineCtxDayId!, id);
          added++;
        }
        invalidate.routines();
        if (added === 0) {
          toast.info("Already in this day");
          return;
        }
        toast.success(`Added ${added} exercise${added === 1 ? "" : "s"}`, {
          description: "Superset grouping arrives with the day editor",
        });
        finishBack();
        return;
      }
      // workout context — createOrGet FIRST (p3-3 gap #3), add in order, group.
      const w = await workoutsApi.createOrGet(dateKey);
      const addedWeIds: string[] = [];
      let skipped = 0;
      for (const id of ids) {
        if (existingExerciseIds.has(id)) {
          skipped++;
          continue;
        }
        const res = await workoutsApi.addExercise(w.id, id);
        addedWeIds.push(res.workoutExerciseId);
      }
      invalidate.workout(dateKey);
      invalidate.exercises();
      if (addedWeIds.length === 0) {
        toast.info("Already in this workout");
        return;
      }
      let groupId: string | null = null;
      if (addedWeIds.length >= 2) {
        const group = await workoutsApi.createGroup(w.id, {
          name: "Superset",
          exerciseIds: addedWeIds,
        });
        groupId = group.id;
        invalidate.workout(dateKey);
      }
      const workoutId = w.id;
      const weIds = addedWeIds;
      const n = addedWeIds.length;
      if (groupId) {
        toast.success(`Superset of ${n} added`, {
          description: skipped > 0 ? `${skipped} already in workout — group holds the ${n} new` : undefined,
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                for (const weId of weIds) await workoutsApi.removeExercise(workoutId, weId);
                await workoutsApi.removeGroup(workoutId, groupId!);
                invalidate.workout(dateKey);
                toast.success("Superset undone");
              } catch {
                toast.error("Could not undo — remove the exercises from the workout");
              }
            },
          },
        });
      } else {
        // <2 NEW exercises among the selection → plain add (a group of 1 is
        // meaningless); already-present ones keep their own grouping.
        toast.success(`Added ${n} exercise${n === 1 ? "" : "s"}`, {
          description: "Not enough new exercises to form a superset",
        });
      }
      finishBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add exercises");
    } finally {
      setBusy(false);
    }
  };

  const deleteExercise = async (ex: ExerciseDTO) => {
    try {
      await exercisesApi.remove(ex.id);
      invalidate.exercises();
      invalidate.categories();
      invalidate.goals();
      invalidate.workout();
      toast.success(`“${ex.name}” deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  // ---------- row rendering ----------
  const onRowTap = (ex: ExerciseDTO) => {
    if (selectActive) {
      toggleSelected(ex.id);
      return;
    }
    if (replaceWeId || pickMode) void pickExercise(ex);
    else navigate(`/exercise-overview/${ex.id}`); // browse/manage mode
  };

  const renderRow = (ex: ExerciseDTO, sectionKey: string) => {
    const selected = selectedSet.has(ex.id);
    const code = selectActive && selected ? previewCodes.get(ex.id) : undefined;
    return (
      <div key={`${sectionKey}:${ex.id}`} className="flex flex-col">
        <div
          data-row
          role="button"
          tabIndex={0}
          {...tourAttrs({ id: "exercises.row", label: "Exercise row", help: "Tap to open it; hold to select several.", order: 40 })}
          aria-label={`${ex.name} — ${metaLabel(ex, setCountById.get(ex.id))}`}
          aria-pressed={selectActive ? selected : undefined}
          className={cn(
            "flex h-12 cursor-pointer touch-manipulation select-none items-center gap-1 overflow-hidden whitespace-nowrap px-3 transition-colors hover:bg-accent/40",
            selected && "bg-primary/10",
          )}
          onPointerDown={(e) => {
            // long-press → select mode (420ms, SetRow precedent). Buttons,
            // inputs and portal menu items handle their own presses.
            if (isInteractiveTarget(e.target)) return;
            holdStart.current = { x: e.clientX, y: e.clientY };
            longPressed.current = false;
            holdTimer.current = setTimeout(() => {
              longPressed.current = true;
              enterSelectWith(ex);
            }, LONG_PRESS_MS);
          }}
          onPointerMove={(e) => {
            const s = holdStart.current;
            if (s && (Math.abs(e.clientX - s.x) > HOLD_SLOP_PX || Math.abs(e.clientY - s.y) > HOLD_SLOP_PX)) endHold();
          }}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onPointerLeave={endHold}
          onContextMenu={(e) => {
            // right-click / touch-hold browser menu → select mode instead
            e.preventDefault();
            endHold();
            enterSelectWith(ex);
          }}
          onClick={(e) => {
            if (isInteractiveTarget(e.target)) return;
            if (longPressed.current) {
              longPressed.current = false;
              return; // the long-press already acted
            }
            onRowTap(ex);
          }}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onRowTap(ex);
            }
          }}
        >
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-11 flex-none px-0"
            aria-label={ex.isFavorite ? `Remove ${ex.name} from favourites` : `Add ${ex.name} to favourites`}
            aria-pressed={ex.isFavorite}
            tour={{ id: "exercises.favorite", label: "Favourite", help: "Star an exercise to pin it under Favorites.", order: 50 }}
            onClick={() => void toggleFavourite(ex)}
          >
            <Star
              className={cn(
                "h-6 w-6 transition-colors",
                ex.isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground/60",
              )}
              aria-hidden
            />
          </Button>
          {code ? (
            <span
              className="flex h-6 w-8 flex-none items-center justify-center rounded bg-muted/60 text-[10px] font-bold tabular-nums"
              title={`Group code ${code}`}
              aria-hidden
            >
              {code}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{ex.name}</span>
          <MuscleDots muscles={ex.primaryMuscles} show={showMuscleDots} />
          <span className="flex w-24 flex-none items-center justify-end text-right text-xs tabular-nums text-muted-foreground">
            <span className="truncate">{metaLabel(ex, setCountById.get(ex.id))}</span>
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-11 flex-none px-0"
                aria-label={`Actions for ${ex.name}`}
                tour={{ id: "exercises.rowMenu", label: "Row menu", help: "Edit, favourite, history or delete this exercise.", order: 60 }}
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {!selectActive && !replaceWeId ? (
                <DropdownMenuItem onClick={() => enterSelectWith(ex)}>
                  <ListChecks className="h-4 w-4" aria-hidden /> Select
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => setEditorFor(ex.id)}>
                <Pencil className="h-4 w-4" aria-hidden /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void toggleFavourite(ex)}>
                <Star className="h-4 w-4" aria-hidden />
                {ex.isFavorite ? "Unfavourite" : "Favourite"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  navigate(`/today/${ex.id}?tab=history&date=${dateKey}`)
                }
              >
                <History className="h-4 w-4" aria-hidden /> History
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteTarget(ex)}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {editorFor === ex.id ? (
          <ExerciseEditorBlock
            key={`edit-${ex.id}`}
            exercise={ex}
            categories={categories}
            onDone={() => setEditorFor(null)}
          />
        ) : null}
      </div>
    );
  };

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          leading={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 flex-none"
              tour={{ id: "exercises.back", label: "Back", help: "Go back without picking anything.", order: 10 }}
              onClick={() => navigate(todayHref)}
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title={
            // flex wrapper + borderless input (no absolute-positioned icon)
            <div className="flex h-11 w-full min-w-0 items-center rounded-lg border border-input bg-transparent pl-3 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] dark:bg-input/30">
              <Search className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={replaceWeId ? "Find a replacement…" : routineMode ? "Find an exercise for this day…" : "Search exercises…"}
                aria-label="Search exercises"
                {...tourAttrs({ id: "exercises.search", label: "Search", help: "Search the library by exercise name.", order: 20 })}
                className="h-full w-full min-w-0 flex-1 rounded-none border-0 bg-transparent pl-2 pr-3 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
              />
            </div>
          }
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
                    tour={{ id: "exercises.menu", label: "New exercise", help: "Opens the menu that creates a new exercise.", order: 30 }}
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setEditorFor("new")}>
                    <Plus className="h-4 w-4" aria-hidden /> New exercise
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        <>
          <ChipScroller
            categories={categories}
            chip={chip}
            onSelect={(v) => {
              hapticSelection();
              setChip(v);
            }}
            muscleCount={muscleFilters.length}
            equipmentCount={equipmentFilters.length}
            openFilter={filterRow}
            onToggleFilter={toggleFilterRow}
          />
          {filterRow ? (
            <FilterChipRow
              key={filterRow}
              kind={filterRow}
              selected={filterRow === "muscle" ? muscleFilters : equipmentFilters}
              onToggle={filterRow === "muscle" ? toggleMuscleFilter : toggleEquipmentFilter}
            />
          ) : null}
        </>
      }
      bottomBar={
        selectActive && selectedIds.length > 0 ? (
          <BottomBar>
            {selectMode ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-none gap-1 px-3"
                tour={{ id: "exercises.cancelSelect", label: "Cancel", help: "Leave selection mode without adding.", order: 70, when: ["select"] }}
                onClick={exitSelectMode}
                aria-label="Cancel selection"
              >
                <X className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Cancel</span>
              </Button>
            ) : null}
            <Button
              type="button"
              className="h-11 min-w-0 flex-1 gap-2 text-sm font-bold sm:text-base"
              disabled={busy}
              tour={{ id: "exercises.add", label: "Add selected", help: "Add every selected exercise to the day.", order: 80, when: ["select"] }}
              onClick={() => void addSelected()}
            >
              <Check className="h-5 w-5 flex-none" aria-hidden />
              <span className="truncate">Add {selectedIds.length}</span>
            </Button>
            <Button
              type="button"
              className="h-11 min-w-0 flex-1 gap-2 text-sm font-bold sm:text-base"
              disabled={busy || selectedIds.length < 2}
              title={selectedIds.length < 2 ? "Select at least 2 exercises" : "Add as a superset group"}
              tour={{ id: "exercises.addSuperset", label: "Add superset", help: "Add the selection as one superset group.", order: 90, when: ["select"] }}
              onClick={() => void addSelectedAsSuperset()}
            >
              <Link2 className="h-5 w-5 flex-none" aria-hidden />
              <span className="truncate">Add as superset</span>
            </Button>
          </BottomBar>
        ) : undefined
      }
    >
      <ScrollBody>
        {replaceWeId ? (
          <div
            data-row
            className="flex h-10 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-primary/40 bg-primary/10 px-3 text-xs font-semibold text-primary"
          >
            <ArrowLeftRight className="h-4 w-4 flex-none" aria-hidden />
            <span className="truncate">
              Replacing {replaceWe?.exercise.name ?? "exercise"} — pick its replacement
            </span>
          </div>
        ) : null}

        {routineMode ? (
          <div
            data-row
            className="flex h-10 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-primary/40 bg-primary/10 px-3 text-xs font-semibold text-primary"
          >
            <Plus className="h-4 w-4 flex-none" aria-hidden />
            <span className="truncate">
              Adding to routine day — pick an exercise to add it to the template
            </span>
          </div>
        ) : null}

        {editorFor === "new" ? (
          <ExerciseEditorBlock
            key="new-editor"
            categories={categories}
            onDone={() => setEditorFor(null)}
          />
        ) : null}

        {isLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading exercises">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : sections.length === 0 || sections.every((s) => s.items.length === 0) ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          sections.map((section) => (
            <section key={section.key} className="flex flex-col">
              <h2 className="sticky top-0 z-10 flex h-8 flex-none items-center gap-2 overflow-hidden bg-background px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {section.colour ? (
                  <span
                    className="h-2 w-2 flex-none rounded-full"
                    style={{ backgroundColor: section.colour }}
                    aria-hidden
                  />
                ) : null}
                <span className="truncate">{section.title}</span>
                <span className="truncate text-[10px] font-medium normal-case tracking-normal text-muted-foreground/60">
                  {section.items.length}
                </span>
              </h2>
              {section.items.map((ex) => renderRow(ex, section.key))}
            </section>
          ))
        )}

        <ConfirmDeleteExercise
          exercise={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={(ex) => void deleteExercise(ex)}
        />
      </ScrollBody>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chip scroller — the main filter row (the single allowed horizontal scroll
// container, plus its §4.3a Equipment ▾ / Muscle ▾ openers).
// ─────────────────────────────────────────────────────────────────────────────

function ChipScroller({
  categories,
  chip,
  onSelect,
  muscleCount,
  equipmentCount,
  openFilter,
  onToggleFilter,
}: {
  categories: CategoryDTO[];
  chip: string;
  onSelect: (value: string) => void;
  muscleCount: number;
  equipmentCount: number;
  openFilter: FilterDim | null;
  onToggleFilter: (dim: FilterDim) => void;
}) {
  // Chips that the scroller clips away are genuinely invisible — mark them
  // visibility:hidden so right-edge overflow audits only see what the user
  // sees (see chip-visibility.ts). Re-armed when the chip set / filter counts
  // change (widths shift).
  const resetKey = `${categories.length}:${muscleCount}:${equipmentCount}:${openFilter ?? "-"}`;
  const scrollerRef = useChipScrollerVisibility<HTMLDivElement>(resetKey);

  const filterChip = (dim: FilterDim, label: string, count: number) => {
    const active = count > 0 || openFilter === dim;
    return (
      <button
        type="button"
        className={pickerChipClass(active)}
        {...tourAttrs(
          dim === "equipment"
            ? { id: "exercises.filterEquipment", label: "Equipment filter", help: "Filter the list by equipment tags.", order: 130 }
            : { id: "exercises.filterMuscle", label: "Muscle filter", help: "Filter the list by muscle.", order: 140 },
        )}
        aria-pressed={count > 0}
        aria-expanded={openFilter === dim}
        title={count > 0 ? `${count} ${label.toLowerCase()} filter${count === 1 ? "" : "s"} applied` : `Filter by ${label.toLowerCase()}`}
        onClick={() => onToggleFilter(dim)}
      >
        {label}
        {count > 0 ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none tabular-nums text-primary-foreground">
            {count}
          </span>
        ) : null}
        <ChevronDown
          className={cn("h-3.5 w-3.5 flex-none transition-transform", openFilter === dim && "rotate-180")}
          aria-hidden
        />
      </button>
    );
  };

  return (
    <div
      ref={scrollerRef}
      data-chip-scroller
      data-row
      className="no-scrollbar flex h-10 w-full items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
    >
      <button
        type="button"
        className={pickerChipClass(chip === "ALL")}
        {...tourAttrs({ id: "exercises.filterAll", label: "All chip", help: "Browse every exercise grouped by category.", order: 100 })}
        onClick={() => onSelect("ALL")}
      >
        All
      </button>
      <button
        type="button"
        className={pickerChipClass(chip === "FAVORITES")}
        {...tourAttrs({ id: "exercises.filterFavorites", label: "Favorites chip", help: "Show only your starred exercises.", order: 110 })}
        onClick={() => onSelect("FAVORITES")}
      >
        Favorites
      </button>
      <button
        type="button"
        className={pickerChipClass(chip === "RECENT")}
        {...tourAttrs({ id: "exercises.filterRecent", label: "Recent chip", help: "Show exercises you performed lately.", order: 120 })}
        onClick={() => onSelect("RECENT")}
      >
        Recent
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          {...tourAttrs({ skipTour: true, reason: "Data-driven category chips inside the filter scroller" })}
          className={pickerChipClass(chip === c.id)}
          onClick={() => onSelect(c.id)}
        >
          <span
            className="h-2 w-2 flex-none rounded-full"
            style={{ backgroundColor: c.colour }}
            aria-hidden
          />
          {c.name}
        </button>
      ))}
      {filterChip("equipment", "Equipment", equipmentCount)}
      {filterChip("muscle", "Muscle", muscleCount)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterChipRow — the SECOND 40px chip row (§4.3a), rendered in the SubBar slot
// directly beneath the main ChipRow while open. Multi-select; applied chips
// carry × (tap to remove). Full taxonomy from constants (MUSCLES / EQUIPMENT)
// so the row is usable even before catalog metadata is backfilled — exercises
// without muscle/equipment data simply match nothing (missing = []).
// ─────────────────────────────────────────────────────────────────────────────

function FilterChipRow({
  kind,
  selected,
  onToggle,
}: {
  kind: FilterDim;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const scrollerRef = useChipScrollerVisibility<HTMLDivElement>(selected.length);

  const options: Array<{ value: string; label: string; colour?: string }> =
    kind === "muscle"
      ? MUSCLES.map((m) => ({ value: m, label: MUSCLE_LABELS[m], colour: muscleColour(m) }))
      : EQUIPMENT.map((e) => ({ value: e, label: EQUIPMENT_LABELS[e] }));

  return (
    <div
      data-row
      className="flex h-10 w-full flex-none items-center border-b border-border bg-background"
    >
      <div
        ref={scrollerRef}
        data-chip-scroller
        className="no-scrollbar flex h-10 w-full items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
      >
        <span className="flex flex-none items-center pl-4 pr-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {kind === "muscle" ? "Muscle" : "Equipment"}
        </span>
        {options.map((o) => {
          const active = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              {...tourAttrs({ skipTour: true, reason: "Option chips inside the equipment/muscle filter row" })}
              className={pickerChipClass(active)}
              aria-pressed={active}
              title={active ? `Remove ${o.label} filter` : `Filter by ${o.label}`}
              onClick={() => onToggle(o.value)}
            >
              {o.colour ? (
                <span
                  className="h-2 w-2 flex-none rounded-full"
                  style={{ backgroundColor: o.colour }}
                  aria-hidden
                />
              ) : null}
              {o.label}
              {active ? <X className="h-3 w-3 flex-none" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline exercise editor block (create + edit — NEVER a dialog)
// Fields ported from exercise-form-dialog: name, category, modality, weight
// increment, unit. The block itself is not a data-row.
// ─────────────────────────────────────────────────────────────────────────────

function ExerciseEditorBlock({
  exercise,
  categories,
  onDone,
}: {
  exercise?: ExerciseDTO;
  categories: CategoryDTO[];
  onDone: () => void;
}) {
  const invalidate = useInvalidate();
  const [name, setName] = useState(exercise?.name ?? "");
  const [categoryId, setCategoryId] = useState<string>(exercise?.categoryId ?? categories[0]?.id ?? "");
  const [type, setType] = useState<string>(exercise?.type ?? "WEIGHT_REPS");
  const [unit, setUnit] = useState<string>(exercise?.weightUnit ?? DEFAULT_UNIT);
  const [increment, setIncrement] = useState<string>(
    exercise?.weightIncrement != null ? String(exercise.weightIncrement) : "",
  );
  const [saving, setSaving] = useState(false);
  const editing = !!exercise;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Please give the exercise a name");
      return;
    }
    setSaving(true);
    try {
      const inc = increment.trim() === "" ? null : Number(increment);
      const payload = {
        name: trimmed,
        categoryId: categoryId || categories[0]?.id,
        type,
        weightUnit: unit === DEFAULT_UNIT ? null : unit,
        weightIncrement: inc != null && Number.isFinite(inc) ? inc : null,
      };
      if (editing) {
        await exercisesApi.update(exercise.id, {
          ...payload,
          ...(unit !== (exercise.weightUnit ?? DEFAULT_UNIT) ? { unitChangeMode: "convert" as const } : {}),
        });
        toast.success("Exercise updated");
      } else {
        await exercisesApi.create(payload);
        toast.success(`“${trimmed}” created`);
      }
      invalidate.exercises();
      invalidate.categories();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Exercise name"
          aria-label="Exercise name"
          {...tourAttrs({ skipTour: true, reason: "Name field of the inline exercise editor" })}
          className="h-10 min-w-0 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          tour={{ skipTour: true, reason: "Save action of the inline exercise editor" }}
          className="h-10 flex-none"
          disabled={saving}
          onClick={() => void save()}
        >
          <Check className="h-4 w-4" aria-hidden /> Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          tour={{ skipTour: true, reason: "Cancel action of the inline exercise editor" }}
          className="h-10 flex-none"
          onClick={onDone}
        >
          Cancel
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={categoryId || undefined}
          onValueChange={setCategoryId}
          {...tourAttrs({ skipTour: true, reason: "Category select root renders no DOM node" })}
        >
          <SelectTrigger className="h-10 min-w-32 flex-1 rounded-lg" aria-label="Category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={type}
          onValueChange={setType}
          {...tourAttrs({ skipTour: true, reason: "Modality select root renders no DOM node" })}
        >
          <SelectTrigger className="h-10 min-w-32 flex-1 rounded-lg" aria-label="Modality">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXERCISE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {typeLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={unit}
          onValueChange={setUnit}
          {...tourAttrs({ skipTour: true, reason: "Unit select root renders no DOM node" })}
        >
          <SelectTrigger className="h-10 w-24 flex-none rounded-lg" aria-label="Weight unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_UNIT}>Default</SelectItem>
            <SelectItem value="kg">kg</SelectItem>
            <SelectItem value="lbs">lbs</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={increment}
          onChange={(e) => setIncrement(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          placeholder="Increment"
          aria-label="Weight increment"
          {...tourAttrs({ skipTour: true, reason: "Increment field of the inline exercise editor" })}
          className="h-10 w-24 flex-none"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirm-destructive: delete an exercise from the library
// ─────────────────────────────────────────────────────────────────────────────

function ConfirmDeleteExercise({
  exercise,
  onClose,
  onConfirm,
}: {
  exercise: ExerciseDTO | null;
  onClose: () => void;
  onConfirm: (exercise: ExerciseDTO) => void;
}) {
  return (
    <AlertDialog open={exercise != null} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{exercise?.name ?? ""}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Deletes all history, PRs and goals for this exercise. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              const target = exercise;
              onClose();
              if (target) onConfirm(target);
            }}
          >
            Delete exercise
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
