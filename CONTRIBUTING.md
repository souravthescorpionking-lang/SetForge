# Contributing to SetForge

## UI = Tour (the Part 7 law)

Every interactive element documents itself. The guided tour, the Help page and
the shortcuts list are GENERATED from inline declarations on the UI — nobody
writes tour content files.

### Adding or changing a control

```tsx
import { tourAttrs } from "@/lib/tour/attrs";

<button
  {...tourAttrs({
    id: "picker.search",                    // <screen>.<element>
    label: "Search",                        // ≤ 3 words
    help: "Filter exercises by name instantly.",  // ≤ 90 chars
    order: 20,                              // 10, 20, 30 …
  })}
  …
/>
```

- shadcn `<Button>` accepts the same object as a `tour` prop.
- Shared components declare once with their own prefix (`setRow.done`,
  `exerciseCard.header`) — every screen that renders them inherits the step.
- Mutually-exclusive states get distinct ids (`home.todayCard` vs
  `home.restCard`); `when: ["empty" | "populated" | "edit" | …]` gates
  contextual variants.
- Not tour-worthy? `tour={{ skipTour: true, reason: "…" }}`.

### Adding a screen

```bash
bun run gen:screen <id> --title "Title" --purpose "One line."
# then wire router.ts + app-shell.tsx (printed by the scaffold)
```

`registerScreen` in the slot file is mandatory (lint error + codegen failure
without it).

### After any declaration change

```bash
bun run tour:gen      # regenerate src/generated/tour-registry.json
bun run tour:check    # CI gate — fails if the committed registry is stale
bun run lint          # setforge-tour/* rules must stay clean
```

Commit the regenerated `src/generated/tour-registry.json` with your change.
The per-screen `version` hash encodes its steps+purpose — bumping content
lets existing users re-see that screen's tour when they enable
"Replay tours when screens change" in Settings.

## General

- Follow `AGENTS.md` (layout laws, data layer, one ExerciseCard/SetRow).
- `bun run lint` + `bunx tsc --noEmit` + `bun run tour:check` must pass.
- Browser-verify UI work before reporting it done.
