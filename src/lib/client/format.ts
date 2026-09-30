// Display formatting helpers (client-side).
"use client";

import { formatDuration } from "@/lib/formulas";

export function dayKeyOf(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function todayKey(): string {
  return dayKeyOf(new Date());
}

export function parseDayKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function addDaysKey(key: string, days: number): string {
  const d = parseDayKey(key);
  d.setUTCDate(d.getUTCDate() + days);
  return dayKeyOf(d);
}

/** "Fri 26 Sep" style label for a yyyy-mm-dd key, using the browser locale. */
export function formatDayLabel(key: string): string {
  const d = parseDayKey(key);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function formatDayLong(key: string): string {
  const d = parseDayKey(key);
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function formatDayShort(key: string): string {
  const d = parseDayKey(key);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "Wednesday, Sep 30" — Part 10 §5.1 calendar day-detail TopBar heading
 *  (long weekday · short month · day, UTC day-key semantics). */
export function formatDayHeading(key: string): string {
  const d = parseDayKey(key);
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function relativeFromNow(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) {
    const hours = Math.floor(diff / 3600000);
    if (hours <= 0) return "just now";
    return `${hours}h ago`;
  }
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function formatWeight(kg: number | null | undefined, unit: "metric" | "imperial" = "metric"): string {
  if (kg == null) return "–";
  const value = unit === "imperial" ? kg : kg;
  return `${round1(value)}${unit === "imperial" ? " lb" : " kg"}`;
}

export function round1(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

export function round2(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function formatSec(sec: number | null | undefined): string {
  if (sec == null) return "–";
  return formatDuration(sec);
}

/**
 * Seconds → "{h}h {m} min {s} sec" DROPPING zero units (Part 9 §8 log rows).
 *   2772 → "46 min 12 sec" · 3900 → "1h 5 min" · 38 → "38 sec" · 0 → "0 sec".
 */
export function formatDurationParts(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "–";
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m} min`);
  if (s > 0 || parts.length === 0) parts.push(`${s} sec`);
  return parts.join(" ");
}

export function formatDistance(km: number | null | undefined): string {
  if (km == null) return "–";
  return `${round2(km)} km`;
}

export function setSummary(s: {
  weight?: number | null;
  reps?: number | null;
  distance?: number | null;
  timeSec?: number | null;
  rpe?: number | null;
}): string {
  const parts: string[] = [];
  if (s.weight != null) parts.push(`${round1(s.weight)}kg`);
  if (s.reps != null) parts.push(`×${s.reps}`);
  if (s.distance != null) parts.push(`${round2(s.distance)}km`);
  if (s.timeSec != null) parts.push(formatDuration(s.timeSec));
  if (s.rpe != null) parts.push(`@${s.rpe % 1 ? s.rpe.toFixed(1) : s.rpe}`);
  return parts.join(" ") || "—";
}

export function isToday(key: string): boolean {
  return key === todayKey();
}
