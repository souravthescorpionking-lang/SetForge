"use client";

// Shared exercise picker dialog: search + category chips + favorites + add-new shortcut.
// Used by: Today (add to workout), Routines, Copy flows, Goals, etc.
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Star, Plus, X, Dumbbell } from "lucide-react";
import { useExercises, useCategories } from "@/lib/client/query";
import type { ExerciseDTO } from "@/lib/types";
import { CategoryDot } from "./category-dot";
import { cn } from "@/lib/utils";
import { fieldsForType } from "@/lib/constants";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (exercise: ExerciseDTO) => void;
  onCreateNew?: (name: string, categoryId: string) => void | Promise<void>;
  title?: string;
  description?: string;
};

export function ExercisePickerDialog({
  open,
  onOpenChange,
  onPick,
  onCreateNew,
  title = "Add exercise",
  description,
}: Props) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { data: exercises = [] } = useExercises();
  const { data: categories = [] } = useCategories();

  const filtered = useMemo(() => {
    const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
    return exercises.filter((e) => {
      if (favoritesOnly && !e.isFavorite) return false;
      if (categoryId && e.categoryId !== categoryId) return false;
      if (tokens.length) {
        const hay = `${e.name} ${e.category?.name ?? ""}`.toLowerCase();
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [exercises, search, categoryId, favoritesOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, ExerciseDTO[]>();
    for (const e of filtered) {
      const key = e.category?.name ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()];
  }, [filtered]);

  const canCreate =
    onCreateNew && search.trim().length > 0 && !exercises.some((e) => e.name.toLowerCase() === search.trim().toLowerCase());

  const clearFilters = () => {
    setSearch("");
    setCategoryId(null);
    setFavoritesOnly(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) clearFilters(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-primary" /> {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="p-4 pb-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search exercises…"
              className="pl-9 pr-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:bg-accent"
                onClick={() => setSearch("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant={favoritesOnly ? "default" : "outline"}
              className="cursor-pointer select-none gap-1"
              onClick={() => setFavoritesOnly((v) => !v)}
            >
              <Star className={cn("h-3 w-3", favoritesOnly && "fill-current")} /> Favorites
            </Badge>
            {categories.map((c) => (
              <Badge
                key={c.id}
                variant={categoryId === c.id ? "default" : "outline"}
                className="cursor-pointer select-none gap-1.5"
                onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
              >
                <CategoryDot colour={c.colour} size={7} ring={false} />
                {c.name}
              </Badge>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 border-t">
          <div className="p-2">
            {grouped.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-10">
                No exercises match{canCreate ? " — create it below" : ""}.
              </p>
            )}
            {grouped.map(([catName, list]) => (
              <div key={catName} className="mb-1">
                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-popover/95 backdrop-blur-sm z-10">
                  {catName}
                </div>
                {list.map((e) => (
                  <button
                    key={e.id}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
                    onClick={() => {
                      onPick(e);
                      onOpenChange(false);
                    }}
                  >
                    <CategoryDot colour={e.category?.colour} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{e.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {fieldsForType(e.type)
                          .map((f) => (f === "timeSec" ? "time" : f === "distance" ? "distance" : f))
                          .join(" + ")}
                      </span>
                    </span>
                    {e.isFavorite && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>

        {canCreate && (
          <div className="p-3 border-t bg-muted/30">
            <Button
              variant="secondary"
              className="w-full gap-2"
              onClick={async () => {
                const cat = categoryId ?? categories[0]?.id;
                if (!cat) return;
                await onCreateNew?.(search.trim(), cat);
                setSearch("");
              }}
            >
              <Plus className="h-4 w-4" /> Create “{search.trim()}” as new exercise
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
