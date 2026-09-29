// ─────────────────────────────────────────────────────────────────────────────
// tour-gen — SetForge tour registry codegen (Part 7, LAW 1).
//
// Harvests inline declarations from source (never content files):
//   • registerScreen({ id, title, purpose, … })        → screen entries
//   • any object literal with {id,label,help,order}    → TourDecl step
//     (covers tourAttrs({...}), tour={{...}}, declareTour({...}) and typed
//      shared-component arrays like NavBar/NavPane destinations)
//   • { skipTour: true, reason } literals              → counted opt-outs
//
// Emits src/generated/tour-registry.json — deterministic (sorted keys, no
// timestamps, FNV-1a version hashes). `--check` regenerates in memory and
// exits 1 when the committed file is stale (CI gate).
//
// Attribution: declarations inside src/features/screens/<id>.tsx belong to
// screen <id> (the file MUST call registerScreen). Everything else is a
// shared component declaration grouped by the id prefix before the first
// dot (nav, navpane, exerciseCard, setRow, …).
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src");
const OUT = join(SRC, "generated", "tour-registry.json");
const SCAN_DIRS = ["features", "components", "app"].map((d) => join(SRC, d));

type Val = string | number | boolean | string[];
type Obj = Record<string, Val>;

interface Decl {
  file: string;
  id: string;
  label: string;
  help: string;
  order: number;
  when: string[];
  hint: boolean;
  placement: string;
  shortcut?: string;
  expandFirst?: string;
}

interface ScreenReg {
  file: string;
  id: string;
  title: string;
  purpose: string;
  emptyPurpose?: string;
  parent?: string;
}

// ── file walking ─────────────────────────────────────────────────────────────

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(name)) acc.push(p);
  }
  return acc;
}

// ── object-literal extraction (brace matching, string/template aware) ───────

/** Every balanced object literal in the source at ANY nesting depth. */
function extractObjects(src: string): Array<{ start: number; inner: string }> {
  const out: Array<{ start: number; inner: string }> = [];
  const stack: number[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) break;
        i++;
      }
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "{") {
      stack.push(i);
    } else if (c === "}") {
      const start = stack.pop();
      if (start != null) out.push({ start, inner: src.slice(start + 1, i) });
    }
    i++;
  }
  return out;
}

/** Parse one raw object-literal body into key → static value pairs. */
function parseObject(inner: string): Obj | null {
  // split top-level commas (depth-aware)
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let i = 0;
  const n = inner.length;
  let ok = true;
  while (i < n) {
    const c = inner[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      cur += c;
      i++;
      while (i < n) {
        if (inner[i] === "\\") {
          cur += inner[i] + (inner[i + 1] ?? "");
          i += 2;
          continue;
        }
        cur += inner[i];
        if (inner[i] === quote) break;
        i++;
      }
      i++;
      continue;
    }
    if (c === "[" || c === "{") depth++;
    if (c === "]" || c === "}") depth--;
    if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) parts.push(cur);
  const obj: Obj = {};
  for (const part of parts) {
    const m = /^("?)([A-Za-z0-9_-]+)\1\s*:\s*([\s\S]+)$/.exec(part.trim());
    if (!m) {
      continue; // spread/rest/computed/function bodies — opaque, not an error
    }
    const [, , key, rawVal] = m;
    const v = rawVal.trim();
    if (/^(["'])([\s\S]*)\1$/.test(v)) {
      obj[key] = v.slice(1, -1);
    } else if (/^-?\d+(\.\d+)?$/.test(v)) {
      obj[key] = Number(v);
    } else if (v === "true") {
      obj[key] = true;
    } else if (v === "false") {
      obj[key] = false;
    } else if (/^\[\s*\]$/.test(v)) {
      obj[key] = [];
    } else if (/^\[[\s\S]*\]$/.test(v)) {
      // array — parse string elements; anything else is opaque
      const items: string[] = [];
      const arr = v.slice(1, -1);
      const re = /(["'])((?:\\.|(?!\1).)*)\1/g;
      let mm: RegExpExecArray | null;
      let consumed = 0;
      let onlyStrings = true;
      while ((mm = re.exec(arr))) {
        if (arr.slice(consumed, mm.index).trim().replace(/,/g, "").length > 0) {
          onlyStrings = false;
          break;
        }
        items.push(mm[2]);
        consumed = re.lastIndex;
      }
      if (arr.slice(consumed).trim().replace(/,/g, "").length > 0) onlyStrings = false;
      if (onlyStrings) obj[key] = items;
      // mixed arrays (identifiers/objects) → opaque: key simply not recorded
    } else {
      // nested object / identifier / template / expression → opaque:
      // the key is intentionally NOT recorded. Nested objects are captured
      // separately by extractObjects (any depth) and parsed on their own.
    }
  }
  return ok ? obj : null;
}

// ── declaration classification ───────────────────────────────────────────────

function isTourDecl(o: Obj): boolean {
  return (
    typeof o.id === "string" &&
    typeof o.label === "string" &&
    typeof o.help === "string" &&
    typeof o.order === "number"
  );
}

function isSkipTour(o: Obj): boolean {
  return o.skipTour === true && typeof o.reason === "string";
}

function toDecl(file: string, o: Obj): Decl {
  const whenRaw = Array.isArray(o.when) ? o.when : [];
  return {
    file,
    id: o.id as string,
    label: o.label as string,
    help: o.help as string,
    order: o.order as number,
    when: whenRaw.length > 0 ? (whenRaw as string[]) : ["always"],
    hint: o.hint === true,
    placement: typeof o.placement === "string" ? o.placement : "auto",
    shortcut: typeof o.shortcut === "string" ? o.shortcut : undefined,
    expandFirst: typeof o.expandFirst === "string" ? o.expandFirst : undefined,
  };
}

// ── validation ───────────────────────────────────────────────────────────────

const errors: string[] = [];
const warnings: string[] = [];

function checkDecl(d: Decl) {
  const rel = d.file;
  if (d.help.length > 90) errors.push(`${rel}: ${d.id} help is ${d.help.length} chars (max 90)`);
  const words = d.label.trim().split(/\s+/).filter(Boolean).length;
  if (words > 3) errors.push(`${rel}: ${d.id} label has ${words} words (max 3)`);
  if (d.order % 10 !== 0) warnings.push(`${rel}: ${d.id} order ${d.order} is not a multiple of 10`);
  if (!/^[a-z][A-Za-z0-9]*\.[A-Za-z0-9_-]+$/.test(d.id)) {
    errors.push(`${rel}: ${d.id} must be <prefix>.<elementKey>`);
  }
}

function checkScreen(s: ScreenReg) {
  if (s.purpose.length > 120) errors.push(`${s.file}: purpose is ${s.purpose.length} chars (max 120)`);
  if (s.title.length === 0) errors.push(`${s.file}: empty title`);
}

// ── hash (FNV-1a 32-bit, deterministic) ──────────────────────────────────────

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ── main scan ────────────────────────────────────────────────────────────────

const files = SCAN_DIRS.flatMap((d) => walk(d)).sort();
const screens = new Map<string, ScreenReg>();
const screenDecls: Decl[] = []; // declarations inside screen files (scope: screen)
const componentSteps = new Map<string, Decl[]>(); // shared/component declarations by id prefix
let skipOuts = 0;
let rawAnchors = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).split(sep).join("/");
  const isScreenFile = rel.startsWith("src/features/screens/");

  // registerScreen( {…} ) — find call sites
  const regRe = /registerScreen\s*\(/g;
  let m: RegExpExecArray | null;
  const objects = extractObjects(src);
  const regCalls: Obj[] = [];
  while ((m = regRe.exec(src))) {
    const afterParen = m.index + m[0].length;
    // nearest object literal starting at/after the paren
    const obj = objects.find((o) => o.start >= afterParen && o.start <= afterParen + 8);
    if (obj) {
      const parsed = parseObject(obj.inner);
      if (parsed && typeof parsed.id === "string" && typeof parsed.title === "string" && typeof parsed.purpose === "string") {
        regCalls.push(parsed);
      } else {
        errors.push(`${rel}: registerScreen(...) argument is not a static object literal`);
      }
    }
  }
  for (const reg of regCalls) {
    const s: ScreenReg = {
      file: rel,
      id: reg.id as string,
      title: reg.title as string,
      purpose: reg.purpose as string,
      emptyPurpose: typeof reg.emptyPurpose === "string" ? reg.emptyPurpose : undefined,
      parent: typeof reg.parent === "string" ? reg.parent : undefined,
    };
    checkScreen(s);
    if (screens.has(s.id) && screens.get(s.id)!.file !== rel) {
      errors.push(`${rel}: duplicate registerScreen id "${s.id}" (also in ${screens.get(s.id)!.file})`);
    }
    screens.set(s.id, s);
  }

  // bare data-tour-id="..." literal anchors (metadata-less)
  const anchorRe = /data-tour-id=\{?\s*"([A-Za-z0-9_.-]+)"/g;
  while ((m = anchorRe.exec(src))) rawAnchors++;

  // object literals → declarations
  for (const obj of objects) {
    const parsed = parseObject(obj.inner);
    if (!parsed) continue;
    if (isTourDecl(parsed)) {
      const d = toDecl(rel, parsed);
      checkDecl(d);
      if (isScreenFile) {
        screenDecls.push(d);
      } else {
        const comp = d.id.split(".")[0];
        if (!componentSteps.has(comp)) componentSteps.set(comp, []);
        componentSteps.get(comp)!.push(d);
      }
    } else if (isSkipTour(parsed)) {
      const reason = parsed.reason as string;
      if (reason.trim().length < 10) errors.push(`${rel}: skipTour reason too short (min 10 chars): "${reason}"`);
      skipOuts++;
    }
  }

  if (isScreenFile && regCalls.length === 0) {
    // LAW 2 — hard gate (migration complete: all screens registered).
    errors.push(`${rel}: screen file does not call registerScreen({...}) (LAW 2)`);
  }
}

// duplicate-id discipline: same id in DIFFERENT files is an error (real
// collision); same id within one file is a legitimate state VARIANT (only
// one renders at a time — the engine picks the first variant whose `when`
// matches the live screen context).
{
  const seen = new Map<string, string>();
  const flat: Decl[] = [...screenDecls];
  for (const [, list] of componentSteps) flat.push(...list);
  for (const d of flat) {
    if (seen.has(d.id) && seen.get(d.id) !== d.file) {
      errors.push(`duplicate tour id "${d.id}" (${seen.get(d.id)} and ${d.file})`);
    }
    seen.set(d.id, d.file);
  }
  // prefix discipline: steps declared inside a screen file must be prefixed
  // with that screen's registerScreen id.
  const screenFileIds = new Map<string, string>(); // rel file → screen id
  for (const [, reg] of screens) screenFileIds.set(reg.file, reg.id);
  for (const d of flat) {
    const sid = screenFileIds.get(d.file);
    if (sid && !d.id.startsWith(`${sid}.`)) {
      errors.push(`${d.file}: step "${d.id}" must be prefixed "${sid}." (matches registerScreen id)`);
    }
  }
}

// ── build registry ───────────────────────────────────────────────────────────

function stepOut(d: Decl) {
  const o: Record<string, unknown> = {
    id: d.id,
    label: d.label,
    help: d.help,
    order: d.order,
    when: d.when,
    hint: d.hint,
    placement: d.placement,
  };
  if (d.shortcut != null) o.shortcut = d.shortcut;
  if (d.expandFirst != null) o.expandFirst = d.expandFirst;
  o.scope = "component";
  return o;
}

const screensOut: Record<string, unknown> = {};
for (const id of [...screens.keys()].sort()) {
  const reg = screens.get(id)!;
  const steps = screenDecls
    .filter((d) => d.id.startsWith(`${id}.`))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((d) => ({ ...stepOut(d), scope: "screen" }));
  const payload = JSON.stringify({ title: reg.title, purpose: reg.purpose, emptyPurpose: reg.emptyPurpose, steps });
  screensOut[id] = {
    title: reg.title,
    purpose: reg.purpose,
    ...(reg.emptyPurpose != null ? { emptyPurpose: reg.emptyPurpose } : {}),
    ...(reg.parent != null ? { parent: reg.parent } : {}),
    steps,
    version: fnv1a(payload),
  };
}

const componentsOut: Record<string, unknown> = {};
for (const comp of [...componentSteps.keys()].sort()) {
  const steps = componentSteps.get(comp)!
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map(stepOut);
  componentsOut[comp] = { steps };
}

// welcome tour: nav.* (mobile) + navpane.* (desktop) + tourhelp.* steps
const welcomeSteps = [
  ...(componentSteps.get("nav") ?? []),
  ...(componentSteps.get("tourhelp") ?? []),
]
  .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  .map(stepOut);

const registry = {
  version: fnv1a(JSON.stringify({ screens: screensOut, components: componentsOut, welcome: welcomeSteps })),
  screens: screensOut,
  components: componentsOut,
  welcome: { steps: welcomeSteps, version: fnv1a(JSON.stringify(welcomeSteps)) },
};

const serialized = JSON.stringify(registry, null, 2) + "\n";

// ── output / check ───────────────────────────────────────────────────────────

const check = process.argv.includes("--check");

if (errors.length > 0) {
  console.error("✖ tour:gen validation errors:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

for (const w of warnings) console.warn(`⚠ ${w}`);

if (check) {
  const existing = existsSync(OUT) ? readFileSync(OUT, "utf8") : null;
  if (existing !== serialized) {
    console.error("✖ src/generated/tour-registry.json is stale — run `pnpm tour:gen` and commit it.");
    process.exit(1);
  }
  console.log(
    `✔ tour registry in sync (${Object.keys(screensOut).length} screens, ` +
      `${Object.keys(componentsOut).length} components, ${welcomeSteps.length} welcome steps, ` +
      `${skipOuts} skipTour opt-outs, ${rawAnchors} raw anchors)`,
  );
} else {
  writeFileSync(OUT, serialized);
  console.log(
    `✔ wrote ${relative(ROOT, OUT)} — ${Object.keys(screensOut).length} screens, ` +
      `${Object.keys(componentsOut).length} components, ${welcomeSteps.length} welcome steps, ` +
      `${skipOuts} skipTour opt-outs, ${rawAnchors} raw anchors` +
      (warnings.length ? `, ${warnings.length} warnings` : ""),
  );
}
