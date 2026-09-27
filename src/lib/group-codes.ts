// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — group code assignment (§4.10). Groups get letter codes by creation
// order (A, B, C…); members get `A1, A2…` by order. Pure + deterministic;
// recomputed on reorder; stored derived, never user-editable.
// ─────────────────────────────────────────────────────────────────────────────

export interface CodeInput {
  id: string;
  groupId: string | null;
}

/**
 * Map of exerciseId → display code (`A1`), plus groupId → group letter.
 * Ungrouped exercises get no code (undefined).
 */
export function computeGroupCodes(exercises: Array<{ id: string; groupId: string | null; sortOrder?: number }>): {
  groupLetters: Map<string, string>;
  codes: Map<string, string>;
} {
  const ordered = [...exercises].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const groupOrder: string[] = [];
  for (const ex of ordered) {
    if (ex.groupId && !groupOrder.includes(ex.groupId)) groupOrder.push(ex.groupId);
  }
  const groupLetters = new Map<string, string>();
  groupOrder.forEach((gid, i) => {
    groupLetters.set(gid, String.fromCharCode(65 + (i % 26)));
  });
  const codes = new Map<string, string>();
  const memberCount = new Map<string, number>();
  for (const ex of ordered) {
    if (!ex.groupId) continue;
    const letter = groupLetters.get(ex.groupId);
    if (!letter) continue;
    const n = (memberCount.get(ex.groupId) ?? 0) + 1;
    memberCount.set(ex.groupId, n);
    codes.set(ex.id, `${letter}${n}`);
  }
  return { groupLetters, codes };
}

/** Guided-mode pointer order (§4.11): within group round-robin A1s1, A2s1, A1s2…; ungrouped sequential. */
export function guidedPointerOrder(
  exercises: Array<{ id: string; groupId: string | null; setCount: number }>,
): Array<{ exerciseId: string; setIndex: number }> {
  const ordered: Array<{ exerciseId: string; setIndex: number }> = [];
  const groups = new Map<string, Array<{ id: string; setCount: number }>>();
  const ungrouped: Array<{ id: string; setCount: number }> = [];
  for (const ex of exercises) {
    if (ex.groupId) {
      const list = groups.get(ex.groupId) ?? [];
      list.push({ id: ex.id, setCount: ex.setCount });
      groups.set(ex.groupId, list);
    } else {
      ungrouped.push({ id: ex.id, setCount: ex.setCount });
    }
  }
  // Ungrouped first (sequential), then each group interleaved round-robin.
  for (const ex of ungrouped) {
    for (let s = 0; s < ex.setCount; s++) ordered.push({ exerciseId: ex.id, setIndex: s });
  }
  for (const members of groups.values()) {
    let round = 0;
    let remaining = members.reduce((m, x) => m + x.setCount, 0);
    while (remaining > 0) {
      for (const m of members) {
        if (round < m.setCount) {
          ordered.push({ exerciseId: m.id, setIndex: round });
          remaining -= 1;
        }
      }
      round += 1;
    }
  }
  return ordered;
}
