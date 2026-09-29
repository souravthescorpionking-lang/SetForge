"use client";

// ─────────────────────────────────────────────────────────────────────────────
// HistoryScreen — #/history (p3-6 rebuild). The workout-history list on the
// same system as the Calendar: DateGroup language + the ONE GroupCard.
//
//   TopBar (56)  : title "History" | ⋮ (Filters → #/calendar/filters; export
//                  note → Settings · Data)
//   ScrollBody   : month separators (32px) → DateGroup×N (32px headers) each
//                  containing ONE WorkoutBlock: 48px summary row (volume ·
//                  sets · duration) + GroupCard×N read mode (collapsed →
//                  tap expands SetRows; PR/note markers visible). No dialogs.
//
// Workout fetching ported from the legacy workout-history-view (summaries via
// workoutsApi.list, newest first; month grouping kept); rendering goes through
// WorkoutBlock + the GroupCard read mode instead of the legacy SetTable.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dumbbell, FileDown, MoreVertical, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { qk } from "@/lib/client/query";
import { workoutsApi } from "@/lib/client/api";
import { dayKeyOf } from "@/lib/client/format";
import type { CardVisibleColumns } from "@/components/group-card/group-card";
import type { WorkoutSummaryDTO } from "@/lib/types";
import { WorkoutBlock } from "./workout-block";
import { monthLabelLong, monthOf } from "@/features/calendar/month-utils";

type MonthGroup = { key: string; label: string; workouts: WorkoutSummaryDTO[] };

function groupByMonth(workouts: WorkoutSummaryDTO[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  const index = new Map<string, MonthGroup>();
  for (const w of workouts) {
    const anchor = monthOf(dayKeyOf(w.date));
    const key = `${anchor.year}-${String(anchor.month + 1).padStart(2, "0")}`;
    let g = index.get(key);
    if (!g) {
      g = { key, label: monthLabelLong(anchor), workouts: [] };
      index.set(key, g);
      groups.push(g);
    }
    g.workouts.push(w);
  }
  return groups;
}

export default function HistoryScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);

  // all workout summaries, newest first (legacy workout-history-view query)
  const listQuery = useQuery({
    queryKey: qk.workoutList({}),
    queryFn: () => workoutsApi.list(),
  });
  const workouts = listQuery.data?.workouts ?? [];
  const monthGroups = useMemo(() => groupByMonth(workouts), [workouts]);

  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  return (
    <Screen
      topBar={
        <TopBar
          title="History"
          actions={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 flex-none"
                    aria-label="More actions"
                    tour={{ id: "history.menu", label: "Menu", help: "Open filters or jump to the CSV export in Settings.", order: 10 }}
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => navigate("/calendar/filters")}>
                    <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      toast.info("Workout CSV export lives in Settings → Data")
                    }
                  >
                    <FileDown className="h-4 w-4" aria-hidden /> Export…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TopBarHelp />
            </>
          }
        />
      }
    >
      <ScrollBody>
        {listQuery.isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading history">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-8 w-40 rounded-lg" />
                <Skeleton className="h-12 rounded-lg" />
                <Skeleton className="h-14 rounded-lg" />
              </div>
            ))}
          </div>
        ) : workouts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
            <Dumbbell className="mb-3 h-10 w-10 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-semibold">No workouts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Log your first workout and it will appear here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {monthGroups.map((g) => (
              <section key={g.key} className="flex flex-col gap-3" aria-label={g.label}>
                {/* month separator — 32px, not a data-row */}
                <h2 className="flex h-8 items-center gap-2 overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="flex-none truncate">{g.label}</span>
                  <span className="flex-none tabular-nums">· {g.workouts.length}</span>
                  <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
                </h2>
                {g.workouts.map((w) => (
                  <WorkoutBlock key={w.id} summary={w} visibleColumns={visibleColumns} />
                ))}
              </section>
            ))}
          </div>
        )}
      </ScrollBody>
    </Screen>
  );
}
