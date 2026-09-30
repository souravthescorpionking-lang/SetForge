"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuilderAddExerciseScreen — §4.3 "Add exercise"
// (#/builder/session/{id|new}/add?series=new|{seriesId}).
//
//   TopBar (56)   : BackButton → the build screen · "Add exercise"
//                   · "{k} selected" chip (k>0) → …/add/selected
//   SubBar (48)   : search (local draft — baked into URLs on navigate-away)
//   Filter row 40 : "Muscle ▾" / "Equipment ▾" chips (count badges when
//                   active) → #/filters/muscle|equipment?return={this hash}
//   Helper row 32 : "Up to 4 per series." (only when series = existing)
//   First-run 96  : localStorage "sf-builder-add-help" prose card
//                   (1 = single · 2 = superset · 3 = triset · 4 = giant set)
//   List rows 56  : checkbox · name · muscle chips (max 2); selected rows
//                   carry the 4px accent bar (L4)
//   BottomBar (56): label by k (Add exercise / superset / triset / giant set /
//                   {k} exercises; "Add to {label}" for an existing series)
//
// ALL flow state round-trips in the add route's URL (?series=&q=&muscles=&
// equipment=&selected=): selection taps go through replaceHash (no history
// pollution), the filter routes replace their dimension via ?return=. Picks
// apply into the DRAFT store (new) or the existing day APIs ({id}).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronDown, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { routinesApi } from "@/lib/client/api";
import { qk, useExercises, useInvalidate, useOnline } from "@/lib/client/query";
import { builderMuscleKeysToEnum } from "@/lib/constants";
import { groupLabelForSize } from "@/lib/grouping";
import { replaceHash } from "@/features/shell/router";
import { useDebounced, chipClass } from "@/features/library/library-shared";
import { errorMessage } from "@/features/routines/screen-helpers";
import { uuid7 } from "@/lib/uuid7";
import type { ExerciseDTO, RoutineDayDTO } from "@/lib/types";
import { useBuilderDraft } from "./draft-store";
import {
  addExerciseHash,
  currentHashQuery,
  initialHashQuery,
  parseAddFlowQuery,
  type AddFlowQuery,
} from "./add-flow-url";
import { CheckboxMark, MuscleChips } from "./add-flow-shared";

const SF_BUILDER_ADD_HELP = "sf-builder-add-help";

/** BottomBar label by picked count (§4.3). */
export function addLabelFor(k: number, seriesExisting: boolean, seriesLabel: string): string {
  if (k === 0) return "Add";
  if (seriesExisting) return `Add to ${seriesLabel}`;
  switch (k) {
    case 1:
      return "Add exercise";
    case 2:
      return "Add as superset";
    case 3:
      return "Add as triset";
    case 4:
      return "Add as giant set";
    default:
      return `Add ${k} exercises`;
  }
}

function resultToastFor(k: number, seriesExisting: boolean, seriesLabel: string): string {
  if (seriesExisting) return `Added to ${seriesLabel}`;
  switch (k) {
    case 1:
      return "Exercise added";
    case 2:
      return "Superset added";
    case 3:
      return "Triset added";
    case 4:
      return "Giant set added";
    default:
      return `${k} exercises added`;
  }
}

export default function BuilderAddExerciseScreen({ routineId }: { routineId: string }) {
  const navigate = useApp((s) => s.navigate);
  const online = useOnline();
  const invalidate = useInvalidate();
  const draftStore = useBuilderDraft();
  const isDraft = routineId === "new";

  // ---------- URL state (replaceHash updates land here while mounted) ----------
  const [query, setQuery] = useState(() => initialHashQuery());
  useEffect(() => {
    const onHash = () => setQuery(currentHashQuery());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const flow = useMemo(() => parseAddFlowQuery(query), [query]);
  const seriesParam = flow.series;

  // ---------- search (local draft; baked into every hash we build) ----------
  const [qDraft, setQDraft] = useState<string | null>(null);
  const qValue = qDraft ?? flow.q;
  const debouncedQ = useDebounced(qValue, 250);

  // ---------- data ----------
  const listParams = useMemo(
    () => ({
      q: debouncedQ.trim() || undefined,
      muscles: builderMuscleKeysToEnum(flow.muscles),
      equipment: flow.equipment,
    }),
    [debouncedQ, flow.muscles, flow.equipment],
  );
  const { data: exercises, isLoading } = useExercises(listParams);
  // Full catalog: picks may sit outside the currently filtered view.
  const { data: allExercises } = useExercises();

  const { data: routine } = useQuery({
    queryKey: qk.routine(isDraft ? "draft-new" : routineId),
    queryFn: () => routinesApi.get(routineId),
    enabled: !isDraft,
    retry: 1,
  });
  const day: RoutineDayDTO | null = useMemo(() => {
    if (isDraft) return null;
    const days = routine ? [...routine.days].sort((a, b) => a.sortOrder - b.sortOrder) : [];
    return days.find((d) => (d.dayType ?? "WORKOUT") !== "REST") ?? null;
  }, [routine, isDraft]);

  // ---------- the target series (cap + label) ----------
  const seriesMembers = useMemo(() => {
    if (seriesParam === "new") return [] as Array<{ id: string; groupId: string | null }>;
    const list = isDraft
      ? (draftStore.draft?.exercises ?? []).map((e) => ({ id: e.id, groupId: e.groupId }))
      : (day?.exercises ?? []).map((re) => ({ id: re.id, groupId: re.groupId ?? null }));
    const byGroup = list.filter((x) => x.groupId === seriesParam);
    if (byGroup.length > 0) return byGroup;
    return list.filter((x) => x.id === seriesParam); // singleton series
  }, [seriesParam, isDraft, draftStore.draft, day]);

  const seriesExisting = seriesParam !== "new";
  const cap = seriesExisting ? Math.max(0, 4 - seriesMembers.length) : Number.POSITIVE_INFINITY;
  const seriesLabel = groupLabelForSize(seriesMembers.length) || "series";
  const selected = flow.selected;
  const k = selected.length;

  // ---------- URL builders ----------
  const stateFor = (overrides?: Partial<AddFlowQuery>): AddFlowQuery => ({
    series: seriesParam,
    q: qValue,
    muscles: flow.muscles,
    equipment: flow.equipment,
    selected,
    ...overrides,
  });
  const addHash = (overrides?: Partial<AddFlowQuery>) => addExerciseHash(routineId, stateFor(overrides));

  const togglePick = (exerciseId: string) => {
    if (selected.includes(exerciseId)) {
      replaceHash(addHash({ selected: selected.filter((id) => id !== exerciseId) }));
      return;
    }
    if (selected.length >= cap) {
      toast.info("Up to 4 per series.");
      return;
    }
    replaceHash(addHash({ selected: [...selected, exerciseId] }));
  };

  const hasFilters = flow.muscles.length > 0 || flow.equipment.length > 0 || debouncedQ.trim() !== "";
  const clearFilters = () => {
    setQDraft("");
    replaceHash(addHash({ q: "", muscles: [], equipment: [] }));
  };

  const openFilters = (kind: "muscle" | "equipment") => {
    navigate(`/filters/${kind}?return=${encodeURIComponent(addHash())}`);
  };

  // ---------- first-run helper (localStorage; not a modal — L3) ----------
  const [helpGone, setHelpGone] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage.getItem(SF_BUILDER_ADD_HELP) === "1",
  );
  const dismissHelp = (persist: boolean) => {
    if (persist) {
      try {
        window.localStorage.setItem(SF_BUILDER_ADD_HELP, "1");
      } catch {
        // private mode — the card simply returns next visit
      }
    }
    setHelpGone(true);
  };

  // ---------- apply ----------
  const [applying, setApplying] = useState(false);

  const resolvePicks = (): ExerciseDTO[] => {
    const pool = new Map<string, ExerciseDTO>();
    for (const e of allExercises ?? []) pool.set(e.id, e);
    for (const e of exercises ?? []) pool.set(e.id, e);
    return selected.map((id) => pool.get(id)).filter((e): e is ExerciseDTO => e != null);
  };

  const apply = () => {
    if (k === 0 || applying) return;
    if (isDraft) {
      const picks = resolvePicks();
      if (picks.length !== selected.length) {
        toast.info("Exercises are still loading — try again in a moment");
        return;
      }
      applyDraft(picks);
      return;
    }
    void applyPersisted();
  };

  const applyDraft = (picks: ExerciseDTO[]) => {
    if (seriesParam === "new") {
      draftStore.addSeries(picks);
    } else {
      const draft = draftStore.draft;
      const asGroup = (draft?.exercises ?? []).some((e) => e.groupId === seriesParam);
      if (asGroup) {
        draftStore.addToSeries(seriesParam, picks);
      } else {
        // Singleton series: mint the shared group, then join the picks to it.
        const gid = uuid7();
        draftStore.patchExercise(seriesParam, { groupId: gid });
        draftStore.addToSeries(gid, picks);
      }
    }
    toast.success(resultToastFor(k, seriesExisting, seriesLabel));
    navigate(`/builder/session/${routineId}`);
  };

  const applyPersisted = async () => {
    if (!day) return;
    if (!online) {
      toast.info("Adding exercises needs a connection");
      return;
    }
    setApplying(true);
    try {
      const addedReIds: string[] = [];
      for (const exerciseId of selected) {
        const r = await routinesApi.addExercise(routineId, day.id, exerciseId);
        const dayNow = r.days.find((d) => d.id === day.id);
        const ordered = [...(dayNow?.exercises ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
        const newRe = ordered[ordered.length - 1];
        if (newRe) addedReIds.push(newRe.id);
      }
      if (seriesParam === "new") {
        // k=2..4 → ONE series; k=1 / k≥5 → members stay solo (§4.3 rules).
        if (addedReIds.length >= 2 && addedReIds.length <= 4) {
          const group = await routinesApi.addGroup(routineId, { assignReId: addedReIds[0] });
          for (const reId of addedReIds.slice(1)) {
            await routinesApi.updateExercise(routineId, day.id, reId, { groupId: group.groupId });
          }
        }
      } else {
        const asGroup = day.exercises.some((re) => re.groupId === seriesParam);
        let groupId = asGroup ? seriesParam : null;
        if (groupId == null) {
          const group = await routinesApi.addGroup(routineId, { assignReId: seriesParam });
          groupId = group.groupId;
        }
        for (const reId of addedReIds) {
          await routinesApi.updateExercise(routineId, day.id, reId, { groupId });
        }
      }
      invalidate.routines();
      invalidate.customWorkouts();
      toast.success(resultToastFor(k, seriesExisting, seriesLabel));
      navigate(`/builder/session/${routineId}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setApplying(false);
    }
  };

  const addLabel = addLabelFor(k, seriesExisting, seriesLabel);
  const applyDisabled = k === 0 || applying || (!isDraft && (!day || !online));

  // ---------- render ----------
  const rows = exercises ?? [];

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash={`#/builder/session/${routineId}`} label="Back to Build workout" />}
          title={
            <span {...tourAttrs({ id: "builderAdd.title", label: "Add exercise", help: "Pick exercises for this workout.", order: 10 })}>
              Add exercise
            </span>
          }
          actions={
            <>
              {k > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-none rounded-full px-4 text-sm font-bold tabular-nums"
                  tour={{ id: "builderAdd.selected", label: "Selected", help: "Review, reorder or remove the picked exercises.", order: 20 }}
                  onClick={() =>
                    navigate(`/builder/session/${routineId}/add/selected?return=${encodeURIComponent(addHash())}`)
                  }
                >
                  {k} selected
                </Button>
              ) : null}
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
            value={qValue}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Search exercises…"
            aria-label="Search exercises"
            {...tourAttrs({ id: "builderAdd.search", label: "Search", help: "Search the catalog by exercise name.", order: 30 })}
            className="h-10 min-w-0 flex-1"
          />
        </SubBar>
      }
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            className="h-11 w-full gap-1.5 text-base font-bold"
            disabled={applyDisabled}
            aria-label={addLabel}
            tour={{ id: "builderAdd.apply", label: "Add", help: "Add the picked exercises and return to the workout.", order: 70 }}
            onClick={apply}
          >
            {applying ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Plus className="h-5 w-5" aria-hidden />}
            {addLabel}
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody>
        {/* ---------- filter chips row 40 ---------- */}
        <div data-row className="flex h-10 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap px-1">
          <button
            type="button"
            aria-pressed={flow.muscles.length > 0}
            className={chipClass(flow.muscles.length > 0)}
            {...tourAttrs({ id: "builderAdd.muscleFilter", label: "Muscle", help: "Filter the list by target muscles.", order: 40 })}
            onClick={() => openFilters("muscle")}
          >
            Muscle{flow.muscles.length > 0 ? ` · ${flow.muscles.length}` : ""}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-pressed={flow.equipment.length > 0}
            className={chipClass(flow.equipment.length > 0)}
            {...tourAttrs({ id: "builderAdd.equipmentFilter", label: "Equipment", help: "Filter the list by the gear it needs.", order: 50 })}
            onClick={() => openFilters("equipment")}
          >
            Equipment{flow.equipment.length > 0 ? ` · ${flow.equipment.length}` : ""}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        {/* ---------- §4.3 helper row (existing series only) ---------- */}
        {seriesExisting ? (
          <p
            data-row
            className="flex h-8 w-full flex-none items-center overflow-hidden whitespace-nowrap px-3 text-xs font-medium text-muted-foreground"
          >
            Up to 4 per series.
          </p>
        ) : null}

        {/* ---------- first-run helper card (96px, L3 inline) ---------- */}
        {!helpGone ? (
          <div
            data-row
            className="flex h-24 w-full flex-none flex-col justify-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/20 px-3"
          >
            <p className="text-[11px] leading-snug text-muted-foreground">
              1 = single · 2 = superset · 3 = triset · 4 = giant set · 5+ = added separately. You can regroup later.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                tour={{ skipTour: true, reason: "Got-it button inside the first-run helper card" }}
                className="h-8 flex-none rounded-lg px-3 text-xs font-bold"
                onClick={() => dismissHelp(false)}
              >
                Got it
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                tour={{ skipTour: true, reason: "Dismiss-forever button inside the first-run helper card" }}
                className="h-8 flex-none rounded-lg px-3 text-xs font-medium text-muted-foreground"
                onClick={() => dismissHelp(true)}
              >
                Don&apos;t show again
              </Button>
            </div>
          </div>
        ) : null}

        {/* ---------- list ---------- */}
        {isLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading exercises">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : rows.length === 0 ? (
          <div
            role="group"
            aria-label="No exercises"
            className="flex h-[200px] w-full flex-none flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border"
          >
            <p className="px-4 text-center text-sm font-semibold">
              {hasFilters ? "No exercises match. Try changing filters." : "No exercises yet."}
            </p>
            {hasFilters ? (
              <Button
                type="button"
                variant="outline"
                tour={{ id: "builderAdd.clearFilters", label: "Clear", help: "Drop the active filters and search.", order: 80 }}
                onClick={clearFilters}
              >
                Clear
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="divide-y divide-border/60">
              {rows.map((ex) => {
                const isSel = selected.includes(ex.id);
                return (
                  <button
                    key={ex.id}
                    type="button"
                    data-row
                    role="checkbox"
                    aria-checked={isSel}
                    aria-label={`Select ${ex.name}`}
                    {...tourAttrs({ id: "builderAdd.row", label: "Exercise row", help: "Pick this exercise; 2+ picks form a series.", order: 60 })}
                    onClick={() => togglePick(ex.id)}
                    className={cn(
                      "relative flex h-14 w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 text-left transition-colors hover:bg-accent/50",
                      isSel && "bg-primary/5",
                    )}
                    style={isSel ? { boxShadow: "inset 4px 0 0 0 var(--primary)" } : undefined}
                  >
                    <CheckboxMark checked={isSel} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{ex.name}</span>
                    <MuscleChips muscles={ex.primaryMuscles ?? []} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="h-2 flex-none" aria-hidden />
      </ScrollBody>
    </Screen>
  );
}
