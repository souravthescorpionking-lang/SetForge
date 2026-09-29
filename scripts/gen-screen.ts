// ─────────────────────────────────────────────────────────────────────────────
// gen-screen — scaffold a new SetForge screen with the Part 7 tour contract
// baked in (registerScreen + TopBarHelp + a first tour declaration).
//
//   bun run gen:screen <id> --title "My Screen" --purpose "One line, ≤120 chars."
//
// Creates:
//   src/features/screens/<id>.tsx      (slot: registerScreen + re-export)
//   src/features/<kebab-id>/<kebab-id>-screen.tsx (Screen/TopBar/ScrollBody stub)
// Then prints the two manual steps (router.ts + app-shell.tsx switch).
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

const rawArgs = process.argv.slice(2);
const id = rawArgs[0];
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('Usage: bun run gen:screen <kebab-case-id> --title "Title" --purpose "≤120 chars"');
  process.exit(1);
}

function opt(name: string, fallback: string): string {
  const i = rawArgs.indexOf(`--${name}`);
  if (i >= 0 && rawArgs[i + 1]) return rawArgs[i + 1];
  return fallback;
}

const title = opt("title", id.replace(/(^|-)(\w)/g, (_, __, c: string) => " " + c.toUpperCase()).trim());
const purpose = opt("purpose", "Describe this screen in one line (≤120 chars).");

const kebab = id;
const screenDir = join(ROOT, "src/features", kebab);
const slotPath = join(ROOT, "src/features/screens", `${kebab}.tsx`);
const featurePath = join(screenDir, `${kebab}-screen.tsx`);

if (existsSync(slotPath)) {
  console.error(`✖ ${slotPath} already exists`);
  process.exit(1);
}

const slot = `"use client";

// Screen slot — #/${kebab}
// Thin re-export of the ${title} screen.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// Declare the inline ${id}.* steps on the elements in the feature module.
const SCREEN = registerScreen({
  id: "${id}",
  title: "${title}",
  purpose: "${purpose.replace(/"/g, '\\"')}",
});
void SCREEN;

export { default } from "@/features/${kebab}/${kebab}-screen";
`;

const feature = `"use client";

// ${title} — #/${kebab}. Scaffolded by gen:screen (Part 7 tour contract
// included). Replace this stub with the real screen; keep registerScreen in
// the slot file and declare tour steps INLINE on the elements (LAW 1).

import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { tourAttrs } from "@/lib/tour/attrs";

export default function ${id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase())}Screen() {
  return (
    <Screen topBar={<TopBar title="${title}" actions={<TopBarHelp />} />}>
      <ScrollBody>
        <div
          {...tourAttrs({ id: "${id}.root", label: "${title}", help: "Replace with a real declaration on the primary control.", order: 10 })}
          className="flex h-20 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
        >
          ${title} scaffold — declare your tour steps inline.
        </div>
      </ScrollBody>
    </Screen>
  );
}
`;

mkdirSync(screenDir, { recursive: true });
writeFileSync(slotPath, slot);
writeFileSync(featurePath, feature);

console.log(`✔ created src/features/screens/${kebab}.tsx`);
console.log(`✔ created src/features/${kebab}/${kebab}-screen.tsx`);
console.log(`
MANUAL STEPS (the router is hand-maintained by design):
 1. src/features/shell/router.ts — add "${id}" to RouteName + a parseRoute case.
 2. src/features/shell/app-shell.tsx — import the slot + add the renderScreen case.
 3. Run \`bun run tour:gen\` and commit src/generated/tour-registry.json.
`);
