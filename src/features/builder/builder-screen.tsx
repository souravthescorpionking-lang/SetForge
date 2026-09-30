"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuilderScreen — #/builder, evolved to §4.1 "Your workouts".
//
//   TopBar (56)   : BackButton → #/workout · "Your workouts" · TopBarHelp
//   SubBar (48)   : search (name + muscle labels, client-side)
//   ScrollBody    : "Your workouts" — cards 48+40 from GET /api/days?source=
//                   CUSTOM: R1 name · difficulty pill · R2 "{muscles up to 3,
//                   +n} · {minutes} min · {exercises} ex". Tap → #/days/{dayId};
//                   trailing ⋮ → ActionList Edit (→ #/builder/session/{id}) ·
//                   Duplicate (POST /api/days/{dayId}/duplicate) · Delete
//                   (confirm modal).
//                   Empty: "No custom workouts yet."
//                   Search-empty: 'No workouts match "{q}".' + "Clear search"
//                   · "Create" (kept — the program-builder entry): New program /
//                   New session / Session from a log
//                   · "Edit" (kept): every ROUTINE + SESSION row
//   BottomBar (56): "Build a workout" → #/builder/session/new (§4.2 draft)
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Screen, TopBar, SubBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronRight, ClipboardList, Dumbbell, FilePlus2, Loader2, MoreVertical, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { dayApi, routinesApi } from "@/lib/client/api";
import { usePrograms, useCustomWorkouts, useInvalidate, useOnline } from "@/lib/client/query";
import { DIFFICULTY_LABELS, type Difficulty } from "@/lib/constants";
import type { CustomWorkoutRowDTO, ProgramSummaryDTO } from "@/lib/types";
import { errorMessage } from "@/features/routines/screen-helpers";
import { ActionList } from "@/components/shared/action-list";
import { muscleLabelOf } from "./add-flow-shared";

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
// convert kind→SESSION; the day-create endpoint refuses SESSION-kind
// routines, and the kind conversion validates "exactly one workout day").
// §4: sessions built here are user-built workouts → source=CUSTOM.
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
      const created = await routinesApi.create({ name, kind: "ROUTINE", source: "CUSTOM" });
      await routinesApi.addDay(created.id, "Workout", "WORKOUT");
      await routinesApi.update(created.id, { kind: "SESSION" });
      invalidate.routines();
      invalidate.programs();
      invalidate.customWorkouts();
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
// One "Your workouts" card (48 + 40)
// ─────────────────────────────────────────────────────────────────────────────

function workoutMeta(row: CustomWorkoutRowDTO): string {
  const muscles = row.muscles.map(muscleLabelOf);
  const shown = muscles.slice(0, 3).join(", ");
  const extra = muscles.length > 3 ? ` +${muscles.length - 3}` : "";
  const minutes = row.estMinutes != null ? `${row.estMinutes} min` : null;
  const count = `${row.exerciseCount} ex`;
  return [[shown ? `${shown}${extra}` : null], [minutes], [count]].flat().filter(Boolean).join(" · ");
}

function WorkoutCard({
  row,
  index,
  onEdit,
  onDuplicate,
  onDelete,
  duplicating,
}: {
  row: CustomWorkoutRowDTO;
  index: number;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  duplicating: boolean;
}) {
  const navigate = useApp((s) => s.navigate);
  const difficulty = (row.difficulty ?? null) as Difficulty | null;
  return (
    <div
      data-row
      className="relative flex w-full flex-none items-stretch overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
      style={{ animationDelay: `${Math.min(index, 8) * 20}ms` }}
    >
      {/* L4 4px accent bar */}
      <span aria-hidden className="w-1 flex-none bg-primary" />
      <button
        type="button"
        aria-label={`Open ${row.name}`}
        {...tourAttrs({ id: "builder.workout", label: "Workout card", help: "Open this workout's day overview.", order: 40 })}
        onClick={() => {
          if (row.dayId) navigate(`/days/${row.dayId}`);
        }}
        className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {/* R1 48 */}
        <span className="flex h-12 w-full min-w-0 items-center gap-2 px-3">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{row.name}</span>
          {difficulty ? (
            <span className="flex h-6 flex-none items-center rounded-full border border-border px-2 text-[10px] font-bold uppercase leading-none text-muted-foreground">
              {DIFFICULTY_LABELS[difficulty]}
            </span>
          ) : null}
        </span>
        {/* R2 40 */}
        <span className="flex h-10 w-full min-w-0 items-center px-3 text-xs leading-none text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">{workoutMeta(row)}</span>
        </span>
      </button>
      <span className="flex flex-none items-center px-1">
        <ActionList
          label={`Options for ${row.name}`}
          align="end"
          trigger={
            <button
              type="button"
              aria-label={`Options for ${row.name}`}
              {...tourAttrs({ id: "builder.workoutMenu", label: "Options", help: "Edit, duplicate or delete this workout.", order: 50 })}
              className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {duplicating ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <MoreVertical className="h-5 w-5" aria-hidden />}
            </button>
          }
          items={[
            { id: "edit", label: "Edit", onSelect: onEdit },
            { id: "duplicate", label: "Duplicate", onSelect: onDuplicate },
            { id: "delete", label: "Delete", danger: true, onSelect: onDelete },
          ]}
        />
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function BuilderScreen() {
  const navigate = useApp((s) => s.navigate);
  const { data: programs, isLoading: programsLoading } = usePrograms();
  const { data: customData, isLoading: workoutsLoading } = useCustomWorkouts();
  const createSession = useCreateSession();
  const invalidate = useInvalidate();
  const online = useOnline();

  const [search, setSearch] = useState("");
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [creating, setCreating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomWorkoutRowDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  const routines = useMemo(
    () => (programs ?? []).filter((p) => (p.kind ?? "ROUTINE") === "ROUTINE"),
    [programs],
  );
  const sessions = useMemo(
    () => (programs ?? []).filter((p) => p.kind === "SESSION"),
    [programs],
  );

  // §4.1 search: name + muscle labels, client-side.
  const workouts = customData?.workouts ?? [];
  const q = search.trim().toLowerCase();
  const filteredWorkouts = useMemo(() => {
    if (!q) return workouts;
    return workouts.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.muscles.some((m) => muscleLabelOf(m).toLowerCase().includes(q)),
    );
  }, [workouts, q]);

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

  const duplicate = async (row: CustomWorkoutRowDTO) => {
    if (!row.dayId) {
      toast.info("This workout has no day to duplicate yet");
      return;
    }
    if (!online) {
      toast.info("Duplicating needs a connection");
      return;
    }
    setDuplicatingId(row.id);
    try {
      await dayApi.duplicate(row.dayId);
      invalidate.customWorkouts();
      invalidate.programs();
      toast.success(`Duplicated “${row.name}”`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDuplicatingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    setDeleteTarget(null);
    if (!online) {
      toast.info("Deleting needs a connection");
      return;
    }
    setDeleting(true);
    try {
      await routinesApi.remove(row.id);
      invalidate.customWorkouts();
      invalidate.routines();
      invalidate.programs();
      toast.success(`Deleted “${row.name}”`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
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
          order: 90,
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
            <span {...tourAttrs({ id: "builder.title", label: "Your workouts", help: "Your custom workouts, plus program creation and editing.", order: 10 })}>
              Your workouts
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
            placeholder="Search workouts…"
            aria-label="Search your workouts"
            {...tourAttrs({ id: "builder.search", label: "Search", help: "Search workouts by name or muscle.", order: 20 })}
            className="h-10 min-w-0 flex-1"
          />
        </SubBar>
      }
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            className="h-11 w-full gap-1.5 text-base font-bold"
            tour={{ id: "builder.build", label: "Build workout", help: "Start a new custom workout from scratch.", order: 30 }}
            onClick={() => navigate("/builder/session/new")}
          >
            <Plus className="h-5 w-5" aria-hidden />
            Build a workout
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody>
        {/* ---------- Your workouts (§4.1) ---------- */}
        <SectionLabel title="Your workouts" />
        {workoutsLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading your workouts">
            <Skeleton className="h-[88px] w-full rounded-lg" />
            <Skeleton className="h-[88px] w-full rounded-lg" />
          </div>
        ) : workouts.length === 0 ? (
          <div className="flex h-[200px] w-full flex-none flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">No custom workouts yet.</p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              Build one below — it lands here for scheduling and logging.
            </p>
          </div>
        ) : filteredWorkouts.length === 0 ? (
          <div className="flex h-[200px] w-full flex-none flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="px-4 text-center text-sm font-semibold">No workouts match &ldquo;{search.trim()}&rdquo;.</p>
            <Button
              type="button"
              variant="outline"
              tour={{ id: "builder.searchClear", label: "Clear search", help: "Drop the search text.", order: 100 }}
              onClick={() => setSearch("")}
            >
              Clear search
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredWorkouts.map((row, i) => (
              <WorkoutCard
                key={row.id}
                row={row}
                index={i}
                duplicating={duplicatingId === row.id}
                onEdit={() => navigate(`/builder/session/${row.id}`)}
                onDuplicate={() => void duplicate(row)}
                onDelete={() => setDeleteTarget(row)}
              />
            ))}
          </div>
        )}

        {/* ---------- Create (kept — the program-builder entry) ---------- */}
        <div className="h-2 flex-none" aria-hidden />
        <SectionLabel title="Create" />

        <button
          type="button"
          data-row
          {...tourAttrs({
            id: "builder.newProgram",
            label: "New program",
            help: "Open the wizard: level, days per week and a weekly template.",
            order: 60,
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
            help: "Name it, then add exercises in the workout builder.",
            order: 70,
          })}
          onClick={() => setSessionDialogOpen(true)}
          className="mt-2 flex h-14 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
            order: 80,
          })}
          onClick={() => navigate("/logs")}
          className="mt-2 flex h-14 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ClipboardList className="h-5 w-5 flex-none text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">Session from a log</span>
          <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
        </button>

        {/* ---------- Edit (kept — programs + sessions) ---------- */}
        <div className="h-2 flex-none" aria-hidden />
        <SectionLabel title="Edit" />

        {programsLoading ? (
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
            {...tourAttrs({ id: "builder.sessionName", label: "Session name", help: "Type a name for the new session.", order: 110 })}
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
              tour={{ id: "builder.sessionCreate", label: "Create", help: "Create the session and open its editor.", order: 120 }}
              disabled={creating || sessionName.trim().length === 0}
              onClick={() => void submitSession()}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Create session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- §4.1 delete confirm ---------- */}
      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name ?? "workout"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The workout and its planned exercises are removed. Logged workouts stay untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {deleting ? (
        <p className="sr-only" aria-live="polite">
          Deleting workout…
        </p>
      ) : null}
    </Screen>
  );
}
