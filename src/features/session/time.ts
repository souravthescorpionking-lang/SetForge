// §3.2 total-time format: mm:ss under 1h, h:mm:ss after (mono/tabular on the
// surface). Shared by the TopBar title and the §3.6 exit modal copy.
export function formatTotalTime(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  if (h > 0) {
    const m = Math.floor((s % 3600) / 60);
    return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
