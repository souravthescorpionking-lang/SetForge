"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LibraryScreen — #/library (Part 6 §4.1). The merged catalog + user-exercise
// browser.
//
//   TopBar (56)  : ◀ back (browser history when the SPA navigated here, else
//                  #/more) · "Library" · ⋮ (Show thumbnails switch · Add all
//                  favourites… → adoptMany + toast)
//   SubBar (48)  : search input (fills width, 250ms debounce, composes with
//                  every active filter)
//   ScrollBody   : ChipRow 40 — All · Favourites · Mine · Muscles ▾ · Equipment
//                  ▾ (horizontal chip scroller). Tapping Muscles/Equipment ▾
//                  reveals a second 40px multi-select chip row beneath (× to
//                  clear). Then 32px category section headers (NOT data-rows)
//                  and 56px ExerciseRows:
//                  [thumb 40×40 (0px when hidden) | name (flex-1 truncate) |
//                   MuscleDots ≤3 | equipment text 12px muted | ☆ 44px | + 44px]
//                  Desktop (≥lg): 2-col grid (programs precedent).
//
//   +  = adopt → toast "Added to my exercises" + Undo (removes the exercise;
//        failure → error toast). Adopted → ✓ disabled (muted).
//   ☆  = unadopted: adopt with favourite:true ("Favourited · added to my
//        exercises"); adopted: toggles the user exercise favourite.
//   Row tap → #/library/{key} (unadopted) or #/exercise-overview/{id} (adopted).
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, ChevronLeft, MoreVertical, Plus, Search, Star, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { libraryApi } from "@/lib/client/api";
import { hapticSelection, hapticTap } from "@/lib/client/haptics";
import { MuscleDots } from "@/components/shared/muscle-dots";
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MUSCLES,
  MUSCLE_LABELS,
  muscleColour,
  type Equipment,
  type Muscle,
} from "@/lib/constants";
import type { LibraryEntryDTO } from "@/lib/types";
import { ChipScroller, chipClass, errMessage, useDebounced, useLibraryMutations } from "./library-shared";

type Scope = "all" | "fav" | "mine";

// Any in-app navigation (navigate() pushes a history entry) fires hashchange.
// Until one fires, this screen was reached by a deep link / fresh load → the
// back button falls back to #/more instead of leaving the app.
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

const equipmentText = (entry: LibraryEntryDTO): string | null => {
  const first = entry.equipment[0];
  if (!first) return null;
  return EQUIPMENT_LABELS[first as Equipment] ?? first.replace(/_/g, " ").toLowerCase();
};

/** 32px section header — NOT a data-row (height law). */
function SectionHeader({ label, count, className }: { label: string; count: number; className?: string }) {
  return (
    <h2
      className={cn(
        "flex h-8 flex-none items-center gap-2 overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      <span className="flex-none text-[11px] font-semibold tabular-nums text-muted-foreground/70">{count}</span>
      <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
    </h2>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ExerciseRow — 56px single-line data-row.
// ─────────────────────────────────────────────────────────────────────────────

function ExerciseRow({
  entry,
  showThumb,
  showDots,
  onOpen,
  onAdopt,
  onStar,
}: {
  entry: LibraryEntryDTO;
  showThumb: boolean;
  showDots: boolean;
  onOpen: () => void;
  onAdopt: () => void;
  onStar: () => void;
}) {
  const equip = equipmentText(entry);
  return (
    <div
      data-row
      role="button"
      tabIndex={0}
      aria-label={`${entry.name}${entry.adopted ? " — in my exercises" : ""}${entry.isFavorite ? ", favourite" : ""}`}
      {...tourAttrs({ id: "library.row", label: "Exercise row", help: "Open this exercise's catalog detail page.", order: 90 })}
      className="flex h-14 cursor-pointer select-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card pl-4 pr-1 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, input, a, [role=menuitem]")) return;
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {showThumb && entry.thumbnailUrl ? (
        <img
          src={entry.thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-10 w-10 flex-none rounded-md border object-cover"
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.name}</span>
      <MuscleDots muscles={entry.primaryMuscles} show={showDots} />
      {equip ? (
        <span className="w-[72px] flex-none truncate text-right text-xs text-muted-foreground" title={equip}>
          {equip}
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 flex-none"
        aria-label={entry.adopted ? (entry.isFavorite ? `Unfavourite ${entry.name}` : `Favourite ${entry.name}`) : `Favourite and add ${entry.name} to my exercises`}
        aria-pressed={entry.isFavorite}
        tour={{ id: "library.star", label: "Star", help: "Favourite it — adopting first if you haven't yet.", order: 100 }}
        onClick={(e) => {
          e.stopPropagation();
          hapticTap();
          onStar();
        }}
      >
        <Star className={cn("h-5 w-5", entry.isFavorite && "fill-primary text-primary")} aria-hidden />
      </Button>
      {entry.adopted ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 flex-none"
          disabled
          aria-label={`${entry.name} is in my exercises`}
          tour={{ skipTour: true, reason: "Disabled adopted-state check glyph on library rows" }}
        >
          <Check className="h-5 w-5 text-muted-foreground" aria-hidden />
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 flex-none"
          aria-label={`Add ${entry.name} to my exercises`}
          tour={{ id: "library.add", label: "Add", help: "Adopt this exercise into my exercises.", order: 110 }}
          onClick={(e) => {
            e.stopPropagation();
            hapticTap();
            onAdopt();
          }}
        >
          <Plus className="h-5 w-5" aria-hidden />
        </Button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const { adopt, toggleFavourite, adoptMany } = useLibraryMutations();

  const [scope, setScope] = useState<Scope>("all");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 250);
  const [muscleOpen, setMuscleOpen] = useState(false);
  const [equipOpen, setEquipOpen] = useState(false);
  const [muscles, setMuscles] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);

  const showThumb = settings?.showThumbnails ?? true;
  const showDots = settings?.showMuscleChips ?? true;

  const listQuery = useQuery({
    queryKey: ["library", "list", search, muscles, equipment, scope],
    queryFn: () =>
      libraryApi.list({
        search: search.trim() || undefined,
        muscle: muscles.length > 0 ? muscles : undefined,
        equipment: equipment.length > 0 ? equipment : undefined,
        fav: scope === "fav",
        mine: scope === "mine",
      }),
    placeholderData: keepPreviousData,
  });
  const entries = listQuery.data ?? null;

  // category groups (custom entries carry their user category name)
  const groups = useMemo(() => {
    const map = new Map<string, LibraryEntryDTO[]>();
    for (const e of entries ?? []) {
      const cat = e.category?.trim() || "Other";
      const list = map.get(cat);
      if (list) list.push(e);
      else map.set(cat, [e]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries]);

  const goBack = () => {
    if (appNavigated && window.history.length > 1) window.history.back();
    else navigate("/more");
  };

  const openEntry = (entry: LibraryEntryDTO) => {
    hapticTap();
    if (entry.adopted && entry.exerciseId) navigate(`/exercise-overview/${entry.exerciseId}`);
    else navigate(`/library/${encodeURIComponent(entry.key)}`);
  };

  const onStar = (entry: LibraryEntryDTO) => {
    if (entry.adopted && entry.exerciseId) void toggleFavourite(entry);
    else void adopt(entry.key, true);
  };

  const onAddAllFavourites = async () => {
    const keys = (entries ?? []).filter((e) => e.isFavorite).map((e) => e.key);
    if (keys.length === 0) {
      toast.info("No favourites to add yet — star rows to favourite them");
      return;
    }
    const adopted = await adoptMany(keys);
    if (adopted != null) toast.success(`Adopted ${adopted} favourites`);
  };

  const toggleIn = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const filtersActive =
    scope !== "all" || search.trim().length > 0 || muscles.length > 0 || equipment.length > 0;

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
              tour={{ id: "library.back", label: "Back", help: "Return to the previous screen or More.", order: 10 }}
              onClick={goBack}
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title="Library"
          actions={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 flex-none"
                    aria-label="Library options"
                    tour={{ id: "library.menu", label: "Menu", help: "Toggle thumbnails or adopt every favourite at once.", order: 20 }}
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuCheckboxItem
                    checked={showThumb}
                    onCheckedChange={(v) => {
                      hapticSelection();
                      void updateSettings({ showThumbnails: !!v }).catch(() => undefined);
                    }}
                  >
                    Show thumbnails
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuItem onClick={() => void onAddAllFavourites()}>
                    <Star className="h-4 w-4" aria-hidden /> Add all favourites…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        <SubBar>
          <Search className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search exercises…"
            aria-label="Search the exercise library"
            {...tourAttrs({ id: "library.search", label: "Search", help: "Search the catalog by exercise name.", order: 30 })}
            className="h-10 min-w-0 flex-1"
          />
        </SubBar>
      }
    >
      <ScrollBody contentClassName="lg:grid lg:grid-cols-2 lg:gap-3">
        {/* scope + filter chip row (the ONE allowed horizontal scroller) */}
        <ChipScroller label="Library filters" className="lg:col-span-2">
          {(["all", "fav", "mine"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scope === s}
              className={chipClass(scope === s)}
              {...tourAttrs(
                s === "all"
                  ? { id: "library.scopeAll", label: "All", help: "Show the whole catalog.", order: 40 }
                  : s === "fav"
                    ? { id: "library.scopeFav", label: "Favourites", help: "Show only starred exercises.", order: 50 }
                    : { id: "library.scopeMine", label: "Mine", help: "Show only adopted exercises.", order: 60 },
              )}
              onClick={() => {
                hapticSelection();
                setScope(s);
              }}
            >
              {s === "all" ? "All" : s === "fav" ? "Favourites" : "Mine"}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={muscleOpen || muscles.length > 0}
            className={chipClass(muscleOpen || muscles.length > 0)}
            {...tourAttrs({ id: "library.muscles", label: "Muscles", help: "Reveal muscle filters to narrow the list.", order: 70 })}
            onClick={() => {
              hapticSelection();
              setMuscleOpen((v) => !v);
            }}
          >
            Muscles{muscles.length > 0 ? ` · ${muscles.length}` : ""}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", muscleOpen && "rotate-180")} aria-hidden />
          </button>
          <button
            type="button"
            aria-pressed={equipOpen || equipment.length > 0}
            className={chipClass(equipOpen || equipment.length > 0)}
            {...tourAttrs({ id: "library.equipment", label: "Equipment", help: "Reveal equipment filters to narrow the list.", order: 80 })}
            onClick={() => {
              hapticSelection();
              setEquipOpen((v) => !v);
            }}
          >
            Equipment{equipment.length > 0 ? ` · ${equipment.length}` : ""}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", equipOpen && "rotate-180")} aria-hidden />
          </button>
        </ChipScroller>

        {/* multi-select muscle chips (renders beneath when open) */}
        {muscleOpen ? (
          <ChipScroller label="Muscle filters" className="lg:col-span-2">
            {MUSCLES.map((m) => {
              const selected = muscles.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={selected}
                  className={chipClass(selected)}
                  {...tourAttrs({ skipTour: true, reason: "Data-driven muscle filter chips under the Muscles toggle" })}
                  onClick={() => {
                    hapticSelection();
                    setMuscles((list) => toggleIn(list, m));
                  }}
                >
                  <span
                    className="h-2 w-2 flex-none rounded-full"
                    style={{ backgroundColor: muscleColour(m) }}
                    aria-hidden
                  />
                  {MUSCLE_LABELS[m]}
                  {selected ? <X className="h-3.5 w-3.5" aria-hidden /> : null}
                </button>
              );
            })}
          </ChipScroller>
        ) : null}

        {/* multi-select equipment chips (renders beneath when open) */}
        {equipOpen ? (
          <ChipScroller label="Equipment filters" className="lg:col-span-2">
            {EQUIPMENT.map((eq) => {
              const selected = equipment.includes(eq);
              return (
                <button
                  key={eq}
                  type="button"
                  aria-pressed={selected}
                  className={chipClass(selected)}
                  {...tourAttrs({ skipTour: true, reason: "Data-driven equipment filter chips under the Equipment toggle" })}
                  onClick={() => {
                    hapticSelection();
                    setEquipment((list) => toggleIn(list, eq));
                  }}
                >
                  {EQUIPMENT_LABELS[eq]}
                  {selected ? <X className="h-3.5 w-3.5" aria-hidden /> : null}
                </button>
              );
            })}
          </ChipScroller>
        ) : null}

        {listQuery.isLoading ? (
          <div className="flex flex-col gap-3 lg:col-span-2" aria-busy="true" aria-label="Loading library">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : listQuery.isError ? (
          <div className="flex h-[96px] flex-none flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center lg:col-span-2">
            <p className="text-sm font-semibold">Couldn&apos;t load the library</p>
            <Button type="button" variant="secondary" className="h-9" tour={{ skipTour: true, reason: "Error-state retry button for the library query" }} onClick={() => void listQuery.refetch()}>
              Retry
            </Button>
            <p className="sr-only">{errMessage(listQuery.error)}</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex h-[96px] flex-none flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center lg:col-span-2">
            <p className="text-sm font-semibold">No exercises found</p>
            {filtersActive ? (
              <p className="text-xs text-muted-foreground">Try clearing filters or a different search.</p>
            ) : null}
          </div>
        ) : (
          groups.map(([category, rows]) => (
            <Fragment key={category}>
              <SectionHeader label={category} count={rows.length} className="lg:col-span-2" />
              {rows.map((entry) => (
                <ExerciseRow
                  key={entry.key}
                  entry={entry}
                  showThumb={showThumb}
                  showDots={showDots}
                  onOpen={() => openEntry(entry)}
                  onAdopt={() => void adopt(entry.key)}
                  onStar={() => onStar(entry)}
                />
              ))}
            </Fragment>
          ))
        )}
      </ScrollBody>
    </Screen>
  );
}
