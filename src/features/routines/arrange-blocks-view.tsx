"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ArrangeBlocksView — the §4.10c shared renderer for the two arrange screens
// (#/programs/{id}/day/{dayId}/arrange and #/today/arrange).
//
//   Block  = rounded-lg border bg-card
//   header = 48px data-row: [code chip 32px] · label (names joined, truncate)
//            · [▲ 40px] [▼ 40px] — moves the WHOLE block
//   body   = 40px data-rows: member name (truncate) · [▲ 40px] [▼ 40px]
//
// Pure presentation: the parent owns the blocks state + persistence.
// ─────────────────────────────────────────────────────────────────────────────

import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hapticTap } from "@/lib/client/haptics";
import type { ArrangeBlock } from "./arrange-blocks";

export function ArrangeBlocksView({
  blocks,
  onMoveBlock,
  onMoveMember,
}: {
  blocks: ArrangeBlock[];
  onMoveBlock: (blockIndex: number, delta: -1 | 1) => void;
  onMoveMember: (blockKey: string, memberIndex: number, delta: -1 | 1) => void;
}) {
  return (
    <div className="flex flex-col gap-2" aria-label="Exercise blocks">
      {blocks.map((block, blockIndex) => (
        <section
          key={block.key}
          aria-label={block.groupId ? `Superset group ${block.letter ?? ""}` : "Ungrouped exercises"}
          className="flex flex-none flex-col overflow-hidden rounded-lg border bg-card"
        >
          {/* block header — moves the whole group as a unit */}
          <div
            data-row
            className="flex h-12 items-center gap-1 overflow-hidden whitespace-nowrap border-b border-border pl-2 pr-1"
          >
            {block.letter ? (
              <span
                className="flex h-8 w-8 flex-none items-center justify-center rounded bg-primary/10 text-xs font-bold tabular-nums text-primary"
                title={`Superset group ${block.letter}`}
                aria-label={`Superset group ${block.letter}`}
              >
                {block.letter}
              </span>
            ) : (
              <span
                className="flex h-8 w-8 flex-none items-center justify-center rounded bg-muted/60 text-xs font-bold text-muted-foreground"
                title="Ungrouped exercises"
                aria-label="Ungrouped exercises"
              >
                ·
              </span>
            )}
            <span className="min-w-0 flex-1 truncate px-1 text-sm font-semibold leading-none" title={block.label}>
              {block.label}
            </span>
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-10 flex-none p-0"
              disabled={blockIndex === 0}
              aria-label={`Move ${block.letter ? `group ${block.letter}` : "ungrouped block"} up`}
              onClick={() => {
                hapticTap();
                onMoveBlock(blockIndex, -1);
              }}
            >
              <ArrowUp className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-10 flex-none p-0"
              disabled={blockIndex === blocks.length - 1}
              aria-label={`Move ${block.letter ? `group ${block.letter}` : "ungrouped block"} down`}
              onClick={() => {
                hapticTap();
                onMoveBlock(blockIndex, 1);
              }}
            >
              <ArrowDown className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          {/* member rows — reorder within the block */}
          {block.members.map((member, memberIndex) => (
            <div
              key={member.id}
              data-row
              className={cn(
                "flex h-10 items-center gap-1 overflow-hidden whitespace-nowrap pl-12 pr-1",
                memberIndex !== block.members.length - 1 && "border-b border-border/60",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={member.name}>
                {member.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                className="h-10 w-10 flex-none p-0"
                disabled={memberIndex === 0}
                aria-label={`Move ${member.name} up`}
                onClick={() => {
                  hapticTap();
                  onMoveMember(block.key, memberIndex, -1);
                }}
              >
                <ArrowUp className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 w-10 flex-none p-0"
                disabled={memberIndex === block.members.length - 1}
                aria-label={`Move ${member.name} down`}
                onClick={() => {
                  hapticTap();
                  onMoveMember(block.key, memberIndex, 1);
                }}
              >
                <ArrowDown className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
