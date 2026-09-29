"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuilderScreen — #/builder (Part 8 §3.8 hub).
//
//   TopBar (56)  : BackButton → #/workout · "Builder" · TopBarHelp
//   ScrollBody   : "Create" label 32
//                  · New program ›        56 → #/builder/new (wizard)
//                  · New session ›        56 → Dialog name prompt → create
//                    ROUTINE + first day + convert kind→SESSION → editor
//                  · Session from a log › 56 → #/logs (open a log → ⋮ →
//                    "Save as session" — noted in the row's tour help)
//                  "Edit" label 32
//                  · one 56px row per ROUTINE (programs), then per SESSION:
//                    4px bar · name · kind chip · chevron →
//                    #/builder/program/{id} | #/builder/session/{id}
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronRight, ClipboardList, Dumbbell, FilePlus2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { routinesApi } from "@/lib/client/api";
import { usePrograms, useInvalidate, useOnline } from "@/lib/client/query";
import type { ProgramSummaryDTO } from "@/lib/types";
import { errorMessage } from "@/features/routines/screen-helpers";

function SectionLabel({ title }: { title: string }) {
  return (
    <p
      data-row
      role="group"
      aria-label={title}
      className="flex h-8 w-full flex-none items-center overflow-hidden whitespace-nowrap px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
    >
      <span className="truncate">{title}</span>
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New-session creation — three API steps (create ROUTINE → add first day →
// convert kind to SESSION; the day-create endpoint refuses SESSION-kind
// routines, and the kind conversion validates "exactly one workout day").
// ─────────────────────────────────────────────────────────────────────────────

function useCreateSession() {
  const invalidate = useInvalidate();
  const online = useOnline();
  const navigate = useApp((s) => s.navigate);

  return async (name: string): Promise<boolean> => {
    if (!online) {
      toast.info("Creating a session needs a connection");
      return false;
    }
    try {
      const created = await routinesApi.create({ name, kind: "ROUTINE" });
      await routinesApi.addDay(created.id, "Workout", "WORKOUT");
      await routinesApi.update(created.id, { kind: "SESSION" });
      invalidate.routines();
      invalidate.programs();
      toast.success(`Session “${name}” created`);
      navigate(`/builder/session/${created.id}`);
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function BuilderScreen() {
  const navigate = useApp((s) => s.navigate);
  const { data: programs, isLoading } = usePrograms();
  const createSession = useCreateSession();

  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [creating, setCreating] = useState(false);

  const routines = useMemo(
    () => (programs ?? []).filter((p) => (p.kind ?? "ROUTINE") === "ROUTINE"),
    [programs],
  );
  const sessions = useMemo(
    () => (programs ?? []).filter((p) => p.kind === "SESSION"),
    [programs],
  );

  const submitSession = async () => {
    const name = sessionName.trim();
    if (!name) {
      toast.info("Give the session a name");
      return;
    }
    setCreating(true);
    const ok = await createSession(name.slice(0, 80));
    setCreating(false);
    if (ok) {
      setSessionDialogOpen(false);
      setSessionName("");
    }
  };

  const renderEditRow = (p: ProgramSummaryDTO, index: number) => {
    const isSession = p.kind === "SESSION";
    return (
      <button
        key={p.id}
        type="button"
        data-row
        aria-label={`Edit ${p.name}`}
        {...tourAttrs({
          id: "builder.editRow",
          label: "Edit row",
          help: "Open this program or session in its editor.",
          order: 50,
        })}
        onClick={() => navigate(`/builder/${isSession ? "session" : "program"}/${p.id}`)}
        className="flex h-14 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card pl-2 pr-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        style={{ animationDelay: `${Math.min(index, 8) * 20}ms` }}
      >
        {/* 4px kind bar — orange programs · emerald sessions */}
        <span
          aria-hidden
          className={cn("h-8 w-1 flex-none rounded-full", isSession ? "bg-emerald-500" : "bg-primary")}
        />
        {isSession ? (
          <ClipboardList className="h-5 w-5 flex-none text-emerald-600 dark:text-emerald-400" aria-hidden />
        ) : (
          <Dumbbell className="h-5 w-5 flex-none text-primary" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{p.name}</span>
        <span className="flex h-6 flex-none items-center rounded-full border border-border px-2 text-[10px] font-bold uppercase leading-none text-muted-foreground">
          {isSession ? "Session" : "Program"}
        </span>
        <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
      </button>
    );
  };

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/workout" label="Back to Workout" />}
          title={
            <span {...tourAttrs({ id: "builder.title", label: "Builder", help: "Create programs and sessions, or edit the ones you own.", order: 10 })}>
              Builder
            </span>
          }
          actions={<TopBarHelp />}
        />
      }
    >
      <ScrollBody>
        {/* ---------- Create ---------- */}
        <SectionLabel title="Create" />

        <button
          type="button"
          data-row
          {...tourAttrs({
            id: "builder.newProgram",
            label: "New program",
            help: "Open the wizard: level, days per week and a weekly template.",
            order: 10,
          })}
          onClick={() => navigate("/builder/new")}
          className="flex h-14 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <FilePlus2 className="h-5 w-5 flex-none text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">New program</span>
          <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
        </button>

        <button
          type="button"
          data-row
          {...tourAttrs({
            id: "builder.newSession",
            label: "New session",
            help: "Name it, then add exercises in the session editor.",
            order: 20,
          })}
          onClick={() => setSessionDialogOpen(true)}
          className="flex h-14 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Plus className="h-5 w-5 flex-none text-emerald-600 dark:text-emerald-400" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">New session</span>
          <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
        </button>

        <button
          type="button"
          data-row
          {...tourAttrs({
            id: "builder.fromLog",
            label: "From a log",
            help: "Open a past log, tap ⋮, then “Save as session” to reuse it.",
            order: 30,
          })}
          onClick={() => navigate("/logs")}
          className="flex h-14 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ClipboardList className="h-5 w-5 flex-none text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">Session from a log</span>
          <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:inline">pick a log → ⋮ → Save as session</span>
          <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
        </button>

        {/* ---------- Edit ---------- */}
        <SectionLabel title="Edit" />

        {isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading programs and sessions">
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : routines.length + sessions.length === 0 ? (
          <div className="flex h-[200px] flex-none flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Nothing to edit yet</p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              Create a program or session above — it will appear here for editing.
            </p>
          </div>
        ) : (
          <>
            {routines.map(renderEditRow)}
            {sessions.map(renderEditRow)}
          </>
        )}
      </ScrollBody>

      {/* ---------- New-session name prompt (Dialog — allowed; not a sheet) ---------- */}
      <Dialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New session</DialogTitle>
            <DialogDescription>
              Name this standalone session — you&apos;ll add exercises next.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={sessionName}
            maxLength={80}
            placeholder="Quick Push session"
            aria-label="New session name"
            {...tourAttrs({ id: "builder.sessionName", label: "Session name", help: "Type a name for the new session.", order: 40 })}
            onChange={(e) => setSessionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitSession();
              }
            }}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Cancel inside the new-session dialog" }}
              onClick={() => setSessionDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              tour={{ id: "builder.sessionCreate", label: "Create", help: "Create the session and open its editor.", order: 50 }}
              disabled={creating || sessionName.trim().length === 0}
              onClick={() => void submitSession()}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Create session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Screen>
  );
}
