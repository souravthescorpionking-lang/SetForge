"use client";

// Categories manager: cards grid with drag-to-reorder (dnd-kit),
// add / edit / delete (server refuses deletes with exercises), and
// "Sort alphabetically".
import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { categoriesApi } from "@/lib/client/api";
import { useCategories, useInvalidate } from "@/lib/client/query";
import type { CategoryDTO } from "@/lib/types";
import { toast } from "sonner";
import { ArrowDownAZ, GripVertical, Pencil, Plus, Tag, Tags, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOfflineRun } from "./offline-run";
import { CategoryFormDialog } from "./category-form-dialog";

export function CategoriesManager() {
  const { data: serverCats = [], isLoading } = useCategories();
  const invalidate = useInvalidate();
  const run = useOfflineRun();

  // optimistic order override (valid only against the server data it was based on)
  const [override, setOverride] = useState<{ cats: CategoryDTO[]; base: CategoryDTO[] } | null>(null);
  const cats = override && override.base === serverCats ? override.cats : serverCats;

  const [formOpen, setFormOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<CategoryDTO | null>(null);
  const [formSession, setFormSession] = useState(0);

  const openForm = (cat: CategoryDTO | null) => {
    setEditingCat(cat);
    setFormSession((s) => s + 1); // remounts the dialog with fresh state
    setFormOpen(true);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const persistOrder = async (ordered: CategoryDTO[], label: string): Promise<boolean> => {
    const ids = ordered.map((c) => c.id);
    return run({
      label: "Category order",
      path: "/api/categories/reorder",
      method: "POST",
      body: { ids },
      run: () => categoriesApi.reorder(ids),
      successMsg: label,
      onDone: () => invalidate.categories(),
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = cats.findIndex((c) => c.id === active.id);
    const newIndex = cats.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(cats, oldIndex, newIndex);
    setOverride({ cats: reordered, base: serverCats });
    void persistOrder(reordered, "Category order saved").then((ok) => {
      if (!ok) setOverride(null); // roll back on failure
    });
  };

  const handleSortAlpha = () => {
    const sorted = [...cats].sort((a, b) => a.name.localeCompare(b.name));
    if (sorted.every((c, i) => c.id === cats[i]?.id)) {
      toast.info("Already alphabetical");
      return;
    }
    setOverride({ cats: sorted, base: serverCats });
    void persistOrder(sorted, "Categories sorted alphabetically").then((ok) => {
      if (!ok) setOverride(null);
    });
  };

  const handleDelete = async (cat: CategoryDTO) => {
    await run({
      label: "Category delete",
      path: `/api/categories/${cat.id}`,
      method: "DELETE",
      run: () => categoriesApi.remove(cat.id),
      successMsg: `“${cat.name}” deleted`,
      onDone: () => invalidate.categories(),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {cats.length} categor{cats.length === 1 ? "y" : "ies"} · drag to reorder
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9"
            onClick={handleSortAlpha}
            disabled={cats.length < 2}
          >
            <ArrowDownAZ className="h-4 w-4" /> Sort A–Z
          </Button>
          <Button
            size="sm"
            className="gap-1.5 h-9"
            onClick={() => openForm(null)}
          >
            <Plus className="h-4 w-4" /> Add category
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : cats.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-6 w-6" />}
          title="No categories yet"
          description="Group your exercises by muscle group or equipment with colour-coded categories."
          action={
            <Button className="gap-1.5" onClick={() => openForm(null)}>
              <Plus className="h-4 w-4" /> Add category
            </Button>
          }
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={cats.map((c) => c.id)} strategy={rectSortingStrategy}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cats.map((cat) => (
                <SortableCategoryCard
                  key={cat.id}
                  cat={cat}
                  onEdit={() => openForm(cat)}
                  onDelete={() => void handleDelete(cat)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <CategoryFormDialog
        key={`cat-${editingCat?.id ?? "new"}-${formSession}`}
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditingCat(null);
        }}
        category={editingCat}
      />
    </div>
  );
}

function SortableCategoryCard({
  cat,
  onEdit,
  onDelete,
}: {
  cat: CategoryDTO;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cat.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative rounded-2xl border bg-card p-4 transition-shadow",
        isDragging && "z-50 opacity-90 shadow-xl ring-2 ring-primary/50",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-0.5 -ml-1 flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:text-foreground active:cursor-grabbing"
          aria-label={`Reorder ${cat.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div
          className="h-11 w-11 shrink-0 rounded-xl"
          style={{
            backgroundColor: cat.colour,
            boxShadow: `0 0 0 3px color-mix(in srgb, ${cat.colour} 25%, transparent)`,
          }}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{cat.name}</p>
          <p className="mt-1 text-xs text-muted-foreground numeric">
            {cat.exerciseCount ?? 0} exercise{cat.exerciseCount === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground"
            aria-label={`Edit ${cat.name}`}
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${cat.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            }
            title={`Delete “${cat.name}”?`}
            description={
              (cat.exerciseCount ?? 0) > 0
                ? `This category still has ${cat.exerciseCount} exercise(s). Move or delete them first — the server will refuse otherwise.`
                : "This cannot be undone."
            }
            confirmLabel="Delete"
            onConfirm={onDelete}
          />
        </div>
      </div>
    </div>
  );
}
