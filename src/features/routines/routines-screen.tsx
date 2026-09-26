"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RoutinesScreen — the Part 3 rebuild of #/routines (the routine LIST).
//
//   TopBar (56)  : "Routines" · `+` (creates inline: a new 72px row appears at
//                  the top in rename-input state — Enter saves, Esc cancels)
//   ScrollBody   : RoutineRow×N — 72px data-rows:
//                  [drag handle 24px, muted] name (ellipsis) / meta line
//                  `3 days · 12 exercises · used 2d ago` (12px muted) | ⋮ 44px
//                  (Rename inline · Copy · Log · Move up/down · Delete confirm)
//                  Desktop (≥lg): 2-column grid of the same rows.
//                  Empty: a 200px block ("Create your first routine" + button).
//
// Drag handles are rendered but DnD is NOT wired in this build — reordering
// works via the ⋮ Move up/down items (functional parity; documented deviation).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Layers,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { routinesApi } from "@/lib/client/api";
import { qk, useExercises } from "@/lib/client/query";
import type { RoutineDTO } from "@/lib/types";
import {
  DragGlyph,
  InlineInput,
  routineMetaLine,
  useRoutineReorder,
  useRoutineRun,
} from "./screen-helpers";

export default function RoutinesScreen() {
  const navigate = useApp((s) => s.navigate);
  const { run } = useRoutineRun();
  const reorder = useRoutineReorder();

  // ---------- data ----------
  const { data, isLoading } = useQuery({ queryKey: qk.routines, queryFn: () => routinesApi.list() });
  const routines = useMemo(
    () => [...(data?.routines ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [data?.routines],
  );

  // lastPerformed per exercise → the "used Xd ago" meta
  const { data: exercises = [] } = useExercises();
  const lastPerformedById = useMemo(() => {
    const m = new Map<string, string | null | undefined>();
    for (const ex of exercises) m.set(ex.id, ex.lastPerformed);
    return m;
  }, [exercises]);

  // ---------- ui state ----------
  const [creating, setCreating] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoutineDTO | null>(null);

  // ---------- mutations ----------
  const createRoutine = async (name: string) => {
    if (!name) return;
    const ok = await run(() => routinesApi.create({ name }), {
      path: "/api/routines",
      method: "POST",
      body: { name },
      label: `Created ${name}`,
    });
    if (ok) toast.success(`Routine “${name}” created`);
  };

  const renameRoutine = async (routine: RoutineDTO, name: string) => {
    if (!name || name === routine.name) return;
    const ok = await run(() => routinesApi.update(routine.id, { name }), {
      path: `/api/routines/${routine.id}`,
      method: "PATCH",
      body: { name },
      label: "Routine renamed",
    });
    if (ok) toast.success("Routine renamed");
  };

  const copyRoutine = async (routine: RoutineDTO) => {
    const ok = await run(() => routinesApi.copy(routine.id), {
      path: `/api/routines/${routine.id}/copy`,
      method: "POST",
      label: "Duplicate routine",
    });
    if (ok) toast.success(`Duplicated “${routine.name}”`);
  };

  const deleteRoutine = async (routine: RoutineDTO) => {
    const ok = await run(() => routinesApi.remove(routine.id), {
      path: `/api/routines/${routine.id}`,
      method: "DELETE",
      label: `Deleted ${routine.name}`,
    });
    if (ok) toast.success(`Deleted “${routine.name}”`);
  };

  // ---------- rows ----------
  const renderRow = (routine: RoutineDTO, index: number) => {
    const renaming = renameId === routine.id;
    return (
      <div
        key={routine.id}
        data-row
        role="button"
        tabIndex={0}
        aria-label={`${routine.name} — ${routineMetaLine(routine, lastPerformedById)}`}
        className="flex h-18 cursor-pointer select-none items-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border bg-card pl-2 pr-1 transition-colors hover:bg-accent/40"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input, a, [role=menuitem]")) return;
          navigate(`/routines/${routine.id}`);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/routines/${routine.id}`);
          }
        }}
      >
        <DragGlyph />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          {renaming ? (
            <InlineInput
              value={routine.name}
              ariaLabel={`Rename ${routine.name}`}
              onCommit={(name) => {
                setRenameId(null);
                void renameRoutine(routine, name);
              }}
              onCancel={() => setRenameId(null)}
              className="h-11 min-w-0 flex-1"
            />
          ) : (
            <span className="truncate text-sm font-semibold leading-none">{routine.name}</span>
          )}
          <span className="truncate text-xs leading-none text-muted-foreground">
            {routineMetaLine(routine, lastPerformedById)}
          </span>
        </div>
        <span className="flex flex-none" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-11 p-0"
                aria-label={`Actions for ${routine.name}`}
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setRenameId(routine.id)}>
                <Pencil className="h-4 w-4" aria-hidden /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void copyRoutine(routine)}>
                <Copy className="h-4 w-4" aria-hidden /> Copy
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/routines/${routine.id}`)}>
                <Zap className="h-4 w-4" aria-hidden /> Log
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={index === 0}
                onClick={() => void reorder(routines, index, -1)}
              >
                <ArrowUp className="h-4 w-4" aria-hidden /> Move up
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={index === routines.length - 1}
                onClick={() => void reorder(routines, index, 1)}
              >
                <ArrowDown className="h-4 w-4" aria-hidden /> Move down
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteTarget(routine)}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
    );
  };

  const empty = !isLoading && routines.length === 0;

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          title="Routines"
          actions={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 flex-none"
              aria-label="New routine"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-5 w-5" aria-hidden />
            </Button>
          }
        />
      }
    >
      <ScrollBody contentClassName="lg:grid lg:grid-cols-2 lg:gap-3">
        {creating ? (
          <div
            data-row
            className="flex h-18 items-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border border-primary/40 bg-primary/5 pl-2 pr-1"
          >
            <span className="flex h-6 w-6 flex-none items-center justify-center text-muted-foreground/60">
              <Layers className="h-4 w-4" aria-hidden />
            </span>
            <InlineInput
              value=""
              placeholder="New routine name…"
              ariaLabel="New routine name"
              onCommit={(name) => {
                setCreating(false);
                void createRoutine(name);
              }}
              onCancel={() => setCreating(false)}
              className="h-11 min-w-0 flex-1"
            />
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex flex-col gap-3 lg:col-span-2" aria-busy="true" aria-label="Loading routines">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-18 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : empty ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border lg:col-span-2">
            <Layers className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">Create your first routine</p>
            <Button type="button" className="gap-1.5" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden /> New routine
            </Button>
          </div>
        ) : (
          routines.map((routine, index) => renderRow(routine, index))
        )}
      </ScrollBody>

      {/* confirm-destructive: routine delete (the only allowed dialog here) */}
      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete routine?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.name}” and its {deleteTarget?.days.length ?? 0} day
              {(deleteTarget?.days.length ?? 0) === 1 ? "" : "s"} will be removed. Logged workouts stay
              untouched. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                const target = deleteTarget;
                setDeleteTarget(null);
                if (target) void deleteRoutine(target);
              }}
            >
              Delete routine
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
