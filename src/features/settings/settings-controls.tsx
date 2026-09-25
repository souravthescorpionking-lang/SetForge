"use client";

// Small building blocks for the settings pages: labelled rows + segmented control.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A settings row: icon + label + helper text on the left, control on the right. */
export function SettingRow({
  icon,
  label,
  helper,
  control,
  className,
  stacked,
}: {
  icon?: ReactNode;
  label: string;
  helper?: ReactNode;
  control: ReactNode;
  className?: string;
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 py-3",
        stacked ? "flex-col items-stretch gap-3 sm:flex-row sm:items-center" : "justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3 min-w-0 sm:flex-1">
        {icon && (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">{label}</p>
          {helper && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{helper}</p>
          )}
        </div>
      </div>
      <div className={cn("shrink-0", stacked && "sm:shrink")}>{control}</div>
    </div>
  );
}

export type SegmentedOption<T extends string | number> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

/** Compact segmented control (2–4 options). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center rounded-xl border border-border/60 bg-muted p-1 gap-0.5",
        className,
      )}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-9 min-w-[74px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-all",
              selected
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Card section heading used on the desktop stacked layout. */
export function SectionHeading({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {icon && (
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-tight">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}
