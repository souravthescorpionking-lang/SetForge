"use client";

// Quick-add bar (desktop Today): type "bench 100x5 @8 t3-1-1 r90" →
// parsed preview → Enter adds the exercise (if missing) + set in one shot.
// Grammar: <exercise name> <weight>x<reps> [@rpe] [t<tempo>] [r<rest-sec>]
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Zap, CornerDownLeft } from "lucide-react";
import { toast } from "sonner";
import { exercisesApi, workoutsApi, type SetInput } from "@/lib/client/api";
import { qk, useInvalidate } from "@/lib/client/query";
import { todayKey } from "@/lib/client/format";
import { normaliseTempo } from "@/lib/constants";
import type { ExerciseDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

export type QuickAddParse = {
  name: string;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  tempo: string | null;
  restSec: number | null;
};

/** Parse the quick-add grammar. Returns null when the input doesn't match. */
export function parseQuickAdd(raw: string): QuickAddParse | null {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return null;
  const m = text.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)(.*)$/i);
  if (!m) return null;
  const name = m[1];
  const rest = m[4] ?? "";
  const weight = Number(m[2]);
  const reps = Number(m[3]);
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return null;

  let rpe: number | null = null;
  let tempo: string | null = null;
  let restSec: number | null = null;

  const rpeM = rest.match(/[@at]\s*(\d(?:[.,]\d)?)/i);
  if (rpeM) {
    const v = Number(rpeM[1].replace(",", "."));
    if (v >= 6 && v <= 10) rpe = v;
  }
  const tempoM = rest.match(/\bt\s?(\d{1,2}-\d{1,2}-\d{1,2}(?:-\d{1,2})?)/i);
  if (tempoM) tempo = normaliseTempo(tempoM[1]) ?? null;
  const restM = rest.match(/\br\s?(\d{1,4})\b/i);
  if (restM) {
    const v = Number(restM[1]);
    if (v > 0 && v <= 3600) restSec = v;
  }
  return { name: name.trim(), weight, reps, rpe, tempo, restSec };
}

export function QuickAddBar({ onAdded }: { onAdded: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();

  const parsed = useMemo(() => parseQuickAdd(text), [text]);

  // exercise candidates for the parsed name (only while a parse exists)
  const candidates = useQuery({
    queryKey: ["quickadd", parsed?.name ?? ""],
    queryFn: () => exercisesApi.list({ search: parsed!.name }),
    enabled: !!parsed && parsed.name.length >= 2,
    staleTime: 30_000,
    select: (list: ExerciseDTO[]) => {
      const q = parsed!.name.toLowerCase();
      const exact = list.find((e) => e.name.toLowerCase() === q);
      if (exact) return [exact];
      return list.slice(0, 6);
    },
  });

  const submit = async () => {
    if (!parsed || busy) return;
    const match = candidates.data?.[0];
    if (!match) {
      toast.error(`No exercise matches “${parsed.name}”`, {
        description: "Create it in the Exercises tab first, then quick-add sets.",
      });
      return;
    }
    setBusy(true);
    try {
      const tk = todayKey();
      const workout = await workoutsApi.createOrGet(tk);
      // find-or-create the workout exercise
      let we = workout.exercises.find((w) => w.exerciseId === match.id) ?? null;
      if (!we) {
        await workoutsApi.addExercise(workout.id, match.id);
        const fresh = await workoutsApi.byDate(tk);
        we = fresh.workout?.exercises.find((w) => w.exerciseId === match.id) ?? null;
      }
      if (!we) throw new Error("Could not add exercise to today's workout");

      const payload: SetInput = {
        weight: parsed.weight,
        reps: parsed.reps,
        rpe: parsed.rpe,
        tempo: parsed.tempo,
        restPlannedSec: parsed.restSec,
      };
      const created = await workoutsApi.addSet(workout.id, we.id, payload);
      invalidate.workout(tk);
      invalidate.exercises();
      toast.success(`Added to ${match.name}`, {
        description: `${parsed.weight}kg × ${parsed.reps}${parsed.rpe ? ` @ RPE ${parsed.rpe}` : ""}${created.newPr ? " · new PR! 🏆" : ""}`,
        icon: <Zap className="h-4 w-4 text-primary" />,
      });
      setText("");
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Quick add failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hidden lg:block">
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl border bg-card px-3 py-2 shadow-sm transition-colors",
          parsed && "border-primary/40",
        )}
      >
        <Zap className={cn("h-4.5 w-4.5 shrink-0", parsed ? "text-primary" : "text-muted-foreground")} aria-hidden />
        <input
          aria-label="Quick add set"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void submit(); }
          }}
          placeholder='Quick add — e.g. "bench 100x5 @8 t3-1-1 r90"'
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
        {parsed && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs">
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold tabular-nums">
              {parsed.name} · {parsed.weight}kg × {parsed.reps}
            </span>
            {parsed.rpe != null && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold tabular-nums text-primary">@{parsed.rpe}</span>}
            {parsed.tempo && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 font-bold tabular-nums text-violet-600 dark:text-violet-400">t{parsed.tempo}</span>}
            {parsed.restSec != null && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-bold tabular-nums text-emerald-600 dark:text-emerald-400">r{parsed.restSec}s</span>}
          </span>
        )}
        <Button
          size="sm"
          className="h-9 shrink-0 rounded-xl px-3 text-xs font-bold"
          disabled={!parsed || busy || candidates.isLoading}
          onClick={() => void submit()}
        >
          {busy ? "Adding…" : "Add"}
          {!busy && <CornerDownLeft className="ml-1 h-3.5 w-3.5" />}
        </Button>
      </div>
      {!parsed && text.length > 0 && (
        <p className="mt-1 pl-9 text-[11px] text-muted-foreground">
          Format: exercise + weight×reps, then @rpe · t3-1-1-0 tempo · r90 rest
        </p>
      )}
    </div>
  );
}
