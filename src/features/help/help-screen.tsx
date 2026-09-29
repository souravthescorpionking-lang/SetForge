"use client";

// ─────────────────────────────────────────────────────────────────────────────
// HelpScreen — #/help (Part 7: AUTO-GENERATED from the tour registry).
//
// Layout laws: Screen → TopBar (56, back + TopBarHelp) → SubBar (48, search)
// → ScrollBody (the single scroll). Sections are generated per screen:
//   • 32px uppercase title header (collapsible; ?s=<screenId> auto-expands)
//   • 40px purpose row (muted; italic "When empty: …" when present)
//   • one 48px row per step: bold label — help text · kbd chip (shortcut) ·
//     hint badge · "Show me" (→ that screen with ?tour=1)
// Screens with a `parent` are grouped under the parent's section.
// AFTER the generated sections (clearly separated): the static Offline and
// Your data sections, and a Keyboard shortcuts section generated from
// registry steps with `shortcut` plus the global keys.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Screen, TopBar, ScrollBody, SubBar, TopBarHelp } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Database, Keyboard, Play, WifiOff, ArrowLeft } from "lucide-react";
import type { TourStep } from "@/lib/tour/types";
import { useApp } from "@/lib/client/store";
import { replaceHash, useHashRoute } from "@/features/shell/router";
import { registry, screenTourHash } from "@/features/tour";

// ── generated content model ──────────────────────────────────────────────────

type ChildSection = {
  id: string;
  title: string;
  purpose: string;
  emptyPurpose?: string;
  steps: TourStep[];
};

type Section = ChildSection & { children: ChildSection[] };

function buildSections(): Section[] {
  const topLevel: Section[] = [];
  const byParent = new Map<string, ChildSection[]>();
  const make = (id: string): ChildSection => {
    const e = registry.screens[id];
    return {
      id,
      title: e.title,
      purpose: e.purpose,
      emptyPurpose: e.emptyPurpose,
      steps: helpSteps(id),
    };
  };
  for (const id of Object.keys(registry.screens)) {
    const entry = registry.screens[id];
    if (entry.parent && registry.screens[entry.parent]) {
      const list = byParent.get(entry.parent) ?? [];
      list.push(make(id));
      byParent.set(entry.parent, list);
    } else {
      topLevel.push({ ...make(id), children: [] });
    }
  }
  const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
  for (const sec of topLevel) sec.children = (byParent.get(sec.id) ?? []).sort(byTitle);
  return topLevel.sort(byTitle);
}

/** Screen steps + shared-component steps whose id prefix matches the screen. */
function helpSteps(screenId: string): TourStep[] {
  const out: TourStep[] = [...(registry.screens[screenId]?.steps ?? [])];
  const prefix = `${screenId}.`;
  for (const comp of Object.values(registry.components)) {
    for (const s of comp.steps) if (s.id.startsWith(prefix)) out.push(s);
  }
  return out.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Every registry step with a shortcut (deduped by id — screens + components). */
function shortcutSteps(): TourStep[] {
  const seen = new Set<string>();
  const out: TourStep[] = [];
  for (const id of Object.keys(registry.screens)) {
    for (const s of registry.screens[id].steps) {
      if (s.shortcut && !seen.has(s.id)) {
        seen.add(s.id);
        out.push(s);
      }
    }
  }
  for (const comp of Object.values(registry.components)) {
    for (const s of comp.steps) {
      if (s.shortcut && !seen.has(s.id)) {
        seen.add(s.id);
        out.push(s);
      }
    }
  }
  return out.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ── static content (kept from the pre-Part 7 help page) ──────────────────────

const GLOBAL_SHORTCUTS: Array<{ keys: string; desc: string }> = [
  { keys: "?", desc: "Open the help menu for the current screen" },
  { keys: "Shift + ?", desc: "Start the tour for the current screen" },
  { keys: "N", desc: "Add an exercise (jump to the picker)" },
  { keys: "/", desc: "Focus the search field on the current screen" },
  { keys: "Tab", desc: "Move between set cells" },
  { keys: "Enter", desc: "Commit a cell / move to the next row; on the last column it adds a new set" },
  { keys: "↑ / ↓", desc: "Move between rows in the same column while editing" },
  { keys: "Esc", desc: "Close a popover or menu" },
];

const STATIC_SECTIONS = [
  {
    icon: WifiOff,
    title: "Offline",
    items: [
      { term: "Works offline", desc: "Set edits made while offline are queued in an outbox and replayed automatically when you reconnect." },
      { term: "Offline banner", desc: "A banner appears with the queued-change count while you are offline." },
      { term: "Install as app", desc: "Use your browser's Install / Add to Home Screen action — SetForge runs standalone." },
    ],
  },
  {
    icon: Database,
    title: "Your data",
    items: [
      { term: "Backup", desc: "Settings → Data → Download backup produces a full JSON snapshot of your account." },
      { term: "Restore", desc: "Import accepts your own backups in Replace or Merge mode (other accounts' backups are rejected)." },
      { term: "Export CSV", desc: "Workout and body-movement history can be exported as CSV for spreadsheets." },
      { term: "Delete", desc: "Delete history (all / date range / by exercise) and delete account are both available with confirmation." },
    ],
  },
] as const;

// ── rows ─────────────────────────────────────────────────────────────────────

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="flex h-6 min-w-6 flex-none items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] font-semibold text-foreground">
      {children}
    </kbd>
  );
}

function StepRow({ step, screenId }: { step: TourStep; screenId: string }) {
  const navigate = useApp((s) => s.navigate);
  return (
    <div className="flex h-12 items-center gap-2 border-b border-border/50 px-4 last:border-b-0">
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-semibold">{step.label}</span>
        <span className="text-muted-foreground"> — {step.help}</span>
      </p>
      {step.shortcut ? <Kbd>{step.shortcut}</Kbd> : null}
      {step.hint ? (
        <span className="flex h-5 flex-none items-center rounded-full border border-primary/40 bg-primary/10 px-2 text-[10px] font-bold uppercase leading-none text-primary">
          hint
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        className="h-9 flex-none px-3 text-primary"
        onClick={() => navigate(screenTourHash(screenId))}
      >
        <Play className="h-3.5 w-3.5" aria-hidden />
        Show me
      </Button>
    </div>
  );
}

function PurposeRow({ text, emptyText, child }: { text: string; emptyText?: string; child?: boolean }) {
  return (
    <p
      className={`flex h-10 items-center text-sm text-muted-foreground ${child ? "pl-8" : "px-4"}`}
    >
      <span className="min-w-0 flex-1 truncate">
        {child ? <span className="font-semibold text-foreground">{text}</span> : text}
        {emptyText ? <span className="italic"> · When empty: {emptyText}</span> : null}
      </span>
    </p>
  );
}

// ── screen ───────────────────────────────────────────────────────────────────

export default function HelpScreen() {
  const route = useHashRoute();
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const sections = useMemo(() => buildSections(), []);
  const generatedShortcuts = useMemo(() => shortcutSteps(), []);
  const query = q.trim().toLowerCase();

  const matches = (...texts: Array<string | undefined>): boolean => {
    if (!query) return true;
    return texts.some((t) => (t ?? "").toLowerCase().includes(query));
  };

  const stepMatches = (s: TourStep) => matches(s.label, s.help, s.shortcut);
  const childMatches = (c: ChildSection) =>
    matches(c.title, c.purpose, c.emptyPurpose) || c.steps.some(stepMatches);
  const sectionMatches = (s: Section) => matches(s.title, s.purpose, s.emptyPurpose) || childMatches(s) || s.children.some(childMatches);

  const expanded = (id: string) => (query ? true : !collapsed.has(id));
  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ?s=<screenId> → auto-expand + scroll to that section.
  const target = route.query.get("s");
  useEffect(() => {
    if (!target) return;
    setCollapsed((prev) => {
      if (!prev.has(target)) return prev;
      const next = new Set(prev);
      next.delete(target);
      return next;
    });
    const t = setTimeout(() => {
      document.getElementById(`help-section-${CSS.escape(target)}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 120);
    return () => clearTimeout(t);
  }, [target]);

  const staticMatch = (title: string, items: ReadonlyArray<{ term: string; desc: string }>) =>
    matches(title) || items.some((i) => matches(i.term, i.desc));

  return (
    <Screen
      topBar={
        <TopBar
          title="Help & Shortcuts"
          leading={
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-11 px-0"
              aria-label="Back to settings"
              onClick={() => replaceHash(route.query.get("from") === "settings" ? "#/settings" : "#/today")}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          actions={<TopBarHelp />}
        />
      }
      subBar={
        <SubBar>
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search screens, controls, shortcuts…"
            aria-label="Search help"
            className="h-10"
          />
        </SubBar>
      }
    >
      <ScrollBody contentClassName="gap-6">
        <p className="flex-none text-sm leading-relaxed text-muted-foreground">
          SetForge is a workout tracker built for speed: one tap per set, zero clutter. Everything below works on
          your own account — your data never mixes with anyone else&apos;s.
        </p>

        {/* ── generated: one section per screen ── */}
        <section aria-label="Screens" className="flex flex-none flex-col gap-3">
          {sections.filter(sectionMatches).map((s) => (
            <div
              key={s.id}
              id={`help-section-${CSS.escape(s.id)}`}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => toggle(s.id)}
                aria-expanded={expanded(s.id)}
                className="flex h-8 w-full items-center gap-1 border-b border-border px-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground hover:bg-accent/40"
              >
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <span
                  aria-hidden
                  className={`text-[10px] transition-transform ${expanded(s.id) ? "rotate-0" : "-rotate-90"}`}
                >
                  ▾
                </span>
              </button>
              {expanded(s.id) ? (
                <div className="flex flex-col">
                  <PurposeRow text={s.purpose} emptyText={s.emptyPurpose} />
                  {s.steps.filter(stepMatches).map((step) => (
                    <StepRow key={`${step.id}-${step.label}`} step={step} screenId={s.id} />
                  ))}
                  {s.children.filter(childMatches).map((c) => (
                    <div key={c.id} className="flex flex-col border-t border-border">
                      <PurposeRow text={`${c.title} — ${c.purpose}`} emptyText={c.emptyPurpose} child />
                      {c.steps.filter(stepMatches).map((step) => (
                        <StepRow key={`${step.id}-${step.label}`} step={step} screenId={c.id} />
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </section>

        {/* ── static reference sections (clearly separated) ── */}
        <div className="flex-none border-t border-border pt-4" />

        <section aria-label="Keyboard shortcuts" className="flex flex-none flex-col gap-2">
          <h2 className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Keyboard className="h-4 w-4" aria-hidden />
            Keyboard shortcuts (desktop)
          </h2>
          <dl className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
            {generatedShortcuts.filter(stepMatches).map((s) => (
              <div key={`sc-${s.id}`} className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0">
                <Kbd>{s.shortcut ?? ""}</Kbd>
                <dd className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">{s.label}</span> — {s.help}
                </dd>
              </div>
            ))}
            {GLOBAL_SHORTCUTS.filter((g) => matches(g.keys, g.desc)).map((g) => (
              <div key={g.keys} className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0">
                <Kbd>{g.keys}</Kbd>
                <dd className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">{g.desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        {STATIC_SECTIONS.filter((s) => staticMatch(s.title, s.items)).map((section) => (
          <section key={section.title} aria-label={section.title} className="flex flex-none flex-col gap-2">
            <h2 className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <section.icon className="h-4 w-4" aria-hidden />
              {section.title}
            </h2>
            <dl className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
              {section.items.filter((i) => matches(i.term, i.desc)).map((item) => (
                <div key={item.term} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4 border-b border-border/50 last:border-b-0">
                  <dt className="min-w-0 flex-none text-sm font-semibold sm:w-44 sm:shrink-0">{item.term}</dt>
                  <dd className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">{item.desc}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <p className="flex-none px-1 pb-2 text-xs text-muted-foreground">
          Version 1.0.0 · For deployment, environment and database-switching documentation see the project README.
        </p>
      </ScrollBody>
    </Screen>
  );
}
