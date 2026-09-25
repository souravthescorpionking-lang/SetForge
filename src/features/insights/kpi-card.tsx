"use client";

// KPI stat card for the insights dashboard.
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function KpiCard({
  icon: Icon,
  label,
  value,
  suffix,
  accent = false,
  delay = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  suffix?: string;
  accent?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: "easeOut" }}
      className={cn(
        "rounded-2xl border border-border/70 bg-card p-3 sm:p-4",
        accent && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            accent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <p className="truncate text-[11px] font-bold uppercase tracking-wide text-foreground/70">
          {label}
        </p>
      </div>
      <p className="mt-2 truncate text-xl font-black tracking-tight numeric sm:text-2xl">
        {value}
        {suffix && <span className="ml-1 text-xs font-bold text-muted-foreground">{suffix}</span>}
      </p>
    </motion.div>
  );
}
