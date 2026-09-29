"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TopBarHelp — the per-screen tour/help entry point (Part 7 §6).
//
// Rendered as the LAST action of every screen's TopBar:
//   <TopBar title="Home" actions={<TopBarHelp />} />
//
// A shadcn Popover with two 48px rows:
//   ▸ Play      "Tour this screen"   → requestTourStart(currentScreenId, force)
//   ▸ BookOpen  "Help for this screen" → #/help?s={currentScreenId}
//
// The `sf:tour-help` custom event (dispatched by the plain-`?` keyboard
// shortcut in app-shell) opens the popover programmatically. The button
// itself is a shared declaration (id tourhelp.button — also the first
// welcome-tour step); the spread form keeps the declaration statically
// analysable for codegen (eslint setforge-tour/static).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BookOpen, CircleHelp, Play } from "lucide-react";
import { tourAttrs } from "@/lib/tour/attrs";
import type { TourDecl } from "@/lib/tour/types";
import { replaceHash, useHashRoute } from "@/features/shell/router";
import { requestTourStart } from "@/features/tour";

export const TOURHELP_DECL: TourDecl = {
  id: "tourhelp.button",
  label: "Help button",
  help: "Tour this screen, open help, or replay the welcome tour.",
  order: 10,
  shortcut: "?",
};

export function TopBarHelp() {
  const [open, setOpen] = useState(false);
  const route = useHashRoute();

  // Plain "?" (app-shell keyboard shortcut) opens this popover.
  useEffect(() => {
    const onTourHelp = () => setOpen(true);
    window.addEventListener("sf:tour-help", onTourHelp);
    return () => window.removeEventListener("sf:tour-help", onTourHelp);
  }, []);

  const tourThisScreen = () => {
    setOpen(false);
    requestTourStart(route.name, { force: true });
  };

  const openHelp = () => {
    setOpen(false);
    replaceHash(`#/help?s=${route.name}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-11 flex-none px-0"
          aria-label="Help and tours"
          {...tourAttrs(TOURHELP_DECL)}
        >
          <CircleHelp className="h-5 w-5" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-0">
        <div className="flex flex-col">
          <button
            type="button"
            onClick={tourThisScreen}
            className="flex h-12 items-center gap-3 px-4 text-left text-sm font-medium hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
          >
            <Play className="h-4 w-4 flex-none text-primary" aria-hidden />
            <span className="flex-1">Tour this screen</span>
          </button>
          <button
            type="button"
            onClick={openHelp}
            className="flex h-12 items-center gap-3 border-t border-border px-4 text-left text-sm font-medium hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
          >
            <BookOpen className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
            <span className="flex-1">Help for this screen</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
