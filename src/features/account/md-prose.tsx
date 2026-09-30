// Shared react-markdown renderers for the static legal prose screens
// (privacy/terms). Prose is exempt from the single-line nowrap law.
import type { ComponentPropsWithoutRef } from "react";

type MdProps<T extends keyof React.JSX.IntrinsicElements> = ComponentPropsWithoutRef<T> & { node?: unknown };

export const MD_PROSE_COMPONENTS = {
  h2: ({ node, ...props }: MdProps<"h2">) => (
    <h2 className="mt-5 mb-2 text-base font-bold leading-tight first:mt-0" {...props} />
  ),
  p: ({ node, ...props }: MdProps<"p">) => (
    <p className="mb-3 text-sm leading-relaxed text-foreground/90" {...props} />
  ),
  ul: ({ node, ...props }: MdProps<"ul">) => (
    <ul className="mb-3 ml-5 list-disc space-y-1 text-sm leading-relaxed" {...props} />
  ),
  li: ({ node, ...props }: MdProps<"li">) => (
    <li className="text-sm leading-relaxed" {...props} />
  ),
  em: ({ node, ...props }: MdProps<"em">) => (
    <em className="text-xs text-muted-foreground" {...props} />
  ),
} as const;
