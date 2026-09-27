"use client";

// ─────────────────────────────────────────────────────────────────────────────
// QuickStartRow — section C of the Home dashboard (Part 5).
//
// One 48px row: "Quick sessions" label + up to 3 session chips (truncated
// names). Tapping a chip starts that session atomically (start-day, no dayId
// → the server resolves the single workout day) and drops the user on #/today.
// Hidden entirely when the user has no sessions.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { useInvalidate, useOnline } from "@/lib/client/query";
import { programsApi } from "@/lib/client/api";
import type { ProgramSummaryDTO } from "@/lib/types";
import { errorMessage } from "@/features/routines/screen-helpers";

export function QuickStartRow({ sessions }: { sessions: ProgramSummaryDTO[] }) {
  const navigate = useApp((s) => s.navigate);
  const invalidate = useInvalidate();
  const online = useOnline();
  const [startingId, setStartingId] = useState<string | null>(null);

  if (sessions.length === 0) return null;

  const startSession = async (session: ProgramSummaryDTO) => {
    if (!online) {
      toast.info("Starting a session needs a connection");
      return;
    }
    setStartingId(session.id);
    try {
      await programsApi.startDay(session.id);
      invalidate.workout();
      invalidate.dashboard();
      invalidate.schedule();
      toast.success(`Started ${session.name}`);
      navigate("/today");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStartingId(null);
    }
  };

  return (
    <div
      data-row
      aria-label="Quick sessions"
      className="flex h-12 items-center gap-2 overflow-hidden whitespace-nowrap"
    >
      <span className="flex-none text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Quick sessions
      </span>
      <div className="flex h-11 min-w-0 flex-1 items-center gap-2">
        {sessions.slice(0, 3).map((session) => {
          const busy = startingId === session.id;
          return (
            <button
              key={session.id}
              type="button"
              aria-label={`Start session ${session.name}`}
              disabled={startingId != null}
              onClick={() => void startSession(session)}
              className={cn(
                "flex h-11 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold",
                "transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-60",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 flex-none animate-spin text-primary" aria-hidden />
              ) : (
                <Zap className="h-4 w-4 flex-none text-primary" aria-hidden />
              )}
              <span className="truncate">{session.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
