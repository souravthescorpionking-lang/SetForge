"use client";

// Volume by exercise — horizontal bars (Recharts), top N by volume.
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { round1 } from "@/lib/client/format";
import type { StatsPerExerciseDTO } from "@/lib/types";

const FALLBACK_COLOUR = "#f97316";

export function VolumeByExercise({
  perExercise,
  limit = 8,
  unit = "kg",
}: {
  perExercise: StatsPerExerciseDTO[];
  limit?: number;
  unit?: string;
}) {
  const rows = perExercise.slice(0, limit).map((e) => ({
    name: e.name.length > 22 ? `${e.name.slice(0, 21)}…` : e.name,
    fullName: e.name,
    volume: Math.round(e.volume * 10) / 10,
    colour: e.categoryColour ?? FALLBACK_COLOUR,
  }));

  return (
    <Card className="rounded-2xl border-border/70 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-bold">Volume by exercise</h3>
        <p className="text-xs text-muted-foreground">top {rows.length}</p>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No volume in this period</p>
      ) : (
        <div style={{ height: rows.length * 34 + 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-muted-foreground"
              />
              <Tooltip
                cursor={{ fill: "currentColor", opacity: 0.06 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as (typeof rows)[number];
                  return (
                    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                      <p className="font-semibold">{row.fullName}</p>
                      <p className="font-bold text-primary numeric">
                        {round1(row.volume)} {unit} volume
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="volume" radius={[0, 6, 6, 0]} barSize={16} className="numeric">
                {rows.map((r) => (
                  <Cell key={r.fullName} fill={r.colour} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
