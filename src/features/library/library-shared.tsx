"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Library shared helpers (Part 6 §4.1/§4.2) — used by library-screen,
// library-entry-screen and the exercise-overview About tab.
//
//   useDebounced     — 250ms search debounce
//   useMediaQuery    — lg breakpoint for the 180/240px MediaBlock height
//   ChipScroller     — the ONE allowed horizontal scroller (data-chip-scroller +
//                      no-scrollbar + clipped-chip visibility sync, pattern from
//                      the p3-4 picker / p3-6 calendar FilterChipRow)
//   useLibraryMutations — adopt / adopt-favourite / toggle-favourite / undo /
//                      adopt-many, with query invalidation + toasts
// ─────────────────────────────────────────────────────────────────────────────

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { exercisesApi, libraryApi } from "@/lib/client/api";
import { hapticSuccess, hapticTap } from "@/lib/client/haptics";
import type { LibraryEntryDTO } from "@/lib/types";

export function errMessage(e: unknown, fallback = "Something went wrong"): string {
  if (e instanceof Error && e.message) return e.message;
  const resp = e as { error?: { message?: string } } | null;
  if (resp && typeof resp === "object" && resp.error?.message) return resp.error.message;
  return fallback;
}

/** Debounce a fast-changing value (search input → query param). */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** Reactive CSS media query (SSR-safe: false until mounted). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

// ─────────────────────────────────────────────────────────────────────────────
// ChipScroller — 40px horizontal chip strip. Chips clipped by the scroller or
// the viewport get visibility:hidden (their raw rects then never trip the
// right-edge overflow audit while the strip stays a real scroll container).
// ─────────────────────────────────────────────────────────────────────────────

export function ChipScroller({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const count = Children.count(children);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => {
      const vw = document.documentElement.clientWidth;
      const clip = scroller.getBoundingClientRect();
      for (const child of Array.from(scroller.children)) {
        const r = child.getBoundingClientRect();
        const intersectsClip = r.right > clip.left - 1 && r.left < clip.right + 1;
        const insideViewport = r.right <= vw + 1;
        (child as HTMLElement).style.visibility =
          intersectsClip && insideViewport ? "" : "hidden";
      }
    };
    update();
    const raf = requestAnimationFrame(() => requestAnimationFrame(update));
    const t1 = window.setTimeout(update, 300);
    const t2 = window.setTimeout(update, 900);
    const onScroll = () => update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const onResize = () => update();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => update());
    ro.observe(scroller);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [count]);

  return (
    <div
      ref={scrollerRef}
      data-chip-scroller
      data-row
      aria-label={label}
      className={cn(
        "no-scrollbar flex h-10 w-full min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Toggle-chip styling (picker precedent). */
export function chipClass(active: boolean): string {
  return cn(
    "flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
    active
      ? "border-primary/60 bg-primary/10 text-primary"
      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Adoption mutations (shared semantics for list rows, detail ActionRow and the
// entry ⋮ menu). Invalidation covers ["library"] (list + entry queries) and the
// owned-exercise queries (["exercises"] / ["exercise", id]) an adopt creates.
// ─────────────────────────────────────────────────────────────────────────────

export function useLibraryMutations() {
  const qc = useQueryClient();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["library"] });
    qc.invalidateQueries({ queryKey: ["exercises"] });
    qc.invalidateQueries({ queryKey: ["exercise"] });
  };

  /** Undo for the "Added to my exercises" toast — removes the adopted exercise. */
  const undoAdopt = async (exerciseId: string) => {
    try {
      await exercisesApi.remove(exerciseId);
      hapticTap();
      refresh();
    } catch (e) {
      toast.error(errMessage(e, "Could not undo — remove it from Exercises"));
    }
  };

  /** Adopt a catalog entry (favourite=true also stars it). Toasts + Undo. */
  const adopt = async (key: string, favourite?: boolean): Promise<LibraryEntryDTO["exerciseId"] | null> => {
    try {
      const res = await libraryApi.adopt(key, favourite);
      hapticSuccess();
      refresh();
      if (favourite) {
        toast.success("Favourited · added to my exercises");
      } else {
        toast.success("Added to my exercises", {
          action: { label: "Undo", onClick: () => void undoAdopt(res.exerciseId) },
        });
      }
      return res.exerciseId;
    } catch (e) {
      toast.error(errMessage(e, "Could not add to my exercises"));
      return null;
    }
  };

  /** Adopted entry star: toggles the user exercise's favourite (optimistic). */
  const toggleFavourite = async (entry: Pick<LibraryEntryDTO, "key" | "exerciseId" | "isFavorite">) => {
    if (!entry.exerciseId) return;
    const next = !entry.isFavorite;
    qc.setQueriesData({ queryKey: ["library"] }, (old: unknown) => {
      if (Array.isArray(old)) {
        return old.map((x) =>
          x && typeof x === "object" && (x as LibraryEntryDTO).key === entry.key
            ? { ...(x as LibraryEntryDTO), isFavorite: next }
            : x,
        );
      }
      if (old && typeof old === "object" && (old as LibraryEntryDTO).key === entry.key) {
        return { ...(old as LibraryEntryDTO), isFavorite: next };
      }
      return old;
    });
    try {
      await exercisesApi.update(entry.exerciseId, { isFavorite: next });
      hapticTap();
      refresh();
    } catch (e) {
      refresh(); // roll the optimistic flip back
      toast.error(errMessage(e, "Could not update favourite"));
    }
  };

  /** Bulk adopt (⋮ "Add all favourites…"). Returns the adopted count or null. */
  const adoptMany = async (keys: string[]): Promise<number | null> => {
    if (keys.length === 0) {
      toast.info("No favourites to add yet — star rows to favourite them");
      return null;
    }
    try {
      const res = await libraryApi.adoptMany(keys);
      hapticSuccess();
      refresh();
      return res.adopted;
    } catch (e) {
      toast.error(errMessage(e, "Could not add favourites"));
      return null;
    }
  };

  return { refresh, adopt, undoAdopt, toggleFavourite, adoptMany };
}
