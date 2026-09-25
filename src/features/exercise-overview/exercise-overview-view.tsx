"use client";

// ExerciseOverviewView (#/exercise-overview/:id) — the analysis hub for one
// exercise: History | Graph | Records | Goals tabs.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryDot } from "@/components/shared/category-dot";
import { EmptyState } from "@/components/shared/empty-state";
import { useApp } from "@/lib/client/store";
import { qk } from "@/lib/client/query";
import { exercisesApi } from "@/lib/client/api";
import { fieldsForType } from "@/lib/constants";
import { ArrowLeft, Dumbbell, History, LineChart, Medal, Pencil, Star, StickyNote, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExerciseFormDialog } from "@/features/exercises/exercise-form-dialog";
import { useToggleFavourite } from "@/features/exercises/use-favourite";
import { exerciseUnit, typeLabel } from "@/features/exercises/labels";
import { HistoryTab } from "./history-tab";
import { GraphTab } from "./graph-tab";
import { RecordsTab } from "./records-tab";
import { GoalsTab } from "./goals-tab";

export function ExerciseOverviewView({ exerciseId }: { exerciseId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const toggleFavourite = useToggleFavourite();
  const [editOpen, setEditOpen] = useState(false);
  const [editSession, setEditSession] = useState(0);

  const openEdit = () => {
    setEditSession((s) => s + 1); // remounts the dialog with fresh state
    setEditOpen(true);
  };

  const {
    data: exercise,
    isLoading,
    error,
  } = useQuery({
    queryKey: qk.exercise(exerciseId),
    queryFn: () => exercisesApi.get(exerciseId),
    retry: (failureCount, err) => {
      // 404 → exercise no longer exists; don't retry forever
      if (err instanceof Error && "status" in err && (err as { status?: number }).status === 404) return false;
      return failureCount < 1;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-10 w-full max-w-md rounded-lg" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !exercise) {
    return (
      <EmptyState
        icon={<Dumbbell className="h-6 w-6" />}
        title="Exercise not found"
        description="It may have been deleted on this account."
        action={
          <Button variant="secondary" className="gap-1.5" onClick={() => navigate("/exercises")}>
            <ArrowLeft className="h-4 w-4" /> Back to exercises
          </Button>
        }
      />
    );
  }

  const unit = exerciseUnit(exercise, settings);
  const fields = fieldsForType(exercise.type);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-4"
    >
      {/* header */}
      <div className="flex items-start gap-2 sm:gap-3">
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-xl"
          onClick={() => navigate("/exercises")}
          aria-label="Back to exercises"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h1 className="min-w-0 truncate text-xl font-bold tracking-tight sm:text-2xl">{exercise.name}</h1>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label={exercise.isFavorite ? "Remove from favourites" : "Add to favourites"}
                aria-pressed={exercise.isFavorite}
                onClick={() => void toggleFavourite(exercise)}
              >
                <Star
                  className={cn(
                    "h-5 w-5",
                    exercise.isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                  )}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label="Edit exercise"
                onClick={openEdit}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <CategoryDot colour={exercise.category?.colour} />
              {exercise.category?.name ?? "No category"}
            </span>
            <span aria-hidden>·</span>
            <Badge variant="secondary" className="font-normal">
              {typeLabel(exercise.type)}
            </Badge>
            {exercise.weightUnit && (
              <Badge variant="outline" className="font-normal">
                {exercise.weightUnit} weights
              </Badge>
            )}
            {exercise.restSec != null && exercise.restSec > 0 && (
              <Badge variant="outline" className="font-normal numeric">
                {exercise.restSec}s rest
              </Badge>
            )}
          </p>
        </div>
      </div>

      {exercise.notes && (
        <div className="flex items-start gap-2.5 rounded-2xl border bg-muted/30 p-3.5 text-sm text-muted-foreground">
          <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="min-w-0 whitespace-pre-wrap leading-snug">{exercise.notes}</p>
        </div>
      )}

      {/* tabs */}
      <Tabs defaultValue="history">
        <div className="sticky top-14 z-20 -mx-1 bg-background/95 px-1 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <TabsList className="grid w-full grid-cols-4 sm:inline-flex sm:w-auto">
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">History</span>
            </TabsTrigger>
            <TabsTrigger value="graph" className="gap-1.5">
              <LineChart className="h-4 w-4" />
              <span className="hidden sm:inline">Graph</span>
            </TabsTrigger>
            <TabsTrigger value="records" className="gap-1.5">
              <Medal className="h-4 w-4" />
              <span className="hidden sm:inline">Records</span>
            </TabsTrigger>
            <TabsTrigger value="goals" className="gap-1.5">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Goals</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="history" className="mt-4 outline-none">
          <HistoryTab key={exerciseId} exercise={exercise} />
        </TabsContent>
        <TabsContent value="graph" className="mt-4 outline-none">
          <GraphTab key={exerciseId} exercise={exercise} unit={unit} />
        </TabsContent>
        <TabsContent value="records" className="mt-4 outline-none">
          <RecordsTab key={exerciseId} exercise={exercise} unit={unit} fields={fields} />
        </TabsContent>
        <TabsContent value="goals" className="mt-4 outline-none">
          <GoalsTab key={exerciseId} exercise={exercise} unit={unit} />
        </TabsContent>
      </Tabs>

      <ExerciseFormDialog
        key={`ov-ex-${exerciseId}-${editSession}`}
        open={editOpen}
        onOpenChange={setEditOpen}
        exercise={exercise}
      />
    </motion.div>
  );
}
