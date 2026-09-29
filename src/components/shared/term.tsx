"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Term — Part 8 §6.10 inline dictionary component. Every term label (RPE,
// Tempo, AMRAP, Superset, Triset, Giant set, e1RM, Deload, Warm-up, Rest,
// Progression) renders through <Term id="…">: dotted underline; tap → 48px
// expanded inline popover with the definition + "Open dictionary".
// The dictionary screen stays; definitions come from the dictionary API
// (cached via TanStack Query — one fetch per session).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dictionaryApi } from "@/lib/client/api";
import type { DictionaryTermDTO } from "@/lib/types";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export type TermId =
  | "RPE"
  | "Tempo"
  | "AMRAP"
  | "Superset"
  | "Triset"
  | "Giant set"
  | "e1RM"
  | "Deload"
  | "Warm-up"
  | "Rest"
  | "Progression";

/** Static fallback definitions — shown instantly (before the API resolves)
 *  and whenever the dictionary endpoint has no matching term. */
const FALLBACK: Record<TermId, string> = {
  RPE: "Rate of Perceived Exertion — how hard a set felt, 1–10 in half steps.",
  Tempo: "Lifting speed, e.g. 4/0/1/0: seconds down, pause, up, pause.",
  AMRAP: "As Many Reps As Possible — an open-ended set (∞).",
  Superset: "Two exercises performed back-to-back with no rest between.",
  Triset: "Three exercises performed back-to-back.",
  "Giant set": "Four or more exercises performed back-to-back.",
  e1RM: "Estimated one-rep max, projected from a set via your chosen formula.",
  Deload: "A planned reduction in weight after repeated missed targets.",
  "Warm-up": "Lighter ramp-up sets (type W) that prepare you for working sets.",
  Rest: "Recovery time between sets — planned seconds per set.",
  Progression: "A rule that raises (or deloads) your next prescribed weight.",
};

const query = { queryKey: ["dictionary"], queryFn: () => dictionaryApi.get(), staleTime: Infinity } as const;

export function Term({ id, children, className }: { id: TermId; children?: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery(query);
  const match = data?.terms?.find((t: DictionaryTermDTO) => t.term.toLowerCase() === id.toLowerCase());
  const definition = match?.definition ?? FALLBACK[id];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${id} — show definition`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "text-left font-medium underline decoration-dotted decoration-from-font underline-offset-2 hover:text-foreground",
            className,
          )}
        >
          {children ?? id}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="flex min-h-12 items-center justify-between gap-2 px-3 py-2">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{id}</span>
          <button
            type="button"
            aria-label={`Open dictionary at ${id}`}
            onClick={() => {
              setOpen(false);
              window.location.hash = `#/dictionary?term=${encodeURIComponent(id)}`;
            }}
            className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary"
          >
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            Open dictionary
          </button>
        </div>
        <p className="border-t border-border px-3 py-2 text-sm leading-relaxed text-muted-foreground">{definition}</p>
      </PopoverContent>
    </Popover>
  );
}
