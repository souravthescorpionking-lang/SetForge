// Date helpers — workout days are stored as UTC-midnight instants.

export function toDayUtc(input: string | Date): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${input}`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function dayKey(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

export function todayDayUtc(): Date {
  return toDayUtc(new Date());
}
