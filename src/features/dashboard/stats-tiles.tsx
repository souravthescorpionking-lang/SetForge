"use client";

// ─────────────────────────────────────────────────────────────────────────────
// StatsTiles — the §7 Dashboard "Stats" block: two ~96px tiles side by side,
// each with a 4px left accent bar (L4).
//
//   Weight: "{latest} {unit}" · sub "7-day avg {avg}" or "No weigh-ins" → #/progress
//   Steps:  "{today}/{goal}" · sub "{pct}%"                            → #/steps
//
// Weight comes from useBodyWeight (the measurements-system weigh-in view);
// steps from GET /api/steps (today's entry + the daily goal).
// ─────────────────────────────────────────────────────────────────────────────

import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { round1 } from "@/lib/client/format";
import { useBodyWeight } from "@/features/body/use-body-weight";
import { useTodaySteps } from "./today-section";
import { cn } from "@/lib/utils";

const TILE_CLASS =
  "flex h-24 min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function StatsTiles({ today }: { today: string }) {
  const navigate = useApp((s) => s.navigate);
  const weight = useBodyWeight();
  const stepsQuery = useTodaySteps(today);

  const todaySteps = stepsQuery.data?.entries.find((e) => e.date === today)?.steps ?? 0;
  const goal = stepsQuery.data?.goal ?? 10_000;
  const pct = Math.min(100, Math.round((todaySteps / Math.max(1, goal)) * 100));

  const loading = weight.loading || stepsQuery.isLoading;

  return (
    <>
      <div data-row className="flex h-10 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap px-1">
        <p className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wider text-muted-foreground">Stats</p>
        <button
          type="button"
          {...tourAttrs({
            id: "dashboard.statsSeeAll",
            label: "See all",
            help: "Open the Progress screen: weigh-in chart, history and photos.",
            order: 50,
          })}
          onClick={() => navigate("/progress")}
          className="flex h-8 flex-none items-center gap-1 rounded-md text-xs font-semibold text-primary transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="truncate">See all</span>
          <ChevronRight className="h-3.5 w-3.5 flex-none" aria-hidden />
        </button>
      </div>
      <div className="flex w-full flex-none gap-2">
        {/* Weight tile → #/progress */}
        <button
          type="button"
          data-row
          {...tourAttrs({
            id: "dashboard.weightTile",
            label: "Weight tile",
            help: "Your latest weigh-in with its 7-day average. Tap for the full chart.",
            order: 60,
          })}
          onClick={() => navigate("/progress")}
          aria-label={
            weight.latest != null
              ? `Weight: ${round1(weight.latest)} ${weight.unit ?? ""}, 7-day average ${round1(weight.avg7 ?? 0)}`
              : "No weigh-ins yet"
          }
          className={TILE_CLASS}
        >
          <span className="h-16 w-1 flex-none rounded-full bg-primary" aria-hidden />
          {loading ? (
            <span className="flex min-w-0 flex-1 flex-col gap-1.5" aria-busy="true">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-3 w-24" />
            </span>
          ) : (
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-lg font-bold leading-none tabular-nums">
                {weight.latest != null ? `${round1(weight.latest)} ${weight.unit ?? ""}` : "—"}
              </span>
              <span className="truncate text-xs leading-none text-muted-foreground">
                {weight.avg7 != null ? `7-day avg ${round1(weight.avg7)}` : "No weigh-ins"}
              </span>
            </span>
          )}
        </button>
        {/* Steps tile → #/steps */}
        <button
          type="button"
          data-row
          {...tourAttrs({
            id: "dashboard.stepsTile",
            label: "Steps tile",
            help: "Today's steps against your daily goal. Tap to log steps.",
            order: 70,
          })}
          onClick={() => navigate("/steps")}
          aria-label={`Steps: ${todaySteps.toLocaleString()} of ${goal.toLocaleString()}, ${pct}% of goal`}
          className={TILE_CLASS}
        >
          <span className="h-16 w-1 flex-none rounded-full bg-primary" aria-hidden />
          {loading ? (
            <span className="flex min-w-0 flex-1 flex-col gap-1.5" aria-busy="true">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-3 w-16" />
            </span>
          ) : (
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-lg font-bold leading-none tabular-nums">
                {todaySteps.toLocaleString()}/{goal.toLocaleString()}
              </span>
              <span
                className={cn(
                  "truncate text-xs leading-none",
                  pct >= 100 ? "font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                {pct}%
              </span>
            </span>
          )}
        </button>
      </div>
    </>
  );
}
