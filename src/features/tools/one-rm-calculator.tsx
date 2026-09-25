"use client";

// 1RM calculator — Brzycki estimated one-rep max + nRM table. Pure client-side.
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Stepper } from "@/components/shared/stepper";
import { useApp } from "@/lib/client/store";
import { estOneRm, estRm } from "@/lib/formulas";
import { round1 } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import { Info, TrendingUp } from "lucide-react";

const MAX_REPS = 15;

export function OneRmCalculator() {
  const settings = useApp((s) => s.settings);
  const unit = settings?.unitSystem === "imperial" ? "lb" : "kg";
  const increment = settings?.defaultWeightIncrement ?? 2.5;
  const repLimit = settings?.estOneRmRepLimit ?? 10;

  const [weight, setWeight] = useState<number>(() => (settings?.unitSystem === "imperial" ? 135 : 60));
  const [reps, setReps] = useState(5);

  const oneRm = useMemo(() => estOneRm(weight, reps), [weight, reps]);
  const rows = useMemo(
    () =>
      Array.from({ length: MAX_REPS }, (_, i) => {
        const n = i + 1;
        const w = estRm(oneRm, n);
        return { n, w, pct: oneRm > 0 ? (w / oneRm) * 100 : 0 };
      }),
    [oneRm],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* Inputs + result */}
      <Card className="rounded-2xl border-border/60 lg:col-span-2 flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <TrendingUp className="h-4.5 w-4.5" />
            </span>
            <div>
              <h3 className="text-base font-semibold leading-tight">1RM Calculator</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Brzycki formula</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 flex-1 flex flex-col">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Weight ({unit})</span>
              <Stepper
                ariaLabel="Weight lifted"
                value={weight}
                onChange={(v) => setWeight(v ?? 0)}
                min={0}
                max={1000}
                step={increment}
                decimals={2}
                suffix={unit}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="one-rm-reps">
                Reps
              </label>
              <Stepper
                ariaLabel="Reps performed"
                value={reps}
                onChange={(v) => setReps(v ?? 1)}
                min={1}
                max={MAX_REPS}
                step={1}
                decimals={0}
              />
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/20 p-5 text-center mt-auto">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary/80">
              Estimated 1RM
            </p>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={oneRm}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="numeric text-5xl font-black tracking-tight text-primary"
              >
                {oneRm > 0 ? round1(oneRm) : "–"}
                {oneRm > 0 && <span className="ml-1.5 text-lg font-bold text-primary/60">{unit}</span>}
              </motion.p>
            </AnimatePresence>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {weight > 0 ? `${round1(weight)} ${unit} × ${reps} reps` : "Enter a weight"} · per-rep
              guide only
            </p>
          </div>

          <p className="flex items-start gap-2 text-xs leading-relaxed text-foreground/70">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
            Estimates are a training guide, not a guarantee — treat them as targets to earn, not
            numbers you can hit cold. Your record tracking counts sets of up to {repLimit} reps
            towards estimated 1RM PRs.
          </p>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="rounded-2xl border-border/60 lg:col-span-3">
        <CardHeader className="pb-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Rep-max table</h3>
            <p className="text-xs text-muted-foreground">
              from 1RM of {oneRm > 0 ? `${round1(oneRm)} ${unit}` : "–"}
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-h-[420px] overflow-y-auto scroll-slim rounded-xl border border-border/60">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 text-xs">Rep max</TableHead>
                  <TableHead className="h-9 text-xs text-right">Weight ({unit})</TableHead>
                  <TableHead className="h-9 text-xs text-right">% of 1RM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const current = r.n === reps;
                  return (
                    <TableRow
                      key={r.n}
                      className={cn(
                        "cursor-default",
                        current && "bg-primary/10 hover:bg-primary/10",
                      )}
                    >
                      <TableCell
                        className={cn(
                          "numeric py-2 text-sm font-medium",
                          current && "text-primary font-bold",
                        )}
                      >
                        {r.n}RM
                        {current && (
                          <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                            now
                          </span>
                        )}
                        {r.n > repLimit && !current && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground/60">(&gt; limit)</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "numeric py-2 text-right text-sm",
                          current ? "text-primary font-bold" : "font-medium",
                        )}
                      >
                        {oneRm > 0 ? round1(r.w) : "–"}
                      </TableCell>
                      <TableCell className="numeric py-2 text-right text-sm text-muted-foreground">
                        {oneRm > 0 ? `${round1(r.pct)}%` : "–"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
