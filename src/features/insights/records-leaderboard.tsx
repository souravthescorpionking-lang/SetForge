"use client";

// Records leaderboard — all-time bests per exercise with sortable columns.
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CategoryDot } from "@/components/shared/category-dot";
import { Award, ChevronRight } from "lucide-react";
import { formatDayShort, round1 } from "@/lib/client/format";
import type { AllRecordsRow } from "@/lib/client/api";

type SortKey = "oneRm" | "weight" | "volume" | "sets";

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "oneRm", label: "e1RM" },
  { key: "weight", label: "Best" },
  { key: "volume", label: "Volume" },
  { key: "sets", label: "Sets" },
];

export function RecordsLeaderboard({
  records,
  onOpenExercise,
}: {
  records: AllRecordsRow[];
  onOpenExercise: (exerciseId: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>("oneRm");

  const sorted = useMemo(() => {
    const rows = [...records];
    switch (sort) {
      case "weight":
        return rows.sort((a, b) => (b.bestWeight ?? 0) - (a.bestWeight ?? 0));
      case "volume":
        return rows.sort((a, b) => b.volume - a.volume);
      case "sets":
        return rows.sort((a, b) => b.setCount - a.setCount);
      default:
        return rows.sort((a, b) => (b.estimatedOneRm ?? 0) - (a.estimatedOneRm ?? 0));
    }
  }, [records, sort]);

  return (
    <Card className="rounded-2xl border-border/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Personal records</h3>
        </div>
        <ToggleGroup
          type="single"
          value={sort}
          onValueChange={(v) => v && setSort(v as SortKey)}
          className="h-8"
        >
          {SORTS.map((s) => (
            <ToggleGroupItem
              key={s.key}
              value={s.key}
              className="h-8 rounded-lg px-2.5 text-xs font-semibold"
            >
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No records yet — log sets to start breaking them.
        </p>
      ) : (
        <ul className="max-h-[420px] divide-y divide-border/50 overflow-y-auto scroll-slim">
          {sorted.map((r, i) => (
            <motion.li
              key={r.exerciseId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
            >
              <button
                type="button"
                onClick={() => onOpenExercise(r.exerciseId)}
                className="flex w-full items-center gap-2.5 px-1 py-2.5 text-left transition-colors hover:bg-muted/40 rounded-lg"
              >
                <span className="w-5 shrink-0 text-right text-[11px] font-black text-muted-foreground numeric">
                  {i + 1}
                </span>
                {r.categoryColour && <CategoryDot colour={r.categoryColour} className="h-2.5 w-2.5" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.exerciseName}</p>
                  {r.bestWeight != null && r.bestWeightDate && (
                    <p className="text-[11px] text-muted-foreground">
                      {round1(r.bestWeight)}
                      {r.bestWeightReps != null && ` × ${r.bestWeightReps}`} ·{" "}
                      {formatDayShort(r.bestWeightDate.slice(0, 10))}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span className="text-right">
                    <span className="block font-black text-primary numeric">
                      {r.estimatedOneRm != null ? round1(r.estimatedOneRm) : "–"}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">e1RM kg</span>
                  </span>
                  <span className="hidden text-right sm:block">
                    <span className="block font-bold numeric">{round1(r.volume)}</span>
                    <span className="block text-[10px] text-muted-foreground">vol kg</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </Card>
  );
}
