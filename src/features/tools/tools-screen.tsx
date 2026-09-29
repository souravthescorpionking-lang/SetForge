"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ToolsScreen — #/tools (Part 3 p3-8 rebuild). Primitives-only:
//
//   TopBar (56)  : "Tools" + ⋮ (Collapse all)
//   ScrollBody   : four 56px [data-row] tool rows (icon + name + short
//                  description ellipsis + chevron). Tap → INLINE expansion
//                  below the row (never a dialog); only one open at a time —
//                  the open tool is the ?tool= hash param (deep-linkable):
//                  one-rm | plates | sets | timer.
//
// The four calculators/timer are ported into inline panels:
//   one-rm-tool.tsx · plate-tool.tsx · set-tool.tsx · interval-tool.tsx
// ─────────────────────────────────────────────────────────────────────────────

import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronsDownUp, Layers, Disc3, Timer, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { replaceHash, useHashRoute } from "@/features/shell/router";
import { ToolRow } from "./tool-bits";
import { OneRmTool } from "./one-rm-tool";
import { PlateTool } from "./plate-tool";
import { SetTool } from "./set-tool";
import { IntervalTool } from "./interval-tool";

type ToolKey = "one-rm" | "plates" | "sets" | "timer";

const TOOLS: Array<{ key: ToolKey; name: string; description: string; icon: ReactNode }> = [
  { key: "one-rm", name: "One-Rep Max", description: "Weight × reps → e1RM", icon: <TrendingUp aria-hidden /> },
  { key: "plates", name: "Plate calculator", description: "Target → per-side breakdown", icon: <Disc3 aria-hidden /> },
  { key: "sets", name: "Set calculator", description: "Base weight → % table", icon: <Layers aria-hidden /> },
  { key: "timer", name: "Interval timer", description: "Work / rest × rounds", icon: <Timer aria-hidden /> },
];

export default function ToolsScreen() {
  const route = useHashRoute();
  const toolParam = route.name === "tools" ? route.query.get("tool") : null;
  const open: ToolKey | null =
    toolParam === "one-rm" || toolParam === "plates" || toolParam === "sets" || toolParam === "timer"
      ? toolParam
      : null;

  const toggle = (key: ToolKey) => {
    replaceHash(open === key ? "#/tools" : `#/tools?tool=${key}`);
  };

  return (
    <Screen
      topBar={
        <TopBar
          title="Tools"
          actions={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" className="h-11 w-11 px-0" aria-label="Tools options" tour={{ id: "tools.menu", label: "Collapse all", help: "Close every open tool panel.", order: 10 }}>
                    <ChevronsDownUp className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => replaceHash("#/tools")}>
                    <ChevronsDownUp className="h-4 w-4" aria-hidden /> Collapse all
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TopBarHelp />
            </>
          }
        />
      }
    >
      <ScrollBody>
        {TOOLS.map((t) => (
          <div key={t.key} className="flex flex-col">
            <ToolRow
              icon={t.icon}
              name={t.name}
              description={t.description}
              open={open === t.key}
              onClick={() => toggle(t.key)}
            />
            {open === t.key ? (
              t.key === "one-rm" ? (
                <OneRmTool />
              ) : t.key === "plates" ? (
                <PlateTool />
              ) : t.key === "sets" ? (
                <SetTool />
              ) : (
                <IntervalTool />
              )
            ) : null}
          </div>
        ))}
        <p className="flex-none px-1 text-xs text-muted-foreground" aria-hidden>
          Calculators run entirely on your device — no connection needed.
        </p>
      </ScrollBody>
    </Screen>
  );
}
