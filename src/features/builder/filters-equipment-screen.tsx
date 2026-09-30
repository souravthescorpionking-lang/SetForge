"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FiltersEquipmentScreen — §4.4 shared equipment filter
// (#/filters/equipment?return=…).
//
//   TopBar (56)   : BackButton → the caller (draft discarded) · "Equipment"
//   SubBar (48)   : search "Search equipment"
//   List rows 48  : multi-select from GET /api/equipment (canonical seed ∪
//                   the distinct values in the user's catalog); the first row
//                   "All equipment" toggles every row
//   BottomBar (56): "Clear" · "Apply"
//
// STATE ROUND-TRIPS IN THE URL: the current selection is read from the RETURN
// route's hash (its ?equipment= csv), Apply navigates back with the edited csv
// (withQueryParam). One implementation, three entry points (Builder-add,
// Library, Replace).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Screen, TopBar, SubBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Minus } from "lucide-react";
import { tourAttrs } from "@/lib/tour/attrs";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { useEquipment } from "@/lib/client/query";
import { initialHashQuery, withQueryParam } from "./add-flow-url";
import { CheckboxMark } from "./add-flow-shared";

const ROW_CLS =
  "flex h-12 w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 text-left text-sm transition-colors hover:bg-accent/50";

export default function FiltersEquipmentScreen() {
  const navigate = useApp((s) => s.navigate);

  // ?return= — the route to write the selection back onto.
  const returnHash = useMemo(() => {
    const raw = initialHashQuery().get("return") ?? "";
    if (raw.startsWith("#")) return raw;
    return raw ? `#${raw}` : "#/builder";
  }, []);

  // Seed from the return route's current ?equipment= state.
  const seeded = useMemo(() => {
    const queryPart = returnHash.split("?")[1] ?? "";
    const raw = new URLSearchParams(queryPart).get("equipment") ?? "";
    return raw.split(",").map((v) => v.trim()).filter(Boolean);
  }, [returnHash]);
  const [equipment, setEquipment] = useState<string[]>(seeded);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useEquipment();
  const rows = data?.equipment ?? [];
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  }, [rows, search]);

  const toggle = (id: string) =>
    setEquipment((prev) => (prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]));

  const allSelected = rows.length > 0 && rows.every((r) => equipment.includes(r.id));
  const someSelected = equipment.length > 0 && !allSelected;
  const toggleAll = () => {
    // "All equipment" ON selects every row; OFF (or partial → ON) resets to all.
    setEquipment(allSelected ? [] : rows.map((r) => r.id));
  };

  const apply = () => navigate(withQueryParam(returnHash, "equipment", equipment));

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash={returnHash} label="Back" />}
          title={
            <span {...tourAttrs({ id: "filtersEquipment.title", label: "Equipment", help: "Filter exercises by the gear they need.", order: 10 })}>
              Equipment
            </span>
          }
          actions={<TopBarHelp />}
        />
      }
      subBar={
        <SubBar>
          <Search className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search equipment"
            aria-label="Search equipment"
            {...tourAttrs({ id: "filtersEquipment.search", label: "Search", help: "Narrow the equipment list by name.", order: 30 })}
            className="h-10 min-w-0 flex-1"
          />
        </SubBar>
      }
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            variant="ghost"
            className="h-11 min-w-0 flex-1 gap-2 text-base font-bold"
            aria-label="Clear equipment filters"
            tour={{ id: "filtersEquipment.clear", label: "Clear", help: "Empty the equipment selection.", order: 100 }}
            onClick={() => setEquipment([])}
          >
            Clear
          </Button>
          <Button
            type="button"
            className="h-11 min-w-0 flex-1 gap-2 text-base font-bold"
            aria-label="Apply equipment filters"
            tour={{ id: "filtersEquipment.apply", label: "Apply", help: "Save the selection and return.", order: 110 }}
            onClick={apply}
          >
            Apply
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody>
        {isLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading equipment">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="divide-y divide-border/60">
              {/* "All equipment" — toggles every row (partial shows a dash). */}
              <button
                type="button"
                data-row
                role="checkbox"
                aria-checked={allSelected}
                {...tourAttrs({ id: "filtersEquipment.all", label: "All equipment", help: "Toggle every equipment row at once.", order: 20 })}
                onClick={toggleAll}
                className={ROW_CLS}
              >
                {someSelected ? (
                  <span
                    className="flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border-2 border-primary bg-primary/20"
                    aria-hidden
                  >
                    <Minus className="h-3 w-3 text-primary" strokeWidth={3} />
                  </span>
                ) : (
                  <CheckboxMark checked={allSelected} />
                )}
                <span className={cn("min-w-0 flex-1 truncate", (allSelected || someSelected) && "font-medium")}>All equipment</span>
                <span className="flex-none text-xs tabular-nums text-muted-foreground">{equipment.length}/{rows.length}</span>
              </button>
              {visible.map((row) => {
                const checked = equipment.includes(row.id);
                return (
                  <button
                    key={row.id}
                    type="button"
                    data-row
                    role="checkbox"
                    aria-checked={checked}
                    {...tourAttrs({ id: "filtersEquipment.row", label: "Equipment row", help: "Toggle one or more equipment values.", order: 40 })}
                    onClick={() => toggle(row.id)}
                    className={ROW_CLS}
                  >
                    <CheckboxMark checked={checked} />
                    <span className={cn("min-w-0 flex-1 truncate", checked && "font-medium")}>{row.label}</span>
                  </button>
                );
              })}
              {visible.length === 0 ? (
                <p className="flex h-12 w-full items-center overflow-hidden whitespace-nowrap px-3 text-sm text-muted-foreground">
                  No equipment matches &ldquo;{search.trim()}&rdquo;.
                </p>
              ) : null}
            </div>
          </div>
        )}
        <p className="px-1 text-xs leading-snug text-muted-foreground">
          {equipment.length > 0 ? `${equipment.length} selected` : "No equipment selected — every setup shows."}
        </p>
      </ScrollBody>
    </Screen>
  );
}
