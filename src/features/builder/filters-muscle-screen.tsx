"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FiltersMuscleScreen — §4.4 shared muscle filter (#/filters/muscle?return=…).
//
//   TopBar (56)   : BackButton → the caller (draft discarded) · "Muscles"
//   List rows 48  : the 16 §4.4 muscle values, multi-select
//   BottomBar (56): "Clear" · "Apply"
//
// STATE ROUND-TRIPS IN THE URL: the current selection is read from the RETURN
// route's hash (its ?muscles= csv), Apply navigates back with the edited csv
// (withQueryParam). One implementation, three entry points (Builder-add,
// Library, Replace).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Screen, TopBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { tourAttrs } from "@/lib/tour/attrs";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { BUILDER_MUSCLE_FILTERS } from "@/lib/constants";
import { initialHashQuery, withQueryParam } from "./add-flow-url";
import { CheckboxMark } from "./add-flow-shared";

const ROW_CLS =
  "flex h-12 w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 text-left text-sm transition-colors hover:bg-accent/50";

export default function FiltersMuscleScreen() {
  const navigate = useApp((s) => s.navigate);

  // ?return= — the route to write the selection back onto.
  const returnHash = useMemo(() => {
    const raw = initialHashQuery().get("return") ?? "";
    if (raw.startsWith("#")) return raw;
    return raw ? `#${raw}` : "#/builder";
  }, []);

  // Seed from the return route's current ?muscles= state.
  const seeded = useMemo(() => {
    const queryPart = returnHash.split("?")[1] ?? "";
    const raw = new URLSearchParams(queryPart).get("muscles") ?? "";
    const present = new Set(raw.split(",").map((v) => v.trim()).filter(Boolean));
    return BUILDER_MUSCLE_FILTERS.filter((row) => present.has(row.key)).map((row) => row.key);
  }, [returnHash]);
  const [muscles, setMuscles] = useState<string[]>(seeded);

  const toggle = (key: string) =>
    setMuscles((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const apply = () => navigate(withQueryParam(returnHash, "muscles", muscles));

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash={returnHash} label="Back" />}
          title={
            <span {...tourAttrs({ id: "filtersMuscle.title", label: "Muscles", help: "Filter exercises by target muscles.", order: 10 })}>
              Muscles
            </span>
          }
          actions={<TopBarHelp />}
        />
      }
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            variant="ghost"
            className="h-11 min-w-0 flex-1 gap-2 text-base font-bold"
            aria-label="Clear muscle filters"
            tour={{ id: "filtersMuscle.clear", label: "Clear", help: "Empty the muscle selection.", order: 100 }}
            onClick={() => setMuscles([])}
          >
            Clear
          </Button>
          <Button
            type="button"
            className="h-11 min-w-0 flex-1 gap-2 text-base font-bold"
            aria-label="Apply muscle filters"
            tour={{ id: "filtersMuscle.apply", label: "Apply", help: "Save the selection and return.", order: 110 }}
            onClick={apply}
          >
            Apply
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody>
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="divide-y divide-border/60">
            {BUILDER_MUSCLE_FILTERS.map((row) => {
              const checked = muscles.includes(row.key);
              return (
                <button
                  key={row.key}
                  type="button"
                  data-row
                  role="checkbox"
                  aria-checked={checked}
                  {...tourAttrs({ id: "filtersMuscle.row", label: "Muscle row", help: "Toggle one or more muscles.", order: 20 })}
                  onClick={() => toggle(row.key)}
                  className={ROW_CLS}
                >
                  <CheckboxMark checked={checked} />
                  <span className={cn("min-w-0 flex-1 truncate", checked && "font-medium")}>{row.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <p className="px-1 text-xs leading-snug text-muted-foreground">
          {muscles.length > 0 ? `${muscles.length} selected` : "No muscles selected — every muscle shows."}
        </p>
      </ScrollBody>
    </Screen>
  );
}
