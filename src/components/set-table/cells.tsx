"use client";

// Part 2 set-table cell components: single-letter type tag, RPE chip picker,
// tempo 4-field editor, rest input, and the inline numeric cell with focus
// steppers. All cells render one-line values with tabular numerals.
import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RPE_OPTIONS,
  SET_TYPES,
  SET_TYPE_META,
  formatRestSec,
  normaliseTempo,
  type SetType,
} from "@/lib/constants";

// ---------- SetTypeTag ----------

const CYCLE: SetType[] = ["NORMAL", "WARMUP", "DROP", "FAILURE", "AMRAP"];

/** Tap cycles NORMAL→WARMUP→DROP→FAILURE→AMRAP; long-press opens the picker. */
export function SetTypeTag({
  value,
  onChange,
  disabled,
}: {
  value: SetType;
  onChange: (t: SetType) => void;
  disabled?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const meta = SET_TYPE_META[value];

  useEffect(() => () => { if (holdRef.current) clearTimeout(holdRef.current); }, []);

  const startHold = () => {
    longPressed.current = false;
    holdRef.current = setTimeout(() => {
      longPressed.current = true;
      setPickerOpen(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(12); } catch { /* ignore */ }
      }
    }, 420);
  };
  const endHold = () => {
    if (holdRef.current) clearTimeout(holdRef.current);
    holdRef.current = null;
  };

  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Set type: ${meta.label}. Tap to cycle, hold for picker`}
          title={`${meta.label} — ${meta.description}`}
          disabled={disabled}
          onClick={() => {
            if (longPressed.current) { longPressed.current = false; return; }
            const next = CYCLE[(CYCLE.indexOf(value) + 1) % CYCLE.length];
            onChange(next);
          }}
          onTouchStart={startHold}
          onTouchEnd={endHold}
          onContextMenu={(e) => { e.preventDefault(); setPickerOpen(true); }}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold tabular-nums transition-transform active:scale-95",
            meta.className,
            disabled && "opacity-50",
          )}
        >
          {meta.letter}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 p-2">
        <p className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Set type</p>
        <div className="space-y-1">
          {SET_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { onChange(t); setPickerOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                t === value && "bg-accent",
              )}
            >
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold", SET_TYPE_META[t].className)}>
                {SET_TYPE_META[t].letter}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-tight">{SET_TYPE_META[t].label}</span>
                <span className="block text-[11px] leading-tight text-muted-foreground">{SET_TYPE_META[t].description}</span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- RPE picker ----------

export function RpeCell({
  value,
  onChange,
  disabled,
  placeholder = "–",
}: {
  value: number | null;
  onChange: (rpe: number | null) => void;
  disabled?: boolean;
  /** Optional label shown instead of "–" when unset (e.g. routine template rows). */
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={value != null ? `RPE ${value}, tap to change` : "RPE not set, tap to choose"}
          disabled={disabled}
          className={cn(
            "flex h-8 min-w-11 items-center justify-center rounded-md px-1 text-sm font-semibold tabular-nums transition-colors hover:bg-accent",
            value != null ? "text-foreground" : "text-muted-foreground/50",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          {value != null ? (
            value.toFixed(value % 1 ? 1 : 0)
          ) : placeholder === "–" ? (
            "–"
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wide">{placeholder}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-52 p-3">
        <p className="pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          RPE <span className="normal-case font-medium">(6 = easy · 10 = max)</span>
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {RPE_OPTIONS.map((r) => (
            <Button
              key={r}
              variant={value === r ? "default" : "outline"}
              size="sm"
              className="h-9 rounded-lg text-sm font-bold tabular-nums"
              onClick={() => { onChange(value === r ? null : r); setOpen(false); }}
            >
              {r}
            </Button>
          ))}
        </div>
        {value != null && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full text-xs text-muted-foreground"
            onClick={() => { onChange(null); setOpen(false); }}
          >
            Clear RPE
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------- Tempo input ----------

function TempoDraftFields({
  parts,
  setParts,
}: {
  parts: [string, string, string, string];
  setParts: (p: [string, string, string, string]) => void;
}) {
  const labels = ["Ecc", "Pause", "Con", "Pause"];
  return (
    <div className="flex items-end gap-1.5">
      {parts.map((p, i) => (
        <div key={i} className="min-w-0 flex-1">
          <span className="mb-1 block text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {labels[i]}
          </span>
          <input
            aria-label={`tempo ${labels[i]} seconds`}
            inputMode="numeric"
            value={p}
            onChange={(e) => {
              const next = [...parts] as [string, string, string, string];
              next[i] = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
              setParts(next);
            }}
            className="h-9 w-full rounded-md border border-input bg-background text-center text-sm font-semibold tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
            placeholder="0"
          />
        </div>
      ))}
    </div>
  );
}

export function TempoCell({
  value,
  onChange,
  disabled,
  placeholder = "–",
}: {
  value: string | null;
  onChange: (tempo: string | null) => void;
  disabled?: boolean;
  /** Optional label shown instead of "–" when unset (e.g. routine template rows). */
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const initial = value?.split("-") ?? ["", "", "", ""];
  const [parts, setParts] = useState<[string, string, string, string]>([initial[0] ?? "", initial[1] ?? "", initial[2] ?? "", initial[3] ?? ""]);
  const display = value ?? "–";
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          const p = value?.split("-") ?? ["", "", "", ""];
          setParts([p[0] ?? "", p[1] ?? "", p[2] ?? "", p[3] ?? ""]);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={value ? `Tempo ${value}, tap to change` : "Tempo not set, tap to edit"}
          title={value ? `Tempo ${value} (eccentric-pause-concentric-pause)` : "Set tempo, e.g. 3-1-1-0"}
          disabled={disabled}
          className={cn(
            "flex h-8 min-w-14 items-center justify-center rounded-md px-1 text-xs font-semibold tabular-nums transition-colors hover:bg-accent",
            value ? "text-foreground" : "text-muted-foreground/50",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          {value ? (
            display
          ) : placeholder === "–" ? (
            "–"
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wide">{placeholder}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 p-3">
        <p className="pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Tempo <span className="normal-case font-medium">(sec: ecc-pause-con-pause)</span>
        </p>
        <TempoDraftFields parts={parts} setParts={setParts} />
        <div className="mt-2.5 flex gap-1.5">
          <Button
            size="sm"
            className="h-8 flex-1 rounded-lg text-xs font-bold"
            onClick={() => {
              const joined = parts.map((p) => p || "0").join("-");
              const norm = normaliseTempo(joined);
              if (norm) onChange(norm);
              setOpen(false);
            }}
          >
            Save
          </Button>
          {value && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg text-xs text-muted-foreground"
              onClick={() => { onChange(null); setOpen(false); }}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- Rest input ----------

const REST_PRESETS = [60, 90, 120, 180];

export function RestCell({
  plannedSec,
  remainingSec,
  onChange,
  onStartNow,
  disabled,
  placeholder = "–",
}: {
  plannedSec: number | null;
  remainingSec: number | null;
  onChange: (sec: number | null) => void;
  onStartNow?: (sec: number) => void;
  disabled?: boolean;
  /** Optional label shown instead of "–" when unset (e.g. routine template rows). */
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState("");
  const [sec, setSec] = useState("");
  const live = remainingSec != null && remainingSec > 0;
  const hasRest = plannedSec != null && plannedSec > 0;
  const display = live
    ? formatRestSec(Math.ceil(remainingSec))
    : hasRest
      ? formatRestSec(plannedSec)
      : "–";
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setMin(plannedSec != null ? String(Math.floor(plannedSec / 60)) : "");
          setSec(plannedSec != null ? String(plannedSec % 60) : "");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={live ? `Rest running, ${display} left` : plannedSec ? `Planned rest ${formatRestSec(plannedSec)}, tap to change` : "Rest not set, tap to edit"}
          disabled={disabled}
          className={cn(
            "flex h-8 min-w-12 items-center justify-center rounded-md px-1 text-xs font-semibold tabular-nums transition-colors hover:bg-accent",
            live ? "text-primary" : plannedSec ? "text-foreground" : "text-muted-foreground/50",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          {!live && !hasRest && placeholder !== "–" ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide">{placeholder}</span>
          ) : (
            display
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-52 p-3">
        <p className="pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Planned rest</p>
        <div className="grid grid-cols-2 gap-1.5">
          {REST_PRESETS.map((p) => (
            <Button
              key={p}
              variant={plannedSec === p ? "default" : "outline"}
              size="sm"
              className="h-9 rounded-lg text-xs font-bold tabular-nums"
              onClick={() => { onChange(p); setOpen(false); }}
            >
              {formatRestSec(p)}
            </Button>
          ))}
        </div>
        <div className="mt-2 flex items-end gap-1.5">
          <div className="min-w-0 flex-1">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">min</span>
            <input
              aria-label="custom rest minutes"
              inputMode="numeric"
              value={min}
              onChange={(e) => setMin(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
              className="h-9 w-full rounded-md border border-input bg-background text-center text-sm font-semibold tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="0"
            />
          </div>
          <div className="min-w-0 flex-1">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">sec</span>
            <input
              aria-label="custom rest seconds"
              inputMode="numeric"
              value={sec}
              onChange={(e) => setSec(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
              className="h-9 w-full rounded-md border border-input bg-background text-center text-sm font-semibold tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="30"
            />
          </div>
          <Button
            size="sm"
            className="h-9 rounded-lg px-3 text-xs font-bold"
            onClick={() => {
              const total = (Number(min) || 0) * 60 + (Number(sec) || 0);
              if (total > 0) { onChange(total); setOpen(false); }
            }}
          >
            Set
          </Button>
        </div>
        <div className="mt-2 flex gap-1.5">
          {plannedSec != null && plannedSec > 0 && onStartNow && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 rounded-lg text-xs font-bold"
              onClick={() => { onStartNow(plannedSec); setOpen(false); }}
            >
              Start now
            </Button>
          )}
          {plannedSec != null && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg text-xs text-muted-foreground"
              onClick={() => { onChange(null); setOpen(false); }}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- NumericCell (inline value input with focus steppers) ----------

type NumericCellProps = {
  value: number | null;
  onChange: (v: number | null) => void;
  step: number;
  min?: number;
  max?: number;
  decimals?: number;
  suffix?: string;
  placeholder?: string;
  ariaLabel: string;
  amrapSuffix?: boolean;
  disabled?: boolean;
  onEnter?: () => void;
  commitRef?: (fn: (() => void) | null) => void;
};

/** Tap → live inline input; small −/+ steppers appear under the cell while focused. */
export function NumericCell({
  value,
  onChange,
  step,
  min = 0,
  max = 100000,
  decimals = 1,
  suffix,
  placeholder = "–",
  ariaLabel,
  amrapSuffix,
  disabled,
  onEnter,
  commitRef,
}: NumericCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") return; // keep previous value on empty blur
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.min(max, Math.max(min, Math.round(parsed * 10 ** decimals) / 10 ** decimals));
    if (clamped !== value) onChange(clamped);
  };

  useEffect(() => {
    if (commitRef) commitRef(() => { commit(); setEditing(false); });
    return () => { if (commitRef) commitRef(null); };
  });

  const bump = (dir: 1 | -1) => {
    const base = value ?? min;
    const next = Math.min(max, Math.max(min, Math.round((base + dir * step) * 10 ** decimals) / 10 ** decimals));
    onChange(next);
    setDraft(String(next));
  };

  if (disabled) {
    return (
      <span className={cn("flex h-8 items-center justify-center text-sm font-semibold tabular-nums", value == null && "text-muted-foreground/50")}>
        {value == null ? "–" : `${value}${amrapSuffix ? "+" : ""}`}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        role="gridcell"
        aria-label={`${ariaLabel}: ${value ?? "not set"}`}
        onClick={() => {
          setDraft(value == null ? "" : String(value));
          setEditing(true);
        }}
        className={cn(
          "flex h-8 w-full min-w-0 items-center justify-center gap-0.5 rounded-md px-1 text-sm font-semibold tabular-nums transition-colors hover:bg-accent",
          value == null && placeholder !== "–" ? "text-muted-foreground/70" : value == null ? "text-muted-foreground/50" : "text-foreground",
        )}
      >
        {value != null ? (
          <>
            <span className="truncate">{value}</span>
            {amrapSuffix && <span className="text-primary font-bold">+</span>}
            {suffix && <span className="text-[10px] font-medium text-muted-foreground">{suffix}</span>}
          </>
        ) : (
          <span className="truncate text-xs font-medium italic">{placeholder}</span>
        )}
      </button>
    );
  }

  return (
    <div className="relative flex h-8 w-full min-w-0 items-center justify-center">
      <input
        ref={inputRef}
        autoFocus
        aria-label={ariaLabel}
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={() => { commit(); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            setEditing(false);
            onEnter?.();
          }
          if (e.key === "ArrowUp") { e.preventDefault(); bump(1); }
          if (e.key === "ArrowDown") { e.preventDefault(); bump(-1); }
          if (e.key === "Escape") { setEditing(false); }
        }}
        className={cn(
          "h-8 w-full min-w-0 rounded-md border border-primary/60 bg-background text-center text-sm font-semibold tabular-nums outline-none ring-2 ring-primary/30",
          suffix && "pr-5",
        )}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-1.5 text-[10px] font-medium text-muted-foreground">{suffix}</span>
      )}
      {/* steppers — small −/+ under the cell while focused */}
      <div className="absolute top-[calc(100%+2px)] left-1/2 z-20 -translate-x-1/2">
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-0.5 shadow-lg">
          <button
            type="button"
            aria-label={`decrease ${ariaLabel}`}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent"
            onClick={() => bump(-1)}
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="px-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">{step}</span>
          <button
            type="button"
            aria-label={`increase ${ariaLabel}`}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent"
            onClick={() => bump(1)}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
