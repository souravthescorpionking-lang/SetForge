"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LibraryEntryScreen — #/library/{catalogKey} (Part 6 §4.2). Exercise detail
// for a CATALOG entry (unadopted or adopted).
//
//   TopBar (56)  : ◀ back (browser history when the SPA navigated here, else
//                  #/library) · name (truncate) · ⋮ (Add to my exercises /
//                  ✓ In my exercises when adopted)
//   ScrollBody   : ExerciseDetailBody (MediaBlock 180/240 · Setup/Target tiles
//                  with 0fr→1fr expansion · muscle/equipment chip rows ·
//                  trainer tip row) + ActionRow 48:
//                  [Add to my exercises | ✓ In my exercises] flex-1 · ☆ 44px
//
// Star semantics match the library list: unadopted → adopt with
// favourite:true ("Favourited · added to my exercises"); adopted → toggles the
// user exercise favourite. No SubBar on mobile.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronLeft, MoreVertical, Plus, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { libraryApi } from "@/lib/client/api";
import { hapticTap } from "@/lib/client/haptics";
import { useLibraryMutations } from "./library-shared";
import { ExerciseDetailBody } from "./exercise-detail-body";

// Any in-app navigation (navigate() pushes a history entry) fires hashchange.
// Until one fires, this screen was reached by a deep link / fresh load → the
// back button falls back to #/library instead of leaving the app.
let appNavigated = false;
if (typeof window !== "undefined") {
  window.addEventListener(
    "hashchange",
    () => {
      appNavigated = true;
    },
    { once: true },
  );
}

export default function LibraryEntryScreen({ catalogKey }: { catalogKey: string }) {
  const navigate = useApp((s) => s.navigate);
  const { adopt, toggleFavourite } = useLibraryMutations();

  const entryQuery = useQuery({
    queryKey: ["library", "entry", catalogKey],
    queryFn: () => libraryApi.get(catalogKey),
    retry: false,
    staleTime: 30_000,
  });
  const entry = entryQuery.data ?? null;

  const goBack = () => {
    if (appNavigated && window.history.length > 1) window.history.back();
    else navigate("/library");
  };

  const onStar = () => {
    if (!entry) return;
    hapticTap();
    if (entry.adopted && entry.exerciseId) void toggleFavourite(entry);
    else void adopt(entry.key, true);
  };

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
              onClick={goBack}
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title={entry ? entry.name : "Exercise"}
          actions={
            entry ? (
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
                <DropdownMenuContent align="end" className="w-52">
                  {entry.adopted ? (
                    <DropdownMenuItem disabled>
                      <Check className="h-4 w-4" aria-hidden /> In my exercises
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => void adopt(entry.key)}>
                      <Plus className="h-4 w-4" aria-hidden /> Add to my exercises
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : undefined
          }
        />
      }
    >
      <ScrollBody>
        {entryQuery.isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading exercise">
            <Skeleton className="h-[180px] rounded-md" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-18 rounded-lg" />
              <Skeleton className="h-18 rounded-lg" />
            </div>
            <Skeleton className="h-10 rounded-full" />
            <Skeleton className="h-14 rounded-lg" />
          </div>
        ) : !entry ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
            <p className="text-sm font-semibold">Exercise not found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This catalog entry may have been removed.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="mt-4 gap-1.5"
              onClick={() => navigate("/library")}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> Back to library
            </Button>
          </div>
        ) : (
          <>
            <ExerciseDetailBody data={entry} />

            {/* ActionRow 48 — adopt (flex-1) + favourite 44px */}
            <div data-row className="flex h-12 flex-none items-center gap-2">
              {entry.adopted ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 min-w-0 flex-1 gap-1.5"
                  disabled
                  aria-label={`${entry.name} is in my exercises`}
                >
                  <Check className="h-4 w-4" aria-hidden /> In my exercises
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-11 min-w-0 flex-1 gap-1.5"
                  onClick={() => void adopt(entry.key)}
                >
                  <Plus className="h-4 w-4" aria-hidden /> Add to my exercises
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 flex-none"
                aria-pressed={entry.isFavorite}
                aria-label={
                  entry.adopted
                    ? entry.isFavorite
                      ? `Unfavourite ${entry.name}`
                      : `Favourite ${entry.name}`
                    : `Favourite and add ${entry.name} to my exercises`
                }
                onClick={onStar}
              >
                <Star
                  className={cn("h-5 w-5", entry.isFavorite && "fill-primary text-primary")}
                  aria-hidden
                />
              </Button>
            </div>
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}
