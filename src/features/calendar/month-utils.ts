"use client";

// month-utils.ts — pure UTC month math for the Part 3 calendar (p3-6).
// Ported from legacy features/calendar/month-grid.tsx (cell computation +
// weekday labels) so the new MonthView stays data-identical to the legacy grid.

import { dayKeyOf } from "@/lib/client/format";

/** Visible month. month is 0-11 (UTC), matching legacy MonthAnchor. */
export type MonthAnchor = { year: number; month: number };

/** Anchor of a yyyy-mm-dd day key. */
export function monthOf(dayKey: string): MonthAnchor {
  const d = new Date(`${dayKey}T00:00:00.000Z`);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** Shift an anchor by whole months (delta may be negative). */
export function shiftAnchor(anchor: MonthAnchor, delta: number): MonthAnchor {
  const d = new Date(Date.UTC(anchor.year, anchor.month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** "Sep 2026" style label for the TopBar (short month — fits 320px bars). */
export function monthLabelShort(anchor: MonthAnchor): string {
  return new Date(Date.UTC(anchor.year, anchor.month, 1)).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "September 2026" style label (list/history month separators). */
export function monthLabelLong(anchor: MonthAnchor): string {
  return new Date(Date.UTC(anchor.year, anchor.month, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Inclusive first / last day keys of the anchor month (for the range query). */
export function monthRangeKeys(anchor: MonthAnchor): { from: string; to: string } {
  return {
    from: dayKeyOf(new Date(Date.UTC(anchor.year, anchor.month, 1))),
    to: dayKeyOf(new Date(Date.UTC(anchor.year, anchor.month + 1, 0))),
  };
}

/**
 * Cells for one month page: FIXED 6 rows × 7 columns (42 slots, the grid never
 * changes height between months). null = blank (outside the month).
 */
export function monthCells(anchor: MonthAnchor, weekStart: number): Array<string | null> {
  const first = new Date(Date.UTC(anchor.year, anchor.month, 1));
  const last = new Date(Date.UTC(anchor.year, anchor.month + 1, 0));
  const firstDow = first.getUTCDay(); // 0 = Sunday
  const leading = (firstDow - weekStart + 7) % 7;
  const daysInMonth = last.getUTCDate();
  const cells: Array<string | null> = Array.from({ length: leading }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(dayKeyOf(new Date(Date.UTC(anchor.year, anchor.month, d))));
  }
  // pad the tail so the grid is ALWAYS exactly 42 cells (6 fixed rows)
  const trailing = 42 - cells.length;
  for (let i = 0; i < trailing; i++) cells.push(null);
  return cells;
}

/** Weekday header labels respecting the week-start setting. */
export function weekdayLabels(weekStart: number): string[] {
  const labels: string[] = [];
  // 2024-01-07 was a Sunday (UTC)
  for (let i = 0; i < 7; i++) {
    const dow = (weekStart + i) % 7;
    labels.push(
      new Date(Date.UTC(2024, 0, 7 + dow)).toLocaleDateString(undefined, {
        weekday: "short",
        timeZone: "UTC",
      }),
    );
  }
  return labels;
}

/** Deduped categories of a workout summary (drives the ≤4 cell dots). */
export function dedupeCategories(w: {
  categories: Array<{ name: string; colour: string }>;
}): Array<{ name: string; colour: string }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; colour: string }> = [];
  for (const c of w.categories) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(c);
  }
  return out;
}
