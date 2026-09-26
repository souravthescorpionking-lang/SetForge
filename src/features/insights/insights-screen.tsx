"use client";

// ─────────────────────────────────────────────────────────────────────────────
// InsightsScreen — #/insights (Part 3 p3-7 rebuild). Primitives-only:
//
//   TopBar (56)  : "Insights" + ⋮ (stats period selector — 7d / 30d / 1y / All,
//                  updates ?period=; deep-linkable)
//   SubBar (48)  : Records | Stats | Goals — 3 equal tabs, deep-linkable via
//                  ?tab= (hash query, replaceHash)
//   ScrollBody   : RECORDS — 40px segmented control (Estimated | Actual →
//                            ?scope=) + 40px record table rows
//                  STATS   — 40px metric | value | trend table rows
//                  GOALS   — 40px goal rows + 96px inline expansion editor
//
// Query contract: #/insights?tab=records|stats|goals&scope=estimated|actual
// (records + estimated default). No cards anywhere — tables only per spec.
// ─────────────────────────────────────────────────────────────────────────────

import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import { replaceHash, useHashRoute } from "@/features/shell/router";
import { cn } from "@/lib/utils";
import { RecordsTab, type RecordsScope } from "./records-tab";
import { StatsTab, STATS_PERIODS, type StatsPeriod } from "./stats-tab";
import { GoalsTab } from "./goals-tab";

const TABS = ["records", "stats", "goals"] as const;
type TabKey = (typeof TABS)[number];
const TAB_LABELS: Record<TabKey, string> = { records: "Records", stats: "Stats", goals: "Goals" };

const PERIOD_VALUES = STATS_PERIODS.map((p) => p.value) as readonly StatsPeriod[];

export default function InsightsScreen() {
  const route = useHashRoute();

  // ---------- URL-derived state (?tab= · ?scope= · ?period= — deep-linkable) ----------
  const tabParam = route.name === "insights" ? route.query.get("tab") : null;
  const tab: TabKey = tabParam === "stats" || tabParam === "goals" ? tabParam : "records";
  const scopeParam = route.name === "insights" ? route.query.get("scope") : null;
  const scope: RecordsScope = scopeParam === "actual" ? "actual" : "estimated";
  const periodParam = route.name === "insights" ? route.query.get("period") : null;
  const period: StatsPeriod = PERIOD_VALUES.includes(periodParam as StatsPeriod)
    ? (periodParam as StatsPeriod)
    : "month";

  // ---------- URL writers (replaceHash: deep-linkable, no history pollution) ----------
  const writeQuery = (next: { tab?: TabKey; scope?: RecordsScope; period?: StatsPeriod }) => {
    const t = next.tab ?? tab;
    const s = next.scope ?? scope;
    const p = next.period ?? period;
    if (t === tab && s === scope && p === period) return;
    replaceHash(`#/insights?tab=${t}&scope=${s}&period=${p}`);
  };

  const periodLabel = STATS_PERIODS.find((p) => p.value === period)?.label ?? "30 days";

  return (
    <Screen
      topBar={
        <TopBar
          title={
            <span className="truncate">
              Insights
              <span className="ml-2 text-xs font-medium text-muted-foreground">· {periodLabel}</span>
            </span>
          }
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" className="h-11 w-11 px-0" aria-label="Insights options">
                  <MoreVertical className="h-5 w-5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Stats period</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {STATS_PERIODS.map((p) => (
                  <DropdownMenuCheckboxItem
                    key={p.value}
                    checked={period === p.value}
                    onCheckedChange={() => writeQuery({ period: p.value })}
                  >
                    {p.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      }
      subBar={
        <div className="grid h-12 w-full grid-cols-3" role="tablist" aria-label="Insights tabs">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => writeQuery({ tab: t })}
              className={cn(
                "flex h-12 min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap text-sm font-semibold transition-colors",
                tab === t ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="leading-none">{TAB_LABELS[t]}</span>
              <span
                className={cn("h-0.5 w-8 rounded-full", tab === t ? "bg-primary" : "bg-transparent")}
                aria-hidden
              />
            </button>
          ))}
        </div>
      }
    >
      <ScrollBody>
        {tab === "records" ? (
          <RecordsTab scope={scope} onScopeChange={(s) => writeQuery({ scope: s })} />
        ) : tab === "stats" ? (
          <StatsTab period={period} />
        ) : (
          <GoalsTab />
        )}
      </ScrollBody>
    </Screen>
  );
}
