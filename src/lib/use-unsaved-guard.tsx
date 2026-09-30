"use client";

// ─────────────────────────────────────────────────────────────────────────────
// useUnsavedGuard — §4.8 leave guard, created once in src/lib (no prior
// implementation existed; grep-verified before creation).
//
// TWO layers:
//   1. beforeunload — the browser tab close/reload guard (plain listener).
//   2. in-app guard — `requestLeave(leave)` shows the destructive-confirm
//      AlertDialog ("Discard changes?" · Cancel/Discard) when dirty and runs
//      `leave` on confirm; clean state runs `leave` immediately.
//
// Usage:
//   const guard = useUnsavedGuard(dirty);
//   …
//   <Button onClick={() => guard.requestLeave(() => navigate("/builder"))}>Cancel</Button>
//   {guard.dialog}
//
// Browser back is NOT intercepted (hash navigation remounts screens by design);
// screens that need it pass their own Cancel affordance through requestLeave.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { tourAttrs } from "@/lib/tour/attrs";

export type UnsavedGuard = {
  /** Run `leave` now, or through the "Discard changes?" confirm when dirty. */
  requestLeave: (leave: () => void) => void;
  /** The confirm dialog element — render it once inside the screen. */
  dialog: React.ReactNode;
};

export function useUnsavedGuard(dirty: boolean): UnsavedGuard {
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  // Layer 1: tab close/reload guard while dirty.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy contract: a non-empty returnValue triggers the browser prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const requestLeave = useCallback(
    (leave: () => void) => {
      if (!dirty) {
        leave();
        return;
      }
      pending.current = leave;
      setOpen(true);
    },
    [dirty],
  );

  const dialog = (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Your edits to this workout haven&apos;t been saved yet.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            {...tourAttrs({ id: "unsavedGuard.cancel", label: "Keep editing", help: "Close this prompt and keep your unsaved edits.", order: 100, hint: true })}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            {...tourAttrs({ id: "unsavedGuard.discard", label: "Discard", help: "Throw the unsaved edits away and leave.", order: 110, hint: true })}
            onClick={() => {
              const leave = pending.current;
              pending.current = null;
              setOpen(false);
              leave?.();
            }}
          >
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestLeave, dialog };
}
