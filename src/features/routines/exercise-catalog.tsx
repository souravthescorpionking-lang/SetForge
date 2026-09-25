"use client";

// "All Exercises" browse mode: the full exercise catalogue with search —
// tapping an exercise opens its overview page.
import { useMemo, useState } from "react";
import { ChevronRight, Search, Star, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryDot } from "@/components/shared/category-dot";
import { EmptyState } from "@/components/shared/empty-state";
import { useApp } from "@/lib/client/store";
import { useCategories, useExercises } from "@/lib/client/query";
import { fieldsForType } from "@/lib/constants";
import type { ExerciseDTO } from "@/lib/types";
import { relativeFromNow } from "@/lib/client/format";

const fieldLabel = (f: string) => (f === "timeSec" ? "time" : f === "distance" ? "distance" : f);

export function ExerciseCatalog() {
  const [search, setSearch] = useState("");
  const navigate = useApp((s) => s.navigate);
  const { data: exercises = [], isLoading } = useExercises();
  const { data: categories = [] } = useCategories();

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return exercises;
    return exercises.filter((e) => {
      const hay = `${e.name} ${e.category?.name ?? ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [exercises, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ExerciseDTO[]>();
    for (const e of filtered) {
      const key = e.category?.name ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          placeholder="Search exercises…"
          className="pl-9 pr-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search exercises"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent"
            onClick={() => setSearch("")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          title="No exercises found"
          description={search ? `Nothing matches “${search}”. Try a different term.` : "Your catalogue is empty."}
        />
      )}

      <div className="scroll-slim max-h-[calc(100vh-19rem)] overflow-y-auto pr-0.5">
        {grouped.map(([categoryName, list]) => (
          <section key={categoryName} className="mb-2" aria-label={categoryName}>
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-background/95 py-1.5 pl-1 pr-2 backdrop-blur-sm">
              <CategoryDot colour={categoryById.get(list[0].categoryId)?.colour ?? list[0].category?.colour} size={8} ring={false} />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{categoryName}</h3>
              <span className="numeric ml-auto text-xs text-muted-foreground/70">{list.length}</span>
            </div>
            <div className="space-y-1.5">
              {list.map((e) => (
                <Button
                  key={e.id}
                  variant="ghost"
                  className="h-auto w-full justify-start gap-3 rounded-xl border border-border/50 px-3 py-2.5 text-left hover:border-primary/30 hover:bg-accent/40"
                  onClick={() => navigate(`/exercise-overview/${e.id}`)}
                  aria-label={`Open ${e.name}`}
                >
                  <CategoryDot colour={e.category?.colour} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{e.name}</span>
                      {e.isFavorite && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-500 text-amber-500" aria-label="Favorite" />}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {fieldsForType(e.type).map(fieldLabel).join(" + ")}
                      {e.lastPerformed ? ` · last ${relativeFromNow(e.lastPerformed)}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                </Button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
