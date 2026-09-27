// ─────────────────────────────────────────────────────────────────────────────
// arrange-blocks.ts — §4.10c group-level rearrange model (pure functions).
//
// Shared by day-arrange-screen (routine days) and today-arrange-screen
// (workout days). Exercises are grouped into ArrangeBlocks:
//   • one block per superset group (letter codes A, B, C… by first appearance
//     — same derivation as computeGroupCodes, so the arrange screen and the
//     detail screens always agree on the codes)
//   • one "Ungrouped" block collecting every groupId=null exercise
//   • block order follows the position of each block's FIRST member, so a
//     no-op session flattens back to exactly the original id order.
// Moving a block reorders the whole group as a unit; moving a member reorders
// within its block. flattenBlocks() yields the single ids array the
// reorderExercises APIs expect.
// ─────────────────────────────────────────────────────────────────────────────

import { computeGroupCodes } from "@/lib/group-codes";

export type ArrangeMember = {
  id: string;
  name: string;
  groupId: string | null;
};

export type ArrangeBlock = {
  /** groupId for group blocks, "ungrouped" for the singleton bucket. */
  key: string;
  groupId: string | null;
  /** Group letter ("A") — null for the ungrouped block. */
  letter: string | null;
  /** Header label: group name when known, else member names joined. */
  label: string;
  members: ArrangeMember[];
};

/**
 * Build the arrangeable block list from sortOrder-sorted members.
 * `groupNames` maps groupId → display name (workout days have one; routine
 * days pass nothing and fall back to the joined member names).
 */
export function buildArrangeBlocks(
  members: ArrangeMember[],
  groupNames?: Map<string, string>,
): ArrangeBlock[] {
  const { groupLetters } = computeGroupCodes(members);
  const blocks: ArrangeBlock[] = [];
  const byKey = new Map<string, ArrangeBlock>();

  for (const m of members) {
    const key = m.groupId ?? "ungrouped";
    let block = byKey.get(key);
    if (!block) {
      const letter = m.groupId ? (groupLetters.get(m.groupId) ?? null) : null;
      block = {
        key,
        groupId: m.groupId,
        letter,
        label: "",
        members: [],
      };
      byKey.set(key, block);
      blocks.push(block);
    }
    block.members.push(m);
  }

  for (const block of blocks) {
    const joined = block.members.map((m) => m.name).join(", ");
    if (block.groupId) {
      const name = groupNames?.get(block.groupId);
      block.label = name ? `${name} · ${joined}` : joined;
    } else {
      block.label = "Ungrouped";
    }
  }
  return blocks;
}

/** Move a whole block up/down among blocks (delta ±1). Pure — returns new blocks. */
export function moveBlock(blocks: ArrangeBlock[], blockIndex: number, delta: -1 | 1): ArrangeBlock[] {
  const j = blockIndex + delta;
  if (blockIndex < 0 || j < 0 || j >= blocks.length) return blocks;
  const next = [...blocks];
  [next[blockIndex], next[j]] = [next[j], next[blockIndex]];
  return next;
}

/** Move a member up/down within its block (delta ±1). Pure — returns new blocks. */
export function moveMember(
  blocks: ArrangeBlock[],
  blockKey: string,
  memberIndex: number,
  delta: -1 | 1,
): ArrangeBlock[] {
  const j = memberIndex + delta;
  if (memberIndex < 0 || j < 0) return blocks;
  return blocks.map((b) => {
    if (b.key !== blockKey) return b;
    if (j >= b.members.length) return b;
    const members = [...b.members];
    [members[memberIndex], members[j]] = [members[j], members[memberIndex]];
    return { ...b, members };
  });
}

/** Flatten blocks into the flat exercise-id order to persist. */
export function flattenBlocks(blocks: ArrangeBlock[]): string[] {
  const ids: string[] = [];
  for (const b of blocks) for (const m of b.members) ids.push(m.id);
  return ids;
}
