"use client";

// WorkoutHistoryView — browsable timeline of every logged workout.
// Month-grouped, searchable, category-filterable, expandable cards with
// full set details, plus open-in-day / copy / delete actions.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CategoryDot } from "@/components/shared/category-dot";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  CalendarSearch,
  Dumbbell,
  Layers,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { ApiError, workoutsApi } from "@/lib/client/api";
import { qk, useCategories, useInvalidate, useOnline } from "@/lib/client/query";
import { dayKeyOf, formatDayLabel, parseDayKey, round1, todayKey } from "@/lib/client/format";
import type { WorkoutSummaryDTO } from "@/lib/types";
import { toast } from "sonner";
import { WorkoutCard } from "./workout-card";

type SortDir = "desc" | "asc";

export function WorkoutHistoryView() {
  const navigate = useApp((s) => s.navigate);
  const invalidate = useInvalidate();
  const online = useOnline();
  const categories = useCategories();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pendingDelete, setPendingDelete] = useState<WorkoutSummaryDTO | null>(null);

  // debounce search → server-side query (matches comments, exercise + category names)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // all workouts (summaries, newest first; server-filtered when searching)
  const listQuery = useQuery({
    queryKey: qk.workoutList({ search: debouncedSearch || undefined }),
    queryFn: () => workoutsApi.list({ search: debouncedSearch || undefined }),
  });
  const workouts = listQuery.data?.workouts ?? [];

  // ---------- filtering ----------
  // Text search is already applied server-side; locally we apply the
  // category chip filter + sort direction only.
  const filtered = useMemo(() => {
    let rows = workouts;
    if (categoryFilter) {
      rows = rows.filter((w) => w.categories.some((c) => c.name === categoryFilter));
    }
    return sortDir === "desc" ? rows : [...rows].reverse();
  }, [workouts, categoryFilter, sortDir]);

  // ---------- month grouping ----------
  const monthGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: WorkoutSummaryDTO[] }> = [];
    for (const w of filtered) {
      const key = dayKeyOf(w.date).slice(0, 7); // yyyy-mm
      const label = parseDayKey(dayKeyOf(w.date)).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(w);
      else groups.push({ key, label, items: [w] });
    }
    return groups;
  }, [filtered]);

  // ---------- totals ----------
  const totals = useMemo(
    () => ({
      workouts: filtered.length,
      sets: filtered.reduce((a, w) => a + w.setCount, 0),
      volume: filtered.reduce((a, w) => a + w.volume, 0),
    }),
    [filtered],
  );

  // ---------- actions ----------
  const deleteMutation = useMutation({
    mutationFn: (w: WorkoutSummaryDTO) => workoutsApi.remove(w.id),
    onSuccess: (_data, w) => {
      invalidate.workout(dayKeyOf(w.date));
      invalidate.all();
      toast.success(`Deleted workout from ${formatDayLabel(dayKeyOf(w.date))}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Delete failed"),
  });

  const copyToToday = async (w: WorkoutSummaryDTO) => {
    const sourceKey = dayKeyOf(w.date);
    if (sourceKey === todayKey()) {
      toast.info("That workout is already logged today");
      return;
    }
    if (!online) {
      toast.info("Copies need a connection — reconnect to copy workouts");
      return;
    }
    try {
      const target = await workoutsApi.createOrGet(todayKey());
      await workoutsApi.copy(target.id, { fromDate: sourceKey });
      invalidate.workout(todayKey());
      invalidate.all();
      toast.success("Workout copied to today");
      navigate("/today");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Copy failed");
    }
  };

  const openDay = (dateKey: string) => {
    navigate(`/today?date=${dateKey}`);
  };

  const availableCategories = useMemo(() => {
    const names = new Set<string>();
    workouts.forEach((w) => w.categories.forEach((c) => names.add(c.name)));
    return (categories.data ?? []).filter((c) => names.has(c.name));
  }, [workouts, categories.data]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Workout History"
        subtitle={
          listQuery.isSuccess
            ? `${totals.workouts} workout${totals.workouts === 1 ? "" : "s"} · ${totals.sets} sets · ${round1(totals.volume)} kg volume`
            : "Every set you've ever forged"
        }
        icon={<CalendarSearch className="h-5 w-5" />}
      />

      {/* search + sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workouts, notes, exercises…"
            className="h-11 rounded-xl pl-9 pr-9"
            aria-label="Search workout history"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-xl"
          onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
          aria-label={sortDir === "desc" ? "Sort newest first" : "Sort oldest first"}
        >
          {sortDir === "desc" ? (
            <ArrowDownWideNarrow className="h-4 w-4" />
          ) : (
            <ArrowUpWideNarrow className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* category filter chips */}
      {availableCategories.length > 0 && (
        <div className="scroll-slim -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className={cn(
              "h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors",
              categoryFilter === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
            )}
          >
            All
          </button>
          {availableCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryFilter(categoryFilter === c.name ? null : c.name)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                categoryFilter === c.name
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
              )}
            >
              <CategoryDot colour={c.colour} className="h-2 w-2" />
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* loading skeletons */}
      {listQuery.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-3/4 rounded-2xl" />
        </div>
      )}

      {/* empty states */}
      {listQuery.isSuccess && workouts.length === 0 && (
        <EmptyState
          icon={<Dumbbell className="h-7 w-7" />}
          title="No workouts yet"
          description="Your forge is cold. Log your first workout from the Today screen and it will appear here."
          action={
            <Button className="rounded-xl" onClick={() => navigate("/today")}>
              <Layers className="mr-1.5 h-4 w-4" />
              Start today's workout
            </Button>
          }
        />
      )}

      {listQuery.isSuccess && workouts.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={<Search className="h-7 w-7" />}
          title="No matches"
          description="Nothing matches your search or category filter. Try clearing them."
          action={
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setSearch("");
                setCategoryFilter(null);
              }}
            >
              <X className="mr-1.5 h-4 w-4" />
              Clear filters
            </Button>
          }
        />
      )}

      {/* month groups */}
      {monthGroups.map((group) => (
        <section key={group.key} className="space-y-3">
          <div className="sticky top-[52px] z-10 -mx-1 bg-background/85 px-1 py-1.5 backdrop-blur-sm">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground/90">
                {group.label}
              </h2>
              <span className="text-xs font-medium text-muted-foreground numeric">
                {group.items.length} workout{group.items.length === 1 ? "" : "s"}
              </span>
              <div className="ml-1 h-px flex-1 bg-border/70" />
            </div>
          </div>
          {group.items.map((w, i) => (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.25), ease: "easeOut" }}
            >
              <WorkoutCard
                workout={w}
                onOpenDay={openDay}
                onDelete={setPendingDelete}
                onCopy={copyToToday}
              />
            </motion.div>
          ))}
        </section>
      ))}

      {/* delete confirmation (controlled) */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this workout?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `The workout from ${formatDayLabel(dayKeyOf(pendingDelete.date))} and all its exercises, sets and PR entries will be permanently removed.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteMutation.mutate(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete workout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
