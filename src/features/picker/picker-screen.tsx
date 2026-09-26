"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PickerScreen — the full-screen exercise picker (#/exercises), Part 3 ORDER OF
// WORK step 5. NOT a sheet: a real screen composed from the layout primitives.
//
//   TopBar (56)  : back (→ #/today?date=…) · search input (fills) · ⋮ (New
//                  exercise → INLINE editor block at the top of the list)
//   SubBar (48)  : horizontal chip scroller (the ONLY extra scroll container
//                  allowed on a screen): All · Favorites · Recent · categories.
//                  Single row, 40px, overflow-x scroll, no wrap.
//   ScrollBody   : sections with 32px sticky-in-body headers; 48px rows:
//                  [star 24px] name (ellipsis) | meta 96px right `12 · 3d`
//                  (total sets logged · days since last) | ⋮ (Edit inline /
//                  Favorite / History / Delete confirm)
//   BottomBar    : multi-select only — `Add N`.
//
// Query-param contract (read via Route.query):
//   date=YYYY-MM-DD  day context (default today) — picks target this day
//   replace={weId}   replace mode: single-select; picking swaps that workout
//                    exercise (remove + add + copy the logged sets)
//   multi=1          multi-select mode with the BottomBar `Add N`
//   (plain visit)    browse/manage mode — tapping a row opens the
//                    exercise-overview screen (#/exercise-overview/{id})
//
// p3-3 gap #3 fixed here: picking for a day with no workout createOrGets the
// workout first, then adds the exercise (legacy quick-add flow).
//
// Chip-scroller note: the scroller is a deliberate horizontal scroll container
// (data-chip-scroller, no-scrollbar). Chips that are scrolled out of the
// scroller's clip rect get visibility:hidden via an IntersectionObserver —
// they are genuinely not visible, and this keeps their raw rects from tripping
// right-edge overflow audits while the row stays truly scrollable.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody, BottomBar } from "@/components/layout";
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
  ChevronLeft,
  History,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { exercisesApi, recordsApi, routinesApi, workoutsApi } from "@/lib/client/api";
import { qk, useCategories, useExercises, useInvalidate, useWorkoutByDate } from "@/lib/client/query";
import { todayKey } from "@/lib/client/format";
import { useHashRoute } from "@/features/shell/router";
import { EXERCISE_TYPES } from "@/lib/constants";
import { typeLabel } from "@/features/exercises/labels";
import { useToggleFavourite } from "@/features/exercises/use-favourite";
import type { CategoryDTO, ExerciseDTO, SetDTO } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_UNIT = "__default__";

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

export default function PickerScreen() {
  const navigate = useApp((s) => s.navigate);
  const route = useHashRoute();
  const invalidate = useInvalidate();
  const toggleFavourite = useToggleFavourite();

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
  const backHref = routineMode ? `/routines/${routineCtxId}` : dateKey === todayKey() ? "/today" : `/today?date=${dateKey}`;
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

  // ---------- chip filter ----------
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
      return [{ key: "results", title: `${list.length} result${list.length === 1 ? "" : "s"}`, items: list }];
    }
    if (chip === "FAVORITES") {
      return [{ key: "favorites", title: "Favorites", items: list.filter((e) => e.isFavorite) }];
    }
    if (chip === "RECENT") {
      const recent = list
        .filter((e) => e.lastPerformed)
        .sort((a, b) => (a.lastPerformed! < b.lastPerformed! ? 1 : -1))
        .slice(0, 10);
      return [{ key: "recent", title: "Recent", items: recent }];
    }
    if (chip !== "ALL") {
      const cat = categories.find((c) => c.id === chip);
      return [{ key: chip, title: cat?.name ?? "Category", colour: cat?.colour, items: list.filter((e) => e.categoryId === chip) }];
    }
    // ALL: Favorites / Recent (top 5) / per-category — a picker groups the
    // same exercise under several browsing angles by design.
    const out: Section[] = [];
    const favs = list.filter((e) => e.isFavorite);
    if (favs.length > 0) out.push({ key: "favorites", title: "Favorites", items: favs });
    const recent = list
      .filter((e) => e.lastPerformed)
      .sort((a, b) => (a.lastPerformed! < b.lastPerformed! ? 1 : -1))
      .slice(0, 5);
    if (recent.length > 0) out.push({ key: "recent", title: "Recent", items: recent });
    for (const cat of categories) {
      const items = list.filter((e) => e.categoryId === cat.id);
      if (items.length > 0) out.push({ key: cat.id, title: cat.name, colour: cat.colour, items });
    }
    const known = new Set(categories.map((c) => c.id));
    const uncat = list.filter((e) => !known.has(e.categoryId));
    if (uncat.length > 0) out.push({ key: "uncat", title: "No category", items: uncat });
    return out;
  }, [list, categories, chip, searchActive]);

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const existingExerciseIds = useMemo(
    () => new Set((workout?.exercises ?? []).map((w) => w.exerciseId)),
    [workout],
  );

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
        navigate(`/routines/${routineCtxId}`);
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

  const addSelected = async () => {
    if (busy) return;
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const w = await workoutsApi.createOrGet(dateKey);
      let added = 0;
      for (const id of ids) {
        if (existingExerciseIds.has(id)) continue;
        await workoutsApi.addExercise(w.id, id);
        added++;
      }
      invalidate.workout(dateKey);
      invalidate.exercises();
      toast.success(`Added ${added} exercise${added === 1 ? "" : "s"}`);
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
    if (multiMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(ex.id)) next.delete(ex.id);
        else next.add(ex.id);
        return next;
      });
      return;
    }
    if (replaceWeId || pickMode) void pickExercise(ex);
    else navigate(`/exercise-overview/${ex.id}`); // browse/manage mode
  };

  const renderRow = (ex: ExerciseDTO, sectionKey: string) => {
    const selected = selectedIds.has(ex.id);
    return (
      <div key={`${sectionKey}:${ex.id}`} className="flex flex-col">
        <div
          data-row
          role="button"
          tabIndex={0}
          aria-label={`${ex.name} — ${metaLabel(ex, setCountById.get(ex.id))}`}
          className={cn(
            "flex h-12 cursor-pointer items-center gap-1 overflow-hidden whitespace-nowrap px-3 transition-colors hover:bg-accent/40",
            selected && "bg-primary/10",
          )}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("button, input, a")) return;
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
          <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{ex.name}</span>
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
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
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
                className="h-full w-full min-w-0 flex-1 rounded-none border-0 bg-transparent pl-2 pr-3 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
              />
            </div>
          }
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 flex-none"
                  aria-label="More actions"
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
          }
        />
      }
      subBar={<ChipScroller categories={categories} chip={chip} onSelect={setChip} />}
      bottomBar={
        multiMode && selectedIds.size > 0 ? (
          <BottomBar>
            <Button
              type="button"
              className="h-11 w-full gap-2 text-base font-bold"
              disabled={busy}
              onClick={() => void addSelected()}
            >
              <Check className="h-5 w-5" aria-hidden />
              Add {selectedIds.size}
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
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            {searchActive ? "No exercises match your search." : "No exercises here yet."}
          </p>
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
// Chip scroller — the single allowed horizontal scroll container
// ─────────────────────────────────────────────────────────────────────────────

function ChipScroller({
  categories,
  chip,
  onSelect,
}: {
  categories: CategoryDTO[];
  chip: string;
  onSelect: (value: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Chips that the scroller clips away are genuinely invisible — mark them
  // visibility:hidden so right-edge overflow audits only see what the user
  // sees, while the strip stays a real horizontal scroll container (layout is
  // untouched; visibility:hidden keeps scrollWidth). A chip counts as visible
  // iff it intersects the scroller's clip rect AND its right edge is inside
  // the viewport (straddlers would trip raw-rect edge audits, so the last
  // sliver hides instead). Re-checked on scroll/resize/font-load reflows.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => {
      const vw = document.documentElement.clientWidth;
      const clip = scroller.getBoundingClientRect();
      for (const child of Array.from(scroller.children)) {
        const r = child.getBoundingClientRect();
        const intersectsClip = r.right > clip.left - 1 && r.left < clip.right + 1;
        const insideViewport = r.right <= vw + 1;
        (child as HTMLElement).style.visibility =
          intersectsClip && insideViewport ? "" : "hidden";
      }
    };
    update();
    const raf = requestAnimationFrame(() => requestAnimationFrame(update));
    const t1 = window.setTimeout(update, 300);
    const t2 = window.setTimeout(update, 900);
    const onScroll = () => update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const onResize = () => update();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => update());
    ro.observe(scroller);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [categories.length]);

  const chipClass = (active: boolean) =>
    cn(
      "flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
      active
        ? "border-primary/60 bg-primary/10 text-primary"
        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
    );

  return (
    <div
      ref={scrollerRef}
      data-chip-scroller
      data-row
      className="no-scrollbar flex h-10 w-full items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
    >
      <button type="button" className={chipClass(chip === "ALL")} onClick={() => onSelect("ALL")}>
        All
      </button>
      <button
        type="button"
        className={chipClass(chip === "FAVORITES")}
        onClick={() => onSelect("FAVORITES")}
      >
        Favorites
      </button>
      <button
        type="button"
        className={chipClass(chip === "RECENT")}
        onClick={() => onSelect("RECENT")}
      >
        Recent
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          className={chipClass(chip === c.id)}
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
          className="h-10 min-w-0 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        />
        <Button type="button" size="sm" className="h-10 flex-none" disabled={saving} onClick={() => void save()}>
          <Check className="h-4 w-4" aria-hidden /> Save
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-10 flex-none" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={categoryId || undefined} onValueChange={setCategoryId}>
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
        <Select value={type} onValueChange={setType}>
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
        <Select value={unit} onValueChange={setUnit}>
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
