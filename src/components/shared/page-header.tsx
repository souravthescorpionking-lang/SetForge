"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  icon,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3 flex-wrap", className)}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate sm:text-2xl">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
