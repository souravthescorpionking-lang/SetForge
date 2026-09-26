"use client";

import { cn } from "@/lib/utils";

export function CategoryDot({
  colour,
  size = 10,
  className,
  ring = true,
}: {
  colour?: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block rounded-full shrink-0", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: colour ?? "var(--muted-foreground)",
        boxShadow: ring ? `0 0 0 2px color-mix(in srgb, ${colour ?? "var(--muted-foreground)"} 25%, transparent)` : undefined,
      }}
    />
  );
}
