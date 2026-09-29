"use client";

// ─────────────────────────────────────────────────────────────────────────────
// tool-bits — shared primitives for the #/tools inline expansions (p3-8).
//
// Tools are inline-expandable rows (56px data-row headers; tap → inline
// expansion below the row, NOT a dialog; only one open at a time — the open
// tool is the ?tool= hash param). All inputs single-line; results as rows.
// Spacing tokens only; radius 8.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { tourAttrs } from "@/lib/tour/attrs";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** 56px tool header row: icon + name + short description (ellipsis) + chevron. */
export function ToolRow({
  icon,
  name,
  description,
  open,
  onClick,
}: {
  icon: ReactNode;
  name: string;
  description: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-row
      aria-expanded={open}
      {...tourAttrs({ id: "tools.row", label: "Tool row", help: "Tap to expand this calculator inline.", order: 20 })}
      onClick={onClick}
      className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/50 px-1 text-left hover:bg-accent/40"
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary [&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </span>
      <span className="min-w-0 max-w-[50%] flex-none truncate text-sm font-semibold">{name}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{description}</span>
      {open ? (
        <ChevronDown className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
      ) : (
        <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
      )}
    </button>
  );
}

/** Expansion block rendered below an open tool row (NOT a data-row itself). */
export function ToolPanel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex flex-none flex-col gap-1 border-b border-border/50 bg-muted/20 p-2" aria-label={label}>
      {children}
    </div>
  );
}

/** 48px data-row field: fixed label | single-line number input (48px) + unit. */
export function FieldRow({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  step,
  disabled,
  ariaLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div data-row className="flex h-12 items-center gap-2 overflow-hidden whitespace-nowrap">
      <span className="w-24 flex-none truncate text-xs text-muted-foreground">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        className="h-12 min-w-0 flex-1 rounded-lg tabular-nums"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel ?? label}
        {...tourAttrs({ id: "tools.field", label: "Number field", help: "Type the value for this calculator input.", order: 30 })}
      />
      {unit ? <span className="w-8 flex-none text-xs text-muted-foreground">{unit}</span> : null}
    </div>
  );
}

/** 40px data-row result: label flex-1 | value right (tabular). */
export function ResultRow({
  label,
  value,
  valueClassName,
  highlight,
  onClick,
  ariaLabel,
}: {
  label: ReactNode;
  value: ReactNode;
  valueClassName?: string;
  highlight?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const cls = cn(
    "flex h-10 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg px-2",
    onClick && "w-full text-left hover:bg-accent/40",
    highlight && "bg-primary/10",
  );
  const body = (
    <>
      <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", highlight && "text-primary")}>{label}</span>
      <span className={cn("flex-none text-sm tabular-nums text-muted-foreground", highlight && "font-bold text-primary", valueClassName)}>
        {value}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" data-row {...tourAttrs({ id: "tools.resultRow", label: "Result row", help: "Tap to apply or toggle this row.", order: 40 })} className={cls} onClick={onClick} aria-label={ariaLabel}>
        {body}
      </button>
    );
  }
  return (
    <div data-row className={cls}>
      {body}
    </div>
  );
}

/** Muted one-line note inside a panel (NOT a data-row). */
export function PanelNote({ children }: { children: ReactNode }) {
  return <p className="flex-none px-1 text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

/** Parse a numeric input draft; null when empty/invalid. */
export function parseNum(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
