"use client";

// Existing sets list inside the training screen: sortable rows with set
// number, value summary, PR trophy, per-set comment popover, completion
// checkbox (optional), tap-to-edit selection and delete.
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSortable, SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { GripVertical, MessageSquareText, Trash2, Trophy } from "lucide-react";
import type { SetDTO } from "@/lib/types";
import { setSummary } from "@/lib/client/format";
import { cn } from "@/lib/utils";

type Props = {
  sets: SetDTO[];
  markSetsComplete: boolean;
  selectedSetId: string | null;
  onSelect: (set: SetDTO) => void;
  onToggleComplete: (set: SetDTO) => void;
  onSaveComment: (setId: string, comment: string | null) => void;
  onReorder: (ids: string[]) => void;
  onDelete: (set: SetDTO) => void;
};

export function SetsList({
  sets,
  markSetsComplete,
  selectedSetId,
  onSelect,
  onToggleComplete,
  onSaveComment,
  onReorder,
  onDelete,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const sorted = [...sets].sort((a, b) => a.sortOrder - b.sortOrder);
  const ids = sorted.map((s) => s.id);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
        No sets yet — log your first one above 💪
      </div>
    );
  }

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
              {sorted.map((s) => (
                <motion.li
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                >
                  <SetRow
                    set={s}
                    markSetsComplete={markSetsComplete}
                    selected={selectedSetId === s.id}
                    onSelect={() => onSelect(s)}
                    onToggleComplete={() => onToggleComplete(s)}
                    onSaveComment={(c) => onSaveComment(s.id, c)}
                    onDelete={() => onDelete(s)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SetRow({
  set,
  markSetsComplete,
  selected,
  onSelect,
  onToggleComplete,
  onSaveComment,
  onDelete,
}: {
  set: SetDTO;
  markSetsComplete: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggleComplete: () => void;
  onSaveComment: (comment: string | null) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: set.id });
  const [commentOpen, setCommentOpen] = useState(false);
  const [draft, setDraft] = useState(set.comment ?? "");

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/row flex touch-manipulation items-center gap-1 overflow-hidden rounded-xl border bg-card pr-1 pl-2 transition-colors",
        selected ? "border-primary/70 bg-primary/5 ring-1 ring-primary/40" : "border-border/70 hover:border-primary/30",
        isDragging && "z-10 opacity-80 shadow-xl ring-2 ring-primary/60",
      )}
    >
      <button
        type="button"
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left"
        onClick={onSelect}
        aria-label={`Edit set: ${setSummary(set)}`}
        aria-pressed={selected}
      >
        <span
          className={cn(
            "numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
            selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {set.sortOrder + 1}
        </span>
        <span className="numeric min-w-0 flex-1 truncate text-[15px] font-semibold">{setSummary(set)}</span>
        {set.newPr && (
          <Trophy className="h-4 w-4 shrink-0 text-amber-500" aria-label="personal record on this set" />
        )}
        {set.comment && (
          <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-label="has comment" />
        )}
      </button>

      {selected && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete set"
          className="h-9 w-9 shrink-0 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}

      <Popover
        open={commentOpen}
        onOpenChange={(o) => {
          setCommentOpen(o);
          if (o) setDraft(set.comment ?? "");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Set comment"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
          >
            <MessageSquareText className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3" onOpenAutoFocus={(e) => e.preventDefault()}>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Set {set.sortOrder + 1} comment
          </p>
          <Textarea
            autoFocus
            rows={2}
            value={draft}
            placeholder="e.g. paused reps, belt on"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="mt-2 flex justify-end gap-1.5">
            {set.comment && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  onSaveComment(null);
                  setCommentOpen(false);
                }}
              >
                Remove
              </Button>
            )}
            <Button
              size="sm"
              className="font-semibold"
              onClick={() => {
                onSaveComment(draft.trim() || null);
                setCommentOpen(false);
              }}
            >
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {markSetsComplete && (
        <Checkbox
          aria-label={`Mark set ${set.sortOrder + 1} complete`}
          checked={set.isComplete}
          onCheckedChange={() => onToggleComplete()}
          className="h-5.5 w-5.5 shrink-0"
        />
      )}

      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Reorder set"
        className="flex h-11 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-4.5 w-4.5" />
      </button>
    </div>
  );
}
