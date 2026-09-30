"use client";

// ─────────────────────────────────────────────────────────────────────────────
// OnDemandScreen — #/on-demand (Part 9 §7).
//
//   TopBar (56)  : BackButton(→ #/workout) · "On Demand" · filter icon-button
//                  (orange dot + count badge while §7 filters are active →
//                  #/on-demand/filters) · TopBarHelp
//   SubBar (48)  : search input "Search sessions…" (server q, 300ms debounce)
//   ScrollBody   : §7 chip row 40 (All · Warm up / Rehab · Favorites · Coach
//                  picks · Specialization · Limited equipment · Limited time)
//                  · 72px session rows — R1 name + intensity pill ·
//                  R2 "{series} series · {min} min · {equipment}" · ★ favourite
//                  (DayFavorite) · loading skeletons at real heights ·
//                  dashed empty states.
//
// THE URL IS THE SOURCE OF TRUTH: chips + search + the filters-screen state
// all live in the #/on-demand hash query (filter-url.ts); every change is a
// replaceHash write, so refresh/deep links restore the exact view. Category
// chips + the filters screen refetch SERVER-side (onDemandApi.list); the
// Favorites/Coach picks chips are flags applied to the returned DTOs.
// Card tap → #/days/{dayId} (§5 Day Overview — day-first route).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dumbbell, Hammer, Search, SlidersHorizontal, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { dayApi, onDemandApi } from "@/lib/client/api";
import { qk, useOnline } from "@/lib/client/query";
import { queueMutation } from "@/lib/client/offline";
import { DIFFICULTY_LABELS, type Difficulty } from "@/lib/constants";
import { errorMessage } from "@/features/routines/screen-helpers";
import { replaceHash, useHashRoute } from "@/features/shell/router";
import type { OnDemandSessionDTO } from "@/lib/client/api";
import {
  countOnDemandFilters,
  onDemandFiltersHash,
  onDemandListHash,
  parseOnDemandFilters,
  toOnDemandQuery,
  type OnDemandUrlFilters,
} from "./filter-url";

const ROW_CLS =
  "flex h-18 cursor-pointer select-none items-center overflow-hidden whitespace-nowrap rounded-lg border bg-card pr-1 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const CHIP_ROW_CLS =
  "no-scrollbar flex h-10 w-full flex-none items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap";

const chipClass = (active: boolean) =>
  cn(
    "flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
    active
      ? "border-primary/60 bg-primary/10 text-primary"
      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
  );

const EQUIPMENT_LABELS: Record<string, string> = {
  NONE: "None",
  MINIMAL: "Minimal",
  GYM: "Gym",
};

const intensityLabel = (v: string | null) =>
  v && v in DIFFICULTY_LABELS ? DIFFICULTY_LABELS[v as Difficulty] : null;

export default function OnDemandScreen() {
  const navigate = useApp((s) => s.navigate);
  const online = useOnline();
  const qc = useQueryClient();
  const route = useHashRoute();

  // ---------- URL-derived filter state (the §7 source of truth) ----------
  const filters: OnDemandUrlFilters = useMemo(
    () => (route.name === "on-demand" ? parseOnDemandFilters(route.query) : parseOnDemandFilters(new URLSearchParams())),
    [route.name, route.query],
  );

  const writeFilters = (next: OnDemandUrlFilters) => replaceHash(onDemandListHash(next));

  // search input — seeded from the URL once on mount; every keystroke is local
  // and the DEBOUNCED value is written back to the URL (which drives the query).
  const [searchInput, setSearchInput] = useState(() => filters.q);
  const debouncedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debouncedTimer.current) clearTimeout(debouncedTimer.current);
    debouncedTimer.current = setTimeout(() => {
      if (searchInput.trim() !== filters.q) {
        writeFilters({ ...filters, q: searchInput.trim() });
      }
    }, 300);
    return () => {
      if (debouncedTimer.current) clearTimeout(debouncedTimer.current);
    };
  }, [searchInput]);

  // ---------- data (server-side §7 filtering) ----------
  const serverQuery = useMemo(() => toOnDemandQuery(filters), [filters]);
  const sessionsQuery = useQuery({
    queryKey: qk.onDemand(serverQuery),
    queryFn: () => onDemandApi.list(serverQuery),
  });

  // Favorites / Coach picks are DTO flags → applied client-side (same fetch).
  const visibleSessions = useMemo(() => {
    const all = sessionsQuery.data ?? [];
    if (filters.chip === "FAV") return all.filter((s) => s.isFavorite);
    if (filters.chip === "PICKS") return all.filter((s) => s.isFeatured);
    return all;
  }, [sessionsQuery.data, filters.chip]);

  const activeFilterCount = countOnDemandFilters(filters);
  /** No sessions exist at all AND nothing is filtered → the true empty state. */
  const nothingAtAll =
    !sessionsQuery.isLoading &&
    (sessionsQuery.data?.length ?? 0) === 0 &&
    filters.chip === "ALL" &&
    !filters.q.trim() &&
    activeFilterCount === 0;

  // ---------- mutations ----------
  const toggleFavourite = async (session: OnDemandSessionDTO) => {
    if (!session.dayId) return;
    const next = !session.isFavorite;
    // optimistic patch of the on-demand cache — the list reads isFavorite from it
    qc.setQueryData<OnDemandSessionDTO[]>(qk.onDemand(serverQuery), (old) =>
      old ? old.map((s) => (s.id === session.id ? { ...s, isFavorite: next } : s)) : old,
    );
    if (!online) {
      queueMutation(
        `/api/days/${session.dayId}/favorite`,
        next ? "POST" : "DELETE",
        undefined,
        next ? "Added to favourites" : "Removed from favourites",
      );
      toast.info(
        `${next ? "Added to favourites" : "Removed from favourites"} — saved offline, will sync when reconnected`,
      );
      return;
    }
    try {
      const res = next
        ? await dayApi.favourite(session.dayId)
        : await dayApi.unfavourite(session.dayId);
      toast.success(
        res.isFavorite ? `“${session.name}” added to favourites` : `“${session.name}” removed from favourites`,
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      qc.invalidateQueries({ queryKey: ["on-demand"] });
    }
  };

  const clearFilters = () => replaceHash("#/on-demand");

  const openFilters = () => navigate(onDemandFiltersHash(filters));

  // ---------- rows ----------
  const renderStar = (session: OnDemandSessionDTO) => (
    <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        variant="ghost"
        className={cn("h-11 w-11 p-0", session.isFavorite && "text-amber-500 hover:text-amber-500")}
        aria-pressed={session.isFavorite}
        aria-label={session.isFavorite ? `Unfavourite ${session.name}` : `Favourite ${session.name}`}
        tour={{ id: "onDemand.favourite", label: "Favourite", help: "Star the session to find it faster.", order: 70 }}
        onClick={() => void toggleFavourite(session)}
      >
        <Star className="h-5 w-5" aria-hidden fill={session.isFavorite ? "currentColor" : "none"} />
      </Button>
    </span>
  );

  const renderSessionRow = (session: OnDemandSessionDTO) => {
    const intensity = intensityLabel(session.intensity);
    const equipment = session.equipmentLevel ? (EQUIPMENT_LABELS[session.equipmentLevel] ?? null) : null;
    const line2 = [
      `${session.seriesCount} series`,
      ...(session.minutes != null ? [`${session.minutes} min`] : []),
      ...(equipment ? [equipment] : ["—"]),
    ].join(" · ");

    return (
      <div
        key={session.id}
        data-row
        role="button"
        tabIndex={0}
        aria-label={`${session.name}${intensity ? ` — ${intensity}` : ""}${session.minutes != null ? ` · ${session.minutes} minutes` : ""}${session.isFeatured ? " · coach pick" : ""}`}
        {...tourAttrs({ id: "onDemand.sessionRow", label: "Session row", help: "Open the session's day overview to start it.", order: 60 })}
        className={ROW_CLS}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input, a, [role=menuitem]")) return;
          if (session.dayId) navigate(`/days/${session.dayId}`);
          else navigate(`/on-demand/${session.id}`);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (session.dayId) navigate(`/days/${session.dayId}`);
            else navigate(`/on-demand/${session.id}`);
          }
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 pl-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{session.name}</span>
            {session.isFeatured ? (
              <Star className="h-3.5 w-3.5 flex-none text-primary" aria-hidden fill="currentColor" />
            ) : null}
            {intensity ? (
              <span
                className={cn(
                  "flex h-6 flex-none items-center rounded-full border border-primary/40 bg-primary/10 px-2 text-[10px] font-bold uppercase leading-none text-primary",
                )}
              >
                {intensity}
              </span>
            ) : null}
          </div>
          <span className="truncate text-xs leading-none text-muted-foreground">{line2}</span>
        </div>
        {renderStar(session)}
      </div>
    );
  };

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          title="On Demand"
          leading={<BackButton fallbackHash="#/workout" label="Back to Workout" />}
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative h-11 w-11 flex-none"
                aria-label={activeFilterCount > 0 ? `Filters (${activeFilterCount} active)` : "Filters"}
                tour={{ id: "onDemand.filters", label: "Filters", help: "Open the full filter screen for sessions.", order: 10 }}
                onClick={openFilters}
              >
                <SlidersHorizontal className="h-5 w-5" aria-hidden />
                {activeFilterCount > 0 ? (
                  <span
                    aria-hidden
                    className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground ring-2 ring-background"
                  >
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        <SubBar>
          <div className="flex h-11 w-full min-w-0 items-center rounded-lg border border-input bg-transparent pl-3 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] dark:bg-input/30">
            <Search className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search sessions…"
              aria-label="Search sessions"
              {...tourAttrs({ id: "onDemand.search", label: "Search sessions", help: "Search sessions by name or exercise.", order: 20 })}
              className="h-full w-full min-w-0 flex-1 rounded-none border-0 bg-transparent pl-2 pr-3 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
        </SubBar>
      }
    >
      <ScrollBody>
        {/* §7 chips — single-select; category chips refetch, flags filter locally */}
        <div data-row data-chip-scroller role="group" aria-label="Session filters" className={CHIP_ROW_CLS}>
          <button
            type="button"
            aria-pressed={filters.chip === "ALL"}
            className={chipClass(filters.chip === "ALL")}
            {...tourAttrs({ id: "onDemand.filterAll", label: "All filter", help: "Clear every chip to show all sessions.", order: 30 })}
            onClick={() => writeFilters({ ...filters, chip: "ALL" })}
          >
            All
          </button>
          <button
            type="button"
            aria-pressed={filters.chip === "WARMUP_REHAB"}
            className={chipClass(filters.chip === "WARMUP_REHAB")}
            {...tourAttrs({ id: "onDemand.filterWarmup", label: "Warm up filter", help: "Warm-up and rehab sessions for easy days.", order: 40 })}
            onClick={() => writeFilters({ ...filters, chip: filters.chip === "WARMUP_REHAB" ? "ALL" : "WARMUP_REHAB" })}
          >
            Warm up / Rehab
          </button>
          <button
            type="button"
            aria-pressed={filters.chip === "FAV"}
            className={chipClass(filters.chip === "FAV")}
            {...tourAttrs({ id: "onDemand.filterFavourites", label: "Favourites filter", help: "Show only the sessions you starred.", order: 50 })}
            onClick={() => writeFilters({ ...filters, chip: filters.chip === "FAV" ? "ALL" : "FAV" })}
          >
            <Star className="h-3.5 w-3.5" aria-hidden fill={filters.chip === "FAV" ? "currentColor" : "none"} />
            Favorites
          </button>
          <button
            type="button"
            aria-pressed={filters.chip === "PICKS"}
            className={chipClass(filters.chip === "PICKS")}
            {...tourAttrs({ id: "onDemand.filterPicks", label: "Coach picks", help: "Sessions the coaches highlight for you.", order: 60 })}
            onClick={() => writeFilters({ ...filters, chip: filters.chip === "PICKS" ? "ALL" : "PICKS" })}
          >
            Coach picks
          </button>
          <button
            type="button"
            aria-pressed={filters.chip === "SPECIALIZATION"}
            className={chipClass(filters.chip === "SPECIALIZATION")}
            {...tourAttrs({ id: "onDemand.filterSpecialization", label: "Specialization filter", help: "Sessions focused on one muscle group.", order: 70 })}
            onClick={() => writeFilters({ ...filters, chip: filters.chip === "SPECIALIZATION" ? "ALL" : "SPECIALIZATION" })}
          >
            Specialization
          </button>
          <button
            type="button"
            aria-pressed={filters.chip === "LIMITED_EQUIPMENT"}
            className={chipClass(filters.chip === "LIMITED_EQUIPMENT")}
            {...tourAttrs({ id: "onDemand.filterEquipment", label: "Limited equipment", help: "Sessions for minimal gear or travel.", order: 80 })}
            onClick={() => writeFilters({ ...filters, chip: filters.chip === "LIMITED_EQUIPMENT" ? "ALL" : "LIMITED_EQUIPMENT" })}
          >
            Limited equipment
          </button>
          <button
            type="button"
            aria-pressed={filters.chip === "LIMITED_TIME"}
            className={chipClass(filters.chip === "LIMITED_TIME")}
            {...tourAttrs({ id: "onDemand.filterTime", label: "Limited time", help: "Short sessions when time is tight.", order: 90 })}
            onClick={() => writeFilters({ ...filters, chip: filters.chip === "LIMITED_TIME" ? "ALL" : "LIMITED_TIME" })}
          >
            Limited time
          </button>
        </div>

        {sessionsQuery.isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading sessions">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-18 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : nothingAtAll ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <Dumbbell className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="max-w-[280px] text-center text-sm font-semibold">
              No sessions yet — create one in the Builder
            </p>
            <Button
              type="button"
              className="gap-1.5"
              tour={{ id: "onDemand.openBuilder", label: "Open Builder", help: "Go to the Builder to create a session.", order: 100, when: ["empty"] }}
              onClick={() => navigate("/builder")}
            >
              <Hammer className="h-4 w-4" aria-hidden />
              Open Builder
            </Button>
          </div>
        ) : visibleSessions.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <Search className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">Nothing matches these filters</p>
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              tour={{ id: "onDemand.clearFilters", label: "Clear filters", help: "Reset the filters when nothing matches.", order: 110 }}
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleSessions.map((session) => renderSessionRow(session))}
          </div>
        )}
      </ScrollBody>
    </Screen>
  );
}
