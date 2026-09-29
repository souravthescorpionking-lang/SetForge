# AGENTS.md — SetForge agent contract

Read `worklog.md` FIRST in every session/agent run: it is the single source of
truth for architecture conventions, past decisions and the handover state.
Append your entry (never overwrite) using the `--- / Task ID / Agent / Task /
Work Log / Stage Summary` template.

## The non-negotiables (all parts)

1. **One visible route** (`/`) — all screens are hash routes inside the single
   page. The router (`src/features/shell/router.ts`) and shell
   (`src/features/shell/app-shell.tsx`) are hand-maintained; screen files are
   replaceable slots.
2. **Layout laws** — every screen is `Screen → TopBar → [SubBar] → ScrollBody →
   [BottomBar] → NavBar`. Bars are flex siblings (NEVER fixed/absolute). The
   ScrollBody is the ONLY vertical scroll container. The tour overlay is the
   single sanctioned exception to "no position:fixed" (z-index 45, transient).
3. **Data layer** — typed `xxxApi` groups in `src/lib/client/api.ts` + TanStack
   Query. Every server query filters `userId`; mutations assert ownership.
   UUIDv7 app-side via `uuid7()`.
4. **One ExerciseCard, one SetRow** — shared components live in
   `src/components/exercise-card/` and `src/components/set-row/`.

## UI = Tour (Part 7 contract — mandatory for every UI change)

**The UI is the single source of tour/help content. There are no hand-written
tour, help or shortcut content files.**

When you add or change any interactive element, you declare its tour step
INLINE (that declaration IS the help text):

```tsx
import { tourAttrs } from "@/lib/tour/attrs";

<button {...tourAttrs({
  id: "home.start",            // <screenId>.<elementKey>  (or <componentId>.<key>)
  label: "Start workout",      // ≤ 3 words
  help: "Begin today's session and jump to the logger.",  // ≤ 90 chars
  order: 20,                   // gaps of 10; shared components use 100+
  when: ["populated"],         // optional gates
})} … />

<Button tour={{ id: "home.start", label: "Start", help: "…", order: 20 }} … />
```

Rules enforced by lint (`setforge-tour/*`) and codegen (`bun run tour:check`):

- Every screen slot file MUST call `registerScreen({ id, title, purpose })`
  (id = route name). Missing → lint ERROR + `tour:gen` failure.
- Every declaration must be a STATIC literal (no templates/variables).
- Mutually-exclusive render states get DISTINCT ids (`home.todayCard` /
  `home.restCard` / `home.emptyCard`) — the engine cannot disambiguate
  same-id "always" variants.
- Opt-outs: `tour={{ skipTour: true, reason: "≥10 chars" }}`.
- After editing declarations: run `bun run tour:gen` and COMMIT
  `src/generated/tour-registry.json` (deterministic; CI fails if stale).
- New screens: `bun run gen:screen <id> --title "…" --purpose "…"` scaffold.

Entry points that exist for free once you declare: TopBarHelp popover (Tour
this screen / Help for this screen), the generated Help page sections +
"Show me" buttons, Settings → Help & tours (per-screen status + replay), the
welcome tour, `?tour=1` deep links, and `?` / `Shift+?` keyboard shortcuts.

## Dev loop

- `bun run dev` (port 3000, logs to `dev.log`; watchdog.sh auto-restarts on
  sandbox OOM).
- `bun run lint` — 0 errors required; `setforge-tour/required` warnings are
  the tracked reverse-coverage backlog (declare or skipTour to shrink).
- `bun run tour:check` — must pass (registry in sync).
- `bunx tsc --noEmit` — no new errors.
- `bun run db:generate && bun run db:push` after schema edits (additive).
- Verify UI changes with agent-browser before reporting done.
