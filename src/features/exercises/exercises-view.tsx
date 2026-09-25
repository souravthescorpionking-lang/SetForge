"use client";

// ExercisesView (#/exercises) — exercise library + category manager.
// Tabs: Exercises (search, filter chips, rows) | Categories (manager).
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CategoryDot } from "@/components/shared/category-dot";
import { useApp } from "@/lib/client/store";
import { useCategories, useExercises, useInvalidate } from "@/lib/client/query";
import { exercisesApi } from "@/lib/client/api";
import type { ExerciseDTO } from "@/lib/types";
import { Dumbbell, Loader2, Plus, Search, Star, Tags, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExerciseFormDialog } from "./exercise-form-dialog";
import { CategoriesManager } from "./categories-manager";
import { ExerciseRow } from "./exercise-row";
import { useOfflineRun } from "./offline-run";

export function ExercisesView() {
  const invalidate = useInvalidate();
  const run = useOfflineRun();
  const { data: categories = [] } = useCategories();

  // --- search (debounced 250ms, filtered server-side) ---
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // --- filters ---
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const params = useMemo(
    () => ({
      ...(search ? { search } : {}),
      ...(categoryFilter ? { categoryId: categoryFilter } : {}),
      ...(favoritesOnly ? { favoritesOnly: true } : {}),
    }),
    [search, categoryFilter, favoritesOnly],
  );
  const { data: exercises, isLoading, isFetching } = useExercises(params);
  const list = exercises ?? [];
  const filtersActive = !!search || !!categoryFilter || favoritesOnly;

  // --- dialogs ---
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExerciseDTO | null>(null);
  const [formSession, setFormSession] = useState(0);

  const openForm = (exercise: ExerciseDTO | null) => {
    setEditing(exercise);
    setFormSession((s) => s + 1); // remounts the dialog with fresh state
    setFormOpen(true);
  };

  const handleDelete = async (e: ExerciseDTO) => {
    await run({
      label: `Delete “${e.name}”`,
      path: `/api/exercises/${e.id}`,
      method: "DELETE",
      run: () => exercisesApi.remove(e.id),
      successMsg: `“${e.name}” deleted`,
      onDone: () => {
        invalidate.exercises();
        invalidate.categories();
        invalidate.goals();
        invalidate.workout();
      },
    });
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setCategoryFilter(null);
    setFavoritesOnly(false);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Dumbbell className="h-5 w-5" />}
        title="Exercises"
        subtitle={`Your library · ${categories.length} categor${categories.length === 1 ? "y" : "ies"}`}
        actions={
          <Button
            className="gap-1.5"
            onClick={() => openForm(null)}
          >
            <Plus className="h-4 w-4" /> Add exercise
          </Button>
        }
      />

      <Tabs defaultValue="exercises">
        <div className="sticky top-14 z-20 -mx-1 bg-background/95 px-1 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
            <TabsTrigger value="exercises" className="gap-1.5">
              <Dumbbell className="h-4 w-4" /> Exercises
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-1.5">
              <Tags className="h-4 w-4" /> Categories
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="exercises" className="mt-4 space-y-3 outline-none">
          {/* search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search exercises… (name or category)"
              className="h-11 rounded-xl pl-9 pr-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search exercises"
            />
            {searchInput && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => setSearchInput("")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant={favoritesOnly ? "default" : "outline"}
              aria-pressed={favoritesOnly}
              className="cursor-pointer select-none gap-1 px-2.5 py-1"
              onClick={() => setFavoritesOnly((v) => !v)}
            >
              <Star className={cn("h-3 w-3", favoritesOnly && "fill-current")} /> Favorites
            </Badge>
            {categories.map((c) => (
              <Badge
                key={c.id}
                variant={categoryFilter === c.id ? "default" : "outline"}
                aria-pressed={categoryFilter === c.id}
                className="cursor-pointer select-none gap-1.5 px-2.5 py-1"
                onClick={() => setCategoryFilter(categoryFilter === c.id ? null : c.id)}
              >
                <CategoryDot colour={c.colour} size={7} ring={false} />
                {c.name}
                <span className="numeric opacity-60">{c.exerciseCount ?? 0}</span>
              </Badge>
            ))}
            {filtersActive && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={clearFilters}>
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>

          {/* result count */}
          <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
            <span className="numeric">
              {isLoading ? "…" : `${list.length} exercise${list.length === 1 ? "" : "s"}`}
              {favoritesOnly ? " · favorites" : ""}
            </span>
            {isFetching && !isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Fetching" />}
          </div>

          {/* list */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-[76px] rounded-2xl" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={<Dumbbell className="h-6 w-6" />}
              title={filtersActive ? "No exercises match" : "No exercises yet"}
              description={
                filtersActive
                  ? "Try a different search term or clear the filters."
                  : "Build your library — every set you log is tracked per exercise."
              }
              action={
                filtersActive ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button
                    className="gap-1.5"
                    onClick={() => openForm(null)}
                  >
                    <Plus className="h-4 w-4" /> Add exercise
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {list.map((e) => (
                  <ExerciseRow
                    key={e.id}
                    exercise={e}
                    onEdit={(ex) => openForm(ex)}
                    onDelete={handleDelete}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>

        <TabsContent value="categories" className="mt-4 outline-none">
          <CategoriesManager />
        </TabsContent>
      </Tabs>

      <ExerciseFormDialog
        key={`ex-${editing?.id ?? "new"}-${formSession}`}
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        exercise={editing}
      />
    </div>
  );
}
