"use client";

// Records tab: actual PRs (superseded faded w/ tooltip) + estimated 1RM
// and the 1..N rep-max table (N = settings.estOneRmRepLimit).
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/shared/empty-state";
import { qk } from "@/lib/client/query";
import { exercisesApi } from "@/lib/client/api";
import { dayKeyOf, formatDayShort, round1, round2 } from "@/lib/client/format";
import type { ExerciseDTO, RecordsDTO } from "@/lib/types";
import type { SetField } from "@/lib/constants";
import { History, Info, Medal, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { type WeightUnit, weightLabel } from "@/features/exercises/labels";

export function RecordsTab({
  exercise,
  unit,
  fields,
}: {
  exercise: ExerciseDTO;
  unit: WeightUnit;
  fields: SetField[];
}) {
  const { data: records, isLoading } = useQuery({
    queryKey: qk.exerciseRecords(exercise.id),
    queryFn: () => exercisesApi.records(exercise.id),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const tracksWeightReps = fields.includes("weight") && fields.includes("reps");

  return (
    <div className="space-y-3">
      {/* actual PRs */}
      <Card className="gap-3 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold tracking-tight">Actual PRs</h3>
          {records && records.actual.length > 0 && (
            <Badge variant="outline" className="numeric">
              {records.actual.filter((r) => !r.superseded).length} current
            </Badge>
          )}
        </div>

        {!tracksWeightReps ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-dashed bg-muted/20 p-3.5 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Actual PRs track your heaviest weight at each rep count — this exercise type doesn&apos;t use weight × reps.</p>
          </div>
        ) : !records || records.actual.length === 0 ? (
          <EmptyState
            className="py-8"
            icon={<Medal className="h-5 w-5" />}
            title="No PRs yet"
            description="Log a weight × reps set to start tracking records."
          />
        ) : (
          <RecordsTable records={records} unit={unit} />
        )}
      </Card>

      {/* estimated */}
      <Card className="gap-3 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Medal className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold tracking-tight">Estimated strength</h3>
        </div>

        {!tracksWeightReps || !records || records.estimatedOneRm <= 0 ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-dashed bg-muted/20 p-3.5 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {tracksWeightReps
                ? "Log a weight × reps set to see estimated maxes (Brzycki formula)."
                : "Estimates need weight × reps sets — not available for this exercise type."}
            </p>
          </div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-end justify-between rounded-xl bg-primary/10 px-4 py-3"
            >
              <div>
                <p className="text-xs font-medium text-muted-foreground">Estimated 1RM</p>
                <p className="text-3xl font-black tracking-tight text-primary numeric">
                  {round1(records.estimatedOneRm)}
                  <span className="ml-1 text-base font-semibold text-primary/70">{unit}</span>
                </p>
              </div>
              <p className="max-w-[10rem] text-right text-[11px] leading-snug text-muted-foreground">
                Best single-set estimate · Brzycki
              </p>
            </motion.div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Rep maxes · 1–{records.estimated.length} RM
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                {records.estimated.map((row) => (
                  <div
                    key={row.reps}
                    className={cn(
                      "flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-1.5",
                      row.reps === 1 && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <span className="text-xs font-medium text-muted-foreground numeric">{row.reps}RM</span>
                    <span className="text-sm font-bold numeric">{round2(row.weight)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>

      <p className="px-1 text-xs text-muted-foreground/70">
        <History className="mr-1 inline h-3 w-3" />
        A PR is superseded when a heavier set at the same-or-higher rep count was logged later.
      </p>
    </div>
  );
}

function RecordsTable({ records, unit }: { records: RecordsDTO; unit: WeightUnit }) {
  return (
    <div className="overflow-x-auto scroll-slim">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-9 w-14 text-xs">Reps</TableHead>
            <TableHead className="h-9 text-xs">Weight</TableHead>
            <TableHead className="h-9 text-xs">Set on</TableHead>
            <TableHead className="h-9 w-10 text-xs" aria-label="Status" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.actual.map((r) => (
            <TableRow
              key={`${r.reps}-${r.weight}-${r.date}`}
              className={cn("border-border/60", r.superseded ? "opacity-50" : "bg-primary/5 hover:bg-primary/10")}
            >
              <TableCell className="py-2.5 text-sm font-semibold numeric">{r.reps}</TableCell>
              <TableCell className="py-2.5 text-sm numeric">
                <span className={cn(r.superseded ? "font-medium" : "font-bold text-primary")}>
                  {weightLabel(r.weight, unit)}
                </span>
              </TableCell>
              <TableCell className="py-2.5 text-xs text-muted-foreground">
                {formatDayShort(dayKeyOf(r.date))}
              </TableCell>
              <TableCell className="py-2.5">
                {r.superseded ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="inline-flex cursor-help" aria-label="Superseded PR">
                        <History className="h-4 w-4 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Superseded by a heavier set at ≥ {r.reps} reps
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="inline-flex cursor-help" aria-label="Current PR">
                        <Trophy className="h-4 w-4 text-primary" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Current PR at {r.reps} reps
                    </TooltipContent>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
