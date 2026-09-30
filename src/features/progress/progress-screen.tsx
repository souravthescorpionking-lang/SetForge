"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProgressScreen — #/progress (Part 10 §8.1). The weigh-in hub.
//
//   TopBar (56)   [◀] "Progress" | [+ Log] (→ #/progress/log)
//   SubBar (48)   Weigh-in | Photos | History (deep-linkable via ?tab=)
//   ScrollBody    WEIGH-IN — weight chart (value + 7-day avg line) + latest row
//                 PHOTOS   — 3-column grid by pose (Front/Back/Left/Right)
//                 HISTORY  — sticky month headers + 40px rows + ⋮ Delete
//
// Weight data = the measurements system (useBodyWeight) — the repo's weigh-in
// entity; there is no parallel weight table (L2-style single source).
// ─────────────────────────────────────────────────────────────────────────────

import { Screen, TopBar, SubBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { replaceHash, useHashRoute } from "@/features/shell/router";
import { cn } from "@/lib/utils";
import { WeightChartTab } from "./weight-chart-tab";
import { PhotosTab } from "./photos-tab";
import { WeighInHistoryTab } from "./weigh-in-history-tab";

const TABS = ["weigh-in", "photos", "history"] as const;
type TabKey = (typeof TABS)[number];
const TAB_LABELS: Record<TabKey, string> = {
  "weigh-in": "Weigh-in",
  photos: "Photos",
  history: "History",
};

export default function ProgressScreen() {
  const navigate = useApp((s) => s.navigate);
  const route = useHashRoute();

  const tabParam = route.name === "progress" ? route.query.get("tab") : null;
  const tab: TabKey =
    tabParam === "photos" || tabParam === "history" ? tabParam : "weigh-in";

  const switchTab = (t: TabKey) => {
    if (t === tab) return;
    replaceHash(`#/progress?tab=${t}`);
  };

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/more" label="Back" />}
          title="Progress"
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                className="h-11 gap-1 px-3"
                tour={{
                  id: "progress.log",
                  label: "Log weigh-in",
                  help: "Log a weigh-in for any past day, with optional progress photos.",
                  order: 10,
                }}
                onClick={() => navigate("/progress/log")}
              >
                <Plus className="h-5 w-5" aria-hidden />
                Log
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        <SubBar>
          <div className="grid h-12 w-full grid-cols-3" role="tablist" aria-label="Progress tabs">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => switchTab(t)}
                {...tourAttrs({
                  id:
                    t === "weigh-in"
                      ? "progress.tabWeighIn"
                      : t === "photos"
                        ? "progress.tabPhotos"
                        : "progress.tabHistory",
                  // Static per-branch values only — the codegen reads literals.
                  label:
                    t === "weigh-in"
                      ? "Weigh-in tab"
                      : t === "photos"
                        ? "Photos tab"
                        : "History tab",
                  help:
                    t === "weigh-in"
                      ? "Your weight chart with the 7-day average line."
                      : t === "photos"
                        ? "Progress photos grouped by pose."
                        : "Every weigh-in, newest first.",
                  order: 20,
                })}
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
        </SubBar>
      }
    >
      <ScrollBody>
        {tab === "weigh-in" ? (
          <WeightChartTab />
        ) : tab === "photos" ? (
          <PhotosTab />
        ) : (
          <WeighInHistoryTab />
        )}
      </ScrollBody>
    </Screen>
  );
}
