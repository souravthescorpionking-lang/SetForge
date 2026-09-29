"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SessionEditorScreen — #/builder/session/{id} (Part 8 §3.8).
//
// The program editor WITHOUT day rows and Level (§3.8): a session is one
// implicit workout day — the editor auto-uses the session's single workout
// day and auto-creates it if a legacy session has none (kind flip → add day →
// flip back, validated server-side).
//
//   TopBar (56)  : BackButton → #/builder · session name · [Done] →
//                  #/programs/{id}
//   ScrollBody   : Name row 48 (inline input) · SubBar-style meta row 48
//                  (`N exercises · M sets`) · the single day's EditorDayBody
//                  (GroupCards edit mode + "+ Exercise | + Group").
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { routinesApi } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import type { RoutineDayDTO } from "@/lib/types";
import { errorMessage, useRoutineRun } from "@/features/routines/screen-helpers";
import { EditorDayBody, ensureSessionDay, kindSegment } from "./editor-shared";

export default function SessionEditorScreen({ routineId }: { routineId: string }) {
  return <SessionEditorInner key={routineId} routineId={routineId} />;
}

function SessionEditorInner({ routineId }: { routineId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const online = useOnline();
  const invalidate = useInvalidate();
  const { run } = useRoutineRun();

  // ---------- data ----------
  const { data: routine, isLoading, error } = useQuery({
    queryKey: qk.routine(routineId),
    queryFn: () => routinesApi.get(routineId),
    retry: 1,
  });

  const days = useMemo(
    () => (routine ? [...routine.days].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [routine],
  );
  // §3.8: the single implicit day — first workout day (sessions keep exactly
  // one; a legacy invalid session still shows its first workout day).
  const day: RoutineDayDTO | null = useMemo(
    () => days.find((d) => (d.dayType ?? "WORKOUT") !== "REST") ?? null,
    [days],
  );
  const kindSeg = routine ? kindSegment(routine) : "session";

  // ---------- auto-create the implicit day once ----------
  const [ensuring, setEnsuring] = useState(false);
  useEffect(() => {
    if (!routine || day || ensuring) return;
    if (!online) return;
    setEnsuring(true);
    void ensureSessionDay(routineId)
      .then(() => invalidate.routines())
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => setEnsuring(false));
  }, [routine, day, ensuring, online, routineId, invalidate]);

  // ---------- name ----------
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  useEffect(() => {
    if (routine && nameDraft == null) setNameDraft(routine.name);
  }, [routine, nameDraft]);

  const saveName = async () => {
    if (!routine || nameDraft == null) return;
    const name = nameDraft.trim();
    if (!name) {
      toast.info("Give the session a name");
      setNameDraft(routine.name);
      return;
    }
    if (name === routine.name) return;
    const ok = await run(() => routinesApi.update(routineId, { name }), {
      path: `/api/routines/${routineId}`,
      method: "PATCH",
      body: { name },
      label: "Name saved",
    });
    if (ok) toast.success("Name saved");
  };

  const [savingDone, setSavingDone] = useState(false);
  const done = () => {
    if (!routine) return;
    const name = (nameDraft ?? routine.name).trim();
    if (!name) {
      toast.info("Give the session a name before finishing");
      return;
    }
    setSavingDone(true);
    if (name !== routine.name) {
      void saveName().finally(() => {
        setSavingDone(false);
        navigate(`/programs/${routineId}`);
      });
      return;
    }
    setSavingDone(false);
    toast.success("Saved");
    navigate(`/programs/${routineId}`);
  };

  const exerciseCount = day?.exercises.length ?? 0;
  const setCount = day?.exercises.reduce((n, re) => n + re.sets.length, 0) ?? 0;

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/builder" label="Back to Builder" />}
          title={routine ? routine.name : "Session editor"}
          actions={
            <>
              <Button
                type="button"
                className="h-11 flex-none gap-1.5 px-4 text-sm font-bold"
                disabled={!routine || savingDone}
                tour={{ id: "sessionEditor.done", label: "Done", help: "Finish editing and return to the session.", order: 10 }}
                onClick={done}
              >
                {savingDone ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                Done
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
    >
      <ScrollBody>
        {error ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Session not found</p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Error-state back link for a missing session" }}
              onClick={() => navigate("/builder")}
            >
              Back to Builder
            </Button>
          </div>
        ) : isLoading || !routine ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading session">
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-28 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : (
          <>
            {/* ---------- Name row 48px ---------- */}
            <div
              data-row
              {...tourAttrs({ id: "sessionEditor.name", label: "Name", help: "Rename this session; saved when you leave the field.", order: 20 })}
              className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3"
            >
              <span className="w-14 flex-none text-xs font-semibold text-muted-foreground">Name</span>
              <Input
                value={nameDraft ?? ""}
                maxLength={80}
                aria-label="Session name"
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                className="h-10 min-w-0 flex-1"
              />
            </div>

            {/* ---------- session meta row 48px ---------- */}
            <div
              data-row
              aria-label="Session summary"
              {...tourAttrs({ id: "sessionEditor.meta", label: "Session summary", help: "How many exercises and sets this session holds.", order: 30, hint: true })}
              className="flex h-12 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground"
            >
              <span className="min-w-0 flex-1 truncate">
                {exerciseCount} {exerciseCount === 1 ? "exercise" : "exercises"} · {setCount} {setCount === 1 ? "set" : "sets"}
              </span>
            </div>

            {/* ---------- the single implicit workout day ---------- */}
            {ensuring && !day ? (
              <div className="flex h-28 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Preparing the session day…
              </div>
            ) : day ? (
              <EditorDayBody routineId={routineId} kindSeg={kindSeg} day={day} settings={settings} />
            ) : null}
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}
