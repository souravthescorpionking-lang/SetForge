"use client";

// Numeric stepper: input with -/+ buttons, hold-to-repeat, step increments.
import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
  allowClear?: boolean;
  ariaLabel?: string;
};

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999999,
  decimals = 1,
  prefix,
  suffix,
  placeholder = "–",
  className,
  size = "md",
  allowClear = false,
  ariaLabel,
}: Props) {
  const [draft, setDraft] = useState<string>("");
  const [focused, setFocused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clamp = useCallback(
    (n: number) => Math.min(max, Math.max(min, n)),
    [min, max],
  );

  const commit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed === "") {
        onChange(allowClear ? null : min);
        return;
      }
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed)) {
        onChange(allowClear ? null : min);
        return;
      }
      onChange(clamp(Math.round(parsed * 10 ** decimals) / 10 ** decimals));
    },
    [allowClear, clamp, decimals, min, onChange],
  );

  const bump = useCallback(
    (dir: 1 | -1) => {
      const base = value ?? min;
      const next = clamp(Math.round((base + dir * step) * 10 ** decimals) / 10 ** decimals);
      onChange(next);
      setDraft(String(next));
    },
    [value, min, clamp, step, decimals, onChange],
  );

  const startHold = (dir: 1 | -1) => {
    bump(dir);
    holdRef.current = setTimeout(() => {
      timerRef.current = setInterval(() => bump(dir), 90);
    }, 420);
  };
  const stopHold = () => {
    if (holdRef.current) clearTimeout(holdRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    holdRef.current = null;
    timerRef.current = null;
  };
  useEffect(() => stopHold, []);

  const display = focused ? draft : value == null ? "" : String(value);

  const btn = size === "sm" ? "h-8 w-8" : "h-10 w-10";

  return (
    <div
      className={cn(
        "flex items-center rounded-lg border border-input bg-background overflow-hidden",
        focused && "ring-2 ring-ring/40",
        className,
      )}
    >
      <button
        type="button"
        aria-label={`decrease ${ariaLabel ?? ""}`}
        className={cn(
          btn,
          "flex items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent",
        )}
        onClick={() => bump(-1)}
        onMouseDown={() => startHold(-1)}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        onTouchStart={() => startHold(-1)}
        onTouchEnd={stopHold}
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="relative flex-1 flex items-center justify-center min-w-0">
        {prefix && <span className="text-xs text-muted-foreground pl-2 select-none">{prefix}</span>}
        <input
          aria-label={ariaLabel}
          inputMode="decimal"
          className={cn(
            "w-full min-w-0 bg-transparent text-center numeric outline-none",
            size === "sm" ? "py-1.5 text-sm" : "py-2 text-base font-semibold",
          )}
          value={display}
          placeholder={placeholder}
          onFocus={(e) => {
            setDraft(value == null ? "" : String(value));
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => {
            setFocused(false);
            commit(draft);
          }}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9.\-]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit(draft);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              bump(1);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              bump(-1);
            }
          }}
        />
        {suffix && <span className="text-xs text-muted-foreground pr-2 select-none">{suffix}</span>}
      </div>
      <button
        type="button"
        aria-label={`increase ${ariaLabel ?? ""}`}
        className={cn(
          btn,
          "flex items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent",
        )}
        onClick={() => bump(1)}
        onMouseDown={() => startHold(1)}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        onTouchStart={() => startHold(1)}
        onTouchEnd={stopHold}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
