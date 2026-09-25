"use client";

// One exercise row/card: favourite star, name, category dot, type badge,
// workout count, last performed + row actions (edit / history / delete).
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryDot } from "@/components/shared/category-dot";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useApp } from "@/lib/client/store";
import { relativeFromNow } from "@/lib/client/format";
import type { ExerciseDTO } from "@/lib/types";
import { LineChart, MoreVertical, Pencil, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { typeLabel } from "./labels";
import { useToggleFavourite } from "./use-favourite";

type Props = {
  exercise: ExerciseDTO;
  onEdit: (exercise: ExerciseDTO) => void;
  onDelete: (exercise: ExerciseDTO) => void;
};

export function ExerciseRow({ exercise: e, onEdit, onDelete }: Props) {
  const navigate = useApp((s) => s.navigate);
  const toggleFavourite = useToggleFavourite();

  const go = () => navigate(`/exercise-overview/${e.id}`);

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${e.name} details`}
        className="group flex cursor-pointer items-center gap-2 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:p-4"
        onClick={go}
        onKeyDown={(ev) => {
          // only navigate when the row itself (not a child button) has focus
          if (ev.target !== ev.currentTarget) return;
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            go();
          }
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CategoryDot colour={e.category?.colour} />
            <span className="truncate font-semibold leading-tight">{e.name}</span>
            <Badge variant="outline" className="hidden shrink-0 text-[10px] sm:inline-flex">
              {typeLabel(e.type)}
            </Badge>
          </div>
          <p className="mt-1 flex items-center gap-x-1.5 gap-y-0.5 flex-wrap text-xs text-foreground/70">
            <span className="inline-flex items-center gap-1 truncate">
              <CategoryDot colour={e.category?.colour} size={6} ring={false} />
              {e.category?.name ?? "No category"}
            </span>
            <span aria-hidden>·</span>
            <span className="numeric whitespace-nowrap">
              {e.workoutCount ?? 0} workout{(e.workoutCount ?? 0) === 1 ? "" : "s"}
            </span>
            <span aria-hidden>·</span>
            <span className="whitespace-nowrap">{relativeFromNow(e.lastPerformed ?? null)}</span>
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          aria-label={e.isFavorite ? `Remove ${e.name} from favourites` : `Add ${e.name} to favourites`}
          aria-pressed={e.isFavorite}
          onClick={(ev) => {
            ev.stopPropagation();
            void toggleFavourite(e);
          }}
        >
          <Star
            className={cn(
              "h-5 w-5 transition-colors",
              e.isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground group-hover:text-foreground",
            )}
          />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0"
              aria-label={`Actions for ${e.name}`}
              onClick={(ev) => ev.stopPropagation()}
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => onEdit(e)}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={go}>
              <LineChart /> History &amp; stats
            </DropdownMenuItem>
            <ConfirmDialog
              trigger={
                <DropdownMenuItem variant="destructive" onSelect={(e2) => e2.preventDefault()}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              }
              title={`Delete “${e.name}”?`}
              description="Deletes all history, PRs and goals for this exercise. This cannot be undone."
              confirmLabel="Delete exercise"
              onConfirm={() => void onDelete(e)}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
