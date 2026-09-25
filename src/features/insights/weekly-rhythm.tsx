"use client";

// WeeklyRhythm — "this week vs last week" deltas (workouts / volume / sets,
// rolling 7-day windows, computed client-side from workout summaries) plus
// the average-volume-by-weekday bar chart that reveals the training rhythm.
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Dumbbell, Layers, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { WorkoutSummaryDTO } from "@/lib/types";
import { addDaysKey, dayKeyOf, parseDayKey, round1, todayKey } from "@/lib/client/format";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Weekdays considered for the rhythm averages (≈ 2 months). */
const RHYTHM_WEEKS = 8;

type Metric = { key: string; label: string; icon: typeof Dumbbell; thisW: number; lastW: number; fmt: (n: number) => string };

function deltaTone(delta: number, zeroBase: boolean): "up" | "same" | "down" {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return zeroBase ? "same" : "same";
}

export function WeeklyRhythm({ workouts }: { workouts: WorkoutSummaryDTO[] }) {
  const { metrics, rhythm, hasRhythm } = useMemo(() => {
    const today = todayKey();
    const inWindow = (w: WorkoutSummaryDTO, fromKey: string, toKey: string) => {
      const k = dayKeyOf(w.date);
      return k >= fromKey && k <= toKey;
    };
    const thisFrom = addDaysKey(today, -6);
    const lastFrom = addDaysKey(today, -13);
    const lastTo = addDaysKey(today, -7);

    const thisWeek = workouts.filter((w) => inWindow(w, thisFrom, today));
    const lastWeek = workouts.filter((w) => inWindow(w, lastFrom, lastTo));

    const sum = (list: WorkoutSummaryDTO[], f: (w: WorkoutSummaryDTO) => number) =>
      Math.round(list.reduce((a, w) => a + f(w), 0) * 10) / 10;

    const mets: Metric[] = [
      {
        key: "workouts",
        label: "Workouts",
        icon: Dumbbell,
        thisW: thisWeek.length,
        lastW: lastWeek.length,
        fmt: (n) => String(n),
      },
      {
        key: "volume",
        label: "Volume",
        icon: Layers,
        thisW: sum(thisWeek, (w) => w.volume),
        lastW: sum(lastWeek, (w) => w.volume),
        fmt: (n) => (n >= 10_000 ? `${round1(n / 1000)}k` : round1(n)),
      },
      {
        key: "sets",
        label: "Sets",
        icon: Layers,
        thisW: sum(thisWeek, (w) => w.setCount),
        lastW: sum(lastWeek, (w) => w.setCount),
        fmt: (n) => String(n),
      },
    ];

    // average volume by weekday over the last RHYTHM_WEEKS weeks
    const cutoff = addDaysKey(today, -RHYTHM_WEEKS * 7 + 1);
    const sums = Array.from({ length: 7 }, () => 0);
    const counts = Array.from({ length: 7 }, () => 0);
    for (const w of workouts) {
      const k = dayKeyOf(w.date);
      if (k < cutoff || k > today) continue;
      const d = parseDayKey(k);
      const idx = (d.getUTCDay() + 6) % 7; // Mon = 0
      sums[idx] += w.volume;
      counts[idx] += 1;
    }
    const bars = WEEKDAYS.map((label, i) => ({
      day: label,
      avg: counts[i] > 0 ? Math.round((sums[i] / counts[i]) * 10) / 10 : 0,
      sessions: counts[i],
    }));

    return { metrics: mets, rhythm: bars, hasRhythm: counts.some((c) => c > 0) };
  }, [workouts]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
    >
      <Card className="rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            This week vs last
          </h3>
          <span className="ml-auto text-[10px] font-semibold text-muted-foreground">rolling 7 days</span>
        </div>

        {/* delta columns */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {metrics.map((m) => {
            const delta = m.thisW - m.lastW;
            const tone = deltaTone(delta, m.lastW === 0);
            const pct = m.lastW > 0 ? Math.round((delta / m.lastW) * 100) : null;
            const Icon = m.icon;
            return (
              <div key={m.key} className="rounded-xl border border-border/70 bg-muted/25 px-2.5 py-2.5 text-center sm:text-left">
                <p className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:justify-start">
                  <Icon className="h-3 w-3" /> {m.label}
                </p>
                <p className="numeric mt-0.5 text-xl font-black tracking-tight">{m.fmt(m.thisW)}</p>
                <p className="mt-1 flex items-center justify-center gap-1 sm:justify-start">
                  <span
                    className={cn(
                      "numeric inline-flex items-center gap-0.5 text-[11px] font-bold",
                      tone === "up" && "text-emerald-600 dark:text-emerald-400",
                      tone === "down" && "text-red-500",
                      tone === "same" && "text-muted-foreground",
                    )}
                  >
                    {tone === "up" && <TrendingUp className="h-3 w-3" />}
                    {tone === "down" && <TrendingDown className="h-3 w-3" />}
                    {tone === "same" && <Minus className="h-3 w-3" />}
                    {m.lastW === 0
                      ? delta > 0
                        ? "new this week"
                        : "no data"
                      : `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${m.fmt(Math.abs(delta))}${pct != null && pct !== 0 ? ` · ${pct > 0 ? "+" : ""}${pct}%` : ""}`}
                  </span>
                </p>
              </div>
            );
          })}
        </div>

        {/* rhythm chart */}
        {hasRhythm && (
          <div className="mt-4">
            <div className="mb-1 flex items-baseline justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Weekly rhythm · avg kg per training day
              </p>
              <p className="text-[10px] text-muted-foreground">last {RHYTHM_WEEKS} weeks</p>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={rhythm} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  interval={0}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.25 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as { day: string; avg: number; sessions: number };
                    return (
                      <div className="rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-lg">
                        <p className="font-semibold">{p.day}</p>
                        <p className="numeric font-bold text-primary">
                          {round1(p.avg)} kg avg{p.sessions > 1 ? ` · ${p.sessions} sessions` : p.sessions === 1 ? " · 1 session" : ""}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="avg" radius={[6, 6, 2, 2]} fill="var(--primary)" maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
