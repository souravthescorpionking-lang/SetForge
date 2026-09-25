"use client";

// Routine summary card in the list: drag handle, name, notes preview,
// day/exercise chips, Log (day picker), edit, duplicate, delete.
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, Copy, Pencil, Trash2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { RoutineDTO } from "@/lib/types";
import { DragHandle } from "./bits";
import { cn } from "@/lib/utils";

type Props = {
  routine: RoutineDTO;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onOpenLog: (routine: RoutineDTO, dayId: string) => void;
  onEdit: (routine: RoutineDTO) => void;
  onDuplicate: (routine: RoutineDTO) => void;
  onDelete: (routine: RoutineDTO) => void;
};

const MAX_CHIPS = 4;

export function RoutineCard({ routine, index, expanded, onToggle, onOpenLog, onEdit, onDuplicate, onDelete }: Props) {
  const days = [...routine.days].sort((a, b) => a.sortOrder - b.sortOrder);
  const totalExercises = days.reduce((n, d) => n + d.exercises.length, 0);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: routine.id });
  const style = { transform: CSS.Translate.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "z-10")}>
      <Card
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`Routine ${routine.name}`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          "cursor-pointer gap-0 py-0 transition-all hover:border-primary/40 hover:shadow-md",
          expanded ? "border-primary/50 shadow-md" : "shadow-xs",
          isDragging && "rotate-[0.3deg] scale-[1.01] border-primary/50 shadow-lg shadow-primary/10",
        )}
      >
        <CardHeader className="flex-row items-start gap-1 space-y-0 p-4 sm:p-5">
          <DragHandle {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <CardTitle className="truncate text-base sm:text-lg">{routine.name}</CardTitle>
              <ChevronDown
                aria-hidden
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  expanded && "rotate-180",
                )}
              />
            </div>
            {routine.notes && <CardDescription className="mt-0.5 line-clamp-1">{routine.notes}</CardDescription>}

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="numeric text-xs text-muted-foreground">
                <span className="text-muted-foreground/50">#{index + 1}</span> · {days.length}{" "}
                {days.length === 1 ? "day" : "days"} · {totalExercises} {totalExercises === 1 ? "exercise" : "exercises"}
              </span>
              {days.slice(0, MAX_CHIPS).map((d) => (
                <Badge key={d.id} variant="secondary" className="numeric gap-1 px-1.5 font-medium">
                  {d.name}
                  <span className="text-muted-foreground">·{d.exercises.length}</span>
                </Badge>
              ))}
              {days.length > MAX_CHIPS && (
                <span className="text-xs text-muted-foreground">+{days.length - MAX_CHIPS} more</span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {days.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-1" aria-label={`Log a day of ${routine.name}`}>
                    <Zap className="h-4 w-4" />
                    <span className="hidden sm:inline">Log</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Log a day</DropdownMenuLabel>
                  {days.map((d) => (
                    <DropdownMenuItem
                      key={d.id}
                      disabled={d.exercises.length === 0}
                      onSelect={() => onOpenLog(routine, d.id)}
                    >
                      <Zap className="h-4 w-4" />
                      <span className="truncate">{d.name}</span>
                      <span className="numeric ml-auto text-xs text-muted-foreground">
                        {d.exercises.length} {d.exercises.length === 1 ? "ex" : "ex"}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button size="sm" className="gap-1" disabled title="Add a day first">
                <Zap className="h-4 w-4" />
                <span className="hidden sm:inline">Log</span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              aria-label={`Edit ${routine.name}`}
              className="h-9 w-9 text-muted-foreground"
              onClick={() => onEdit(routine)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Duplicate ${routine.name}`}
              className="h-9 w-9 text-muted-foreground"
              onClick={() => onDuplicate(routine)}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${routine.name}`}
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              }
              title="Delete routine?"
              description={`“${routine.name}” and all its days (${days.length}) will be permanently removed.`}
              confirmLabel="Delete"
              onConfirm={() => onDelete(routine)}
            />
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
