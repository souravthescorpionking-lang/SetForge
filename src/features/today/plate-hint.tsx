"use client";

// Plate-loading hint for the set input: shows which plates to load per side
// for the current target weight, using the user's plate inventory.
// Pure client math (plateGreedy); inventory comes from the plates API.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Disc3 } from "lucide-react";
import { platesApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import { plateGreedy, type PlateLike } from "@/lib/formulas";
import { round1 } from "@/lib/client/format";
import { cn } from "@/lib/utils";

const DEFAULT_BAR: Record<"metric" | "imperial", number> = { metric: 20, imperial: 45 };

export function PlateHint({ weight, unitSystem }: { weight: number; unitSystem: string }) {
  const system = unitSystem === "imperial" ? "imperial" : "metric";
  const unit = system === "imperial" ? "lb" : "kg";
  const bar = DEFAULT_BAR[system];

  const plates = useQuery({
    queryKey: qk.plates(system),
    queryFn: () => platesApi.list(system),
    staleTime: 300_000,
    select: (d) => d.plates as Array<PlateLike & { colour: string }>,
  });

  const result = useMemo(() => {
    const inventory = plates.data;
    if (!inventory || weight <= bar) return null;
    const perSide = plateGreedy(weight, bar, inventory);
    if (!perSide) return { kind: "impossible" as const };
    const loaded = bar + perSide.reduce((s, p) => s + p.weight * p.count, 0) * 2;
    if (Math.abs(loaded - weight) < 0.01) return { kind: "exact" as const, perSide };
    return { kind: "near" as const, perSide, loaded };
  }, [plates.data, weight, bar]);

  if (!plates.data || !result) return null;

  const colourOf = (w: number) =>
    (plates.data!.find((p) => p.weight === w)?.colour || "#71717a") + "";

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key="plate-hint"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="overflow-hidden"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-0.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider">
            <Disc3 className="h-3 w-3" /> Per side
          </span>
          {result.kind === "impossible" ? (
            <span>Not loadable with your plates</span>
          ) : (
            <>
              {result.perSide.map((p) => (
                <span
                  key={p.weight}
                  className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/60 py-0.5 pl-1 pr-1.5 font-bold tabular-nums text-foreground/80"
                >
                  <span
                    aria-hidden
                    className={cn("h-2.5 w-2.5 rounded-full border border-black/20 shadow-sm")}
                    style={{ backgroundColor: colourOf(p.weight) }}
                  />
                  {round1(p.weight)}
                  {p.count > 1 && <span className="text-[10px] font-semibold text-muted-foreground">×{p.count}</span>}
                </span>
              ))}
              <span className="text-muted-foreground/70">
                + {bar}
                {unit} bar
              </span>
              {result.kind === "near" && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-600 dark:text-amber-400">
                  loads {round1(result.loaded)}
                  {unit}
                </span>
              )}
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
