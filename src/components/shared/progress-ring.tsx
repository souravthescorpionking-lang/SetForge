"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — ProgressRing / DurationRing (§4.5/§4.6/§4.15). SVG rings sized by
// prop; stroke 6px default. Deterministic, no animation dependency.
// ─────────────────────────────────────────────────────────────────────────────

export interface RingProps {
  /** 0..1 fraction of the full circle. */
  fraction: number;
  /** Outer size in px (e.g. 72 detail header, 56 TodayCard, 160 RestRing). */
  size: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  className?: string;
}

export function ProgressRing({ fraction, size, stroke = 6, label, sublabel, className }: RingProps) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={`relative flex flex-none items-center justify-center ${className ?? ""}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ? `${label}${sublabel ? ` ${sublabel}` : ""}` : `progress ${Math.round(clamped * 100)}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-primary transition-[stroke-dashoffset] duration-300"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
        />
      </svg>
      {(label != null || sublabel != null) && (
        <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          {label != null && <span className="text-sm font-bold tabular-nums">{label}</span>}
          {sublabel != null && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
        </span>
      )}
    </div>
  );
}

/**
 * DurationRing — same geometry, used for day est-minutes. The ring shows the
 * fraction of a 90-minute cap (DAY_MINUTES_CAP); label is the minutes value.
 */
export function DurationRing({ minutes, size, stroke = 6, className }: { minutes: number | null | undefined; size: number; stroke?: number; className?: string }) {
  const value = minutes ?? 0;
  const fraction = Math.max(0, Math.min(1, value / 90));
  return (
    <ProgressRing
      fraction={fraction}
      size={size}
      stroke={stroke}
      label={minutes != null ? `${Math.round(value)}m` : "–"}
      className={className}
    />
  );
}

/** 60-tick rest ring (§4.11 RestRingBlock centre) — ticks light up with remaining fraction. */
export function TickedRing({ fraction, size = 160, ticks = 60, label }: { fraction: number; size?: number; ticks?: number; label?: string }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const radius = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <div className="relative flex flex-none items-center justify-center" style={{ width: size, height: size }} role="timer">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {Array.from({ length: ticks }, (_, i) => {
          const angle = (i / ticks) * Math.PI * 2 - Math.PI / 2;
          const x1 = cx + Math.cos(angle) * (radius - 8);
          const y1 = cy + Math.sin(angle) * (radius - 8);
          const x2 = cx + Math.cos(angle) * radius;
          const y2 = cy + Math.sin(angle) * radius;
          const on = i / ticks < clamped;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth={2}
              strokeLinecap="round"
              className={on ? "stroke-primary" : "stroke-muted"}
            />
          );
        })}
      </svg>
      {label != null && (
        <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold tabular-nums">{label}</span>
      )}
    </div>
  );
}
