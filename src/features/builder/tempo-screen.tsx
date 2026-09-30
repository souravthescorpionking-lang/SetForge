"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TempoScreen — §4.6 tempo picker (#/tempo/{reId}?routineId=&dayId=&return=).
//
//   TopBar (56)   : BackButton → the caller · "Tempo" · Apply
//   Prose row 40  : "eccentric-pause-concentric-pause"
//   Presets 48    : radio rows — the 8 §4.6 presets + "None"
//   Custom row 48 : radio "Custom" + preview; selecting reveals the 4 inline
//                   numeric inputs (the 3rd accepts "x" = explosive)
//
// TWO models (the ExerciseEditor's tempo chip routes here for both):
//   · DRAFT exercises (reId = client uuid) — reads/writes the Zustand draft.
//   · Persisted RoutineExercise — Apply writes the tempo to EVERY existing
//     set of that exercise through the sets PATCH API (the sets ARE the
//     series-level prescription — RoutineExercise has no separate tempo
//     column; documented single-source decision).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { routinesApi } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { TEMPO_PRESETS } from "@/lib/constants";
import { errorMessage } from "@/features/routines/screen-helpers";
import { useBuilderDraft } from "./draft-store";
import { initialHashQuery } from "./add-flow-url";
import { RadioMark } from "./add-flow-shared";
import type { RoutineDayDTO, RoutineExerciseDTO } from "@/lib/types";

type TempoSelection =
  | { mode: "none" }
  | { mode: "preset"; value: string }
  | { mode: "custom"; parts: [string, string, string, string] };

function seedOf(tempo: string | null): TempoSelection {
  if (tempo == null) return { mode: "none" };
  if ((TEMPO_PRESETS as readonly string[]).includes(tempo)) return { mode: "preset", value: tempo };
  const parts = tempo.split("-");
  if (parts.length === 3) parts.push("0");
  if (parts.length !== 4) return { mode: "none" };
  return { mode: "custom", parts: [parts[0], parts[1], parts[2], parts[3]] };
}

function tempoOfSelection(sel: TempoSelection): string | null {
  if (sel.mode === "none") return null;
  if (sel.mode === "preset") return sel.value;
  return sel.parts.map((p, i) => (i === 2 && p.toLowerCase() === "x" ? "x" : p === "" ? "0" : p)).join("-");
}

const sanitizePart = (raw: string, allowX: boolean): string => {
  const v = raw.toLowerCase();
  if (allowX && v === "x") return "x";
  return v.replace(/\D/g, "").slice(0, 2);
};

export default function TempoScreen({ reId }: { reId: string }) {
  const navigate = useApp((s) => s.navigate);
  const online = useOnline();
  const invalidate = useInvalidate();
  const draftStore = useBuilderDraft();

  // ?routineId=&dayId=&return= (persisted callers pass ids; drafts don't).
  const params = useMemo(() => initialHashQuery(), []);
  const routineId = params.get("routineId");
  const dayIdParam = params.get("dayId");
  const returnPath = params.get("return") ?? (routineId ? `/builder/session/${routineId}` : "/builder/session/new");

  // ---------- resolve the exercise (draft store first, then the API) ----------
  const draftEx = useBuilderDraft((s) => s.draft?.exercises.find((e) => e.id === reId) ?? null);
  const isDraft = draftEx != null;

  const { data: routine, isLoading } = useQuery({
    queryKey: qk.routine(routineId ?? "draft-new"),
    queryFn: () => routinesApi.get(routineId!),
    enabled: !isDraft && routineId != null,
    retry: 1,
  });

  const day: RoutineDayDTO | null = useMemo(() => {
    if (isDraft || !routine) return null;
    const days = [...routine.days].sort((a, b) => a.sortOrder - b.sortOrder);
    return dayIdParam ? (days.find((d) => d.id === dayIdParam) ?? null) : (days.find((d) => (d.dayType ?? "WORKOUT") !== "REST") ?? null);
  }, [routine, isDraft, dayIdParam]);

  const re: RoutineExerciseDTO | null = useMemo(() => {
    if (isDraft || !day) return null;
    return day.exercises.find((x) => x.id === reId) ?? null;
  }, [day, isDraft, reId]);

  const currentTempo = useMemo(() => {
    if (isDraft) return draftEx.sets.find((s) => s.tempo?.trim())?.tempo ?? null;
    if (!re) return null;
    return [...re.sets].sort((a, b) => a.sortOrder - b.sortOrder).find((s) => s.tempo?.trim())?.tempo ?? null;
  }, [isDraft, draftEx, re]);

  const loading = !isDraft && (isLoading || routineId == null || !re);

  // ---------- selection (seeded once the row resolves) ----------
  const [sel, setSel] = useState<TempoSelection>(() => seedOf(currentTempo));
  const [seededOnce, setSeededOnce] = useState(false);
  if (!seededOnce && !loading) {
    setSeededOnce(true);
    setSel(seedOf(currentTempo));
  }

  const [saving, setSaving] = useState(false);

  const apply = () => {
    if (saving) return;
    const tempo = tempoOfSelection(sel);
    if (isDraft) {
      for (const s of draftEx.sets) draftStore.patchSet(reId, s.id, { tempo });
      toast.success(tempo ? `Tempo ${tempo} saved` : "Tempo cleared");
      navigate(returnPath);
      return;
    }
    if (!re || !day || !routineId) return;
    if (!online) {
      toast.info("Saving needs a connection");
      return;
    }
    setSaving(true);
    void (async () => {
      try {
        for (const s of [...re.sets].sort((a, b) => a.sortOrder - b.sortOrder)) {
          await routinesApi.updateSet(routineId, day.id, reId, s.id, { tempo });
        }
        invalidate.routines();
        toast.success(tempo ? `Tempo ${tempo} saved` : "Tempo cleared");
        navigate(returnPath);
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setSaving(false);
      }
    })();
  };

  const presetRows = TEMPO_PRESETS;
  const customPreview =
    sel.mode === "custom" ? tempoOfSelection(sel) ?? "" : currentTempo && seedOf(currentTempo).mode === "custom" ? currentTempo : "";

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash={`#${returnPath.startsWith("/") ? returnPath : `/${returnPath}`}`} label="Back" />}
          title={
            <span {...tourAttrs({ id: "tempo.title", label: "Tempo", help: "Pick the rep timing for every set.", order: 10 })}>
              Tempo
            </span>
          }
          actions={
            <>
              <Button
                type="button"
                className="h-11 flex-none gap-1.5 px-4 text-sm font-bold"
                disabled={saving || loading}
                aria-label="Apply tempo"
                tour={{ id: "tempo.apply", label: "Apply", help: "Save this tempo to every set of the exercise.", order: 60 }}
                onClick={apply}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                Apply
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
    >
      <ScrollBody>
        {/* ---------- prose row 40 ---------- */}
        <p
          data-row
          className="flex h-10 w-full flex-none items-center overflow-hidden whitespace-nowrap px-3 text-sm text-muted-foreground"
        >
          eccentric-pause-concentric-pause
        </p>

        {loading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading tempo">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="divide-y divide-border/60">
              {presetRows.map((preset) => {
                const active = sel.mode === "preset" && sel.value === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    data-row
                    role="radio"
                    aria-checked={active}
                    aria-label={`Tempo ${preset}`}
                    {...tourAttrs({ id: "tempo.row", label: "Preset row", help: "A standard tempo, e.g. 3-0-1-0.", order: 20 })}
                    onClick={() => setSel({ mode: "preset", value: preset })}
                    className="flex h-12 w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 text-left text-sm tabular-nums transition-colors hover:bg-accent/50"
                  >
                    <RadioMark active={active} />
                    <span className={cn("min-w-0 flex-1 truncate", active && "font-medium")}>{preset}</span>
                  </button>
                );
              })}
              {/* ---------- None ---------- */}
              <button
                type="button"
                data-row
                role="radio"
                aria-checked={sel.mode === "none"}
                aria-label="No tempo"
                {...tourAttrs({ id: "tempo.none", label: "None", help: "Clear the tempo for this exercise.", order: 30 })}
                onClick={() => setSel({ mode: "none" })}
                className="flex h-12 w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 text-left text-sm transition-colors hover:bg-accent/50"
              >
                <RadioMark active={sel.mode === "none"} />
                <span className={cn("min-w-0 flex-1 truncate", sel.mode === "none" && "font-medium")}>None</span>
              </button>
              {/* ---------- Custom ---------- */}
              <button
                type="button"
                data-row
                role="radio"
                aria-checked={sel.mode === "custom"}
                aria-label="Custom tempo"
                {...tourAttrs({ id: "tempo.custom", label: "Custom", help: "Write your own four tempo numbers.", order: 40 })}
                onClick={() => {
                  const seed = seedOf(customPreview || null);
                  setSel(
                    seed.mode === "custom"
                      ? { mode: "custom", parts: seed.parts }
                      : { mode: "custom", parts: ["", "", "", ""] },
                  );
                }}
                className="flex h-12 w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 text-left text-sm transition-colors hover:bg-accent/50"
              >
                <RadioMark active={sel.mode === "custom"} />
                <span className={cn("min-w-0 flex-1 truncate", sel.mode === "custom" && "font-medium")}>Custom</span>
                {customPreview && sel.mode !== "custom" ? (
                  <span className="flex-none text-xs tabular-nums text-muted-foreground">{customPreview}</span>
                ) : null}
              </button>
              {sel.mode === "custom" ? (
                <div
                  data-row
                  role="group"
                  aria-label="Custom tempo values"
                  className="flex h-12 w-full items-center justify-center gap-1 overflow-hidden whitespace-nowrap bg-muted/20 px-3 tabular-nums"
                >
                  {([0, 1, 2, 3] as const).map((i) => (
                    <span key={i} className="flex flex-none items-center gap-1">
                      {i > 0 ? <span className="text-sm text-muted-foreground" aria-hidden>-</span> : null}
                      <Input
                        inputMode="numeric"
                        value={sel.parts[i]}
                        aria-label={["Eccentric seconds", "Pause seconds", "Concentric seconds or x", "Second pause seconds"][i]}
                        {...tourAttrs({ id: "tempo.customInput", label: "Tempo field", help: "One tempo segment — the third may be x for explosive.", order: 50 })}
                        onChange={(e) => {
                          const v = sanitizePart(e.target.value, i === 2);
                          setSel((prev) =>
                            prev.mode === "custom"
                              ? { mode: "custom", parts: prev.parts.map((p, idx) => (idx === i ? v : p)) as [string, string, string, string] }
                              : prev,
                          );
                        }}
                        className="h-9 w-11 flex-none px-1 text-center tabular-nums"
                      />
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}
        <p className="px-1 text-xs leading-snug text-muted-foreground">
          The four numbers are seconds: lower the weight (eccentric), pause, lift it (concentric — x = explosive), pause.
        </p>
      </ScrollBody>
    </Screen>
  );
}
