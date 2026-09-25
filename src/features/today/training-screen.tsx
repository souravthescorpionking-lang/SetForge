"use client";

// Full-screen training sheet (bottom sheet on mobile, centered dialog on sm+)
// with Track / History / Graph tabs and prev/next exercise navigation.
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CategoryDot } from "@/components/shared/category-dot";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { workoutsApi } from "@/lib/client/api";
import { useInvalidate } from "@/lib/client/query";
import { todayKey } from "@/lib/client/format";
import type { SettingsDTO, WorkoutDTO, WorkoutExerciseDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TrackTab } from "./track-tab";
import { HistoryTab } from "./history-tab";
import { GraphTab } from "./graph-tab";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workout: WorkoutDTO;
  weId: string | null;
  onChangeWeId: (weId: string) => void;
  settings: SettingsDTO;
  onNavigateDate: (dayKey: string) => void;
};

export function TrainingScreen({ open, onOpenChange, workout, weId, onChangeWeId, settings, onNavigateDate }: Props) {
  const [tab, setTab] = useState("track");
  const invalidate = useInvalidate();

  const sorted = [...workout.exercises].sort((a, b) => a.sortOrder - b.sortOrder);
  const idx = sorted.findIndex((w) => w.id === weId);
  const we: WorkoutExerciseDTO | null = idx >= 0 ? sorted[idx] : null;
  const prev = idx > 0 ? sorted[idx - 1] : null;
  const next = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;

  // next exercise within the same superset group (wraps to first)
  const groupNext = (() => {
    if (!we?.groupId) return null;
    const members = sorted.filter((w) => w.groupId === we.groupId);
    if (members.length < 2) return null;
    const gi = members.findIndex((w) => w.id === we.id);
    return members[(gi + 1) % members.length];
  })();

  if (!we) return null;
  const ex = we.exercise;

  const goPrev = () => prev && onChangeWeId(prev.id);
  const goNext = () => next && onChangeWeId(next.id);

  /** Copy an earlier day's sets for this exercise into today's workout. */
  const copySetsToToday = async (fromDate: string, setIds: string[]) => {
    try {
      const tk = todayKey();
      const w = await workoutsApi.createOrGet(tk);
      await workoutsApi.copy(w.id, { fromDate, setIds });
      invalidate.workout(tk);
      toast.success(`Copied ${setIds.length} set${setIds.length === 1 ? "" : "s"} to today`);
      onOpenChange(false);
      onNavigateDate(tk);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Copy failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "top-auto bottom-0 translate-y-0 flex-col rounded-b-none rounded-t-3xl border-t-2 border-t-primary/60 p-0 gap-0",
          "max-h-[94vh] max-w-none data-[state=open]:slide-in-from-bottom-4",
          "sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-3xl sm:border-t sm:border sm:max-w-2xl sm:max-h-[88vh]",
        )}
        aria-describedby={undefined}
      >
        {/* header */}
        <div className="shrink-0 px-3 pt-3 pb-3 sm:px-5 sm:pt-4">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl"
              onClick={goPrev}
              disabled={!prev}
              aria-label={prev ? `Previous exercise: ${prev.exercise.name}` : "No previous exercise"}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <div className="flex min-w-0 flex-1 items-center justify-center gap-2.5 px-1">
              <CategoryDot colour={ex.category?.colour} size={12} />
              <div className="min-w-0 text-center">
                <DialogTitle className="truncate text-base font-bold sm:text-lg">{ex.name}</DialogTitle>
                <DialogDescription className="mt-0.5 flex items-center justify-center gap-1.5 text-[11px]">
                  <span>{ex.category?.name ?? "Exercise"}</span>
                  {we.groupId && (
                    <span className="font-semibold text-primary">
                      · superset · set {idx + 1}/{sorted.length}
                    </span>
                  )}
                  {!we.groupId && (
                    <span className="text-muted-foreground">
                      · exercise {idx + 1}/{sorted.length}
                    </span>
                  )}
                </DialogDescription>
              </div>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl"
              onClick={goNext}
              disabled={!next}
              aria-label={next ? `Next exercise: ${next.exercise.name}` : "No next exercise"}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl"
              onClick={() => onOpenChange(false)}
              aria-label="Close training screen"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* tabs */}
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="shrink-0 px-3 sm:px-5">
            <TabsList className="grid h-10 w-full grid-cols-3 rounded-xl">
              <TabsTrigger value="track" className="text-sm font-semibold">Track</TabsTrigger>
              <TabsTrigger value="history" className="text-sm font-semibold">History</TabsTrigger>
              <TabsTrigger value="graph" className="text-sm font-semibold">Graph</TabsTrigger>
            </TabsList>
          </div>

          <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-3 pb-28 sm:p-5 sm:pb-24">
            <TabsContent value="track" className="m-0">
              {we && (
                <TrackTab
                  key={we.id}
                  workout={workout}
                  we={we}
                  settings={settings}
                  nextWe={next}
                  groupNextWe={groupNext}
                  onSwitchExercise={onChangeWeId}
                />
              )}
            </TabsContent>
            <TabsContent value="history" className="m-0">
              <HistoryTab
                key={`h-${we.exerciseId}`}
                exercise={we.exercise}
                currentWorkoutId={workout.id}
                onNavigateDate={(dayKey) => {
                  onOpenChange(false);
                  onNavigateDate(dayKey);
                }}
                onCopySets={(fromDate, setIds) => copySetsToToday(fromDate, setIds)}
              />
            </TabsContent>
            <TabsContent value="graph" className="m-0">
              <GraphTab key={`g-${we.exerciseId}`} exercise={we.exercise} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
