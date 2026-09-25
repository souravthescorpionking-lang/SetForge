"use client";

// Create / edit category dialog with palette + native colour input.
// NOTE: state is initialised from `category` on mount — parents remount via key.
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_PALETTE } from "@/lib/constants";
import type { CategoryDTO } from "@/lib/types";
import { categoriesApi } from "@/lib/client/api";
import { useInvalidate } from "@/lib/client/query";
import { toast } from "sonner";
import { Save, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOfflineRun } from "./offline-run";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → create mode. */
  category: CategoryDTO | null;
};

export function CategoryFormDialog({ open, onOpenChange, category }: Props) {
  const invalidate = useInvalidate();
  const run = useOfflineRun();
  const editing = !!category;

  const [name, setName] = useState(category?.name ?? "");
  const [colour, setColour] = useState<string>(category?.colour ?? CATEGORY_PALETTE[0]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Please give the category a name");
      return;
    }
    setSaving(true);
    const payload = { name: trimmed, colour };
    const ok = await run({
      label: editing ? "Category update" : "Category",
      path: editing ? `/api/categories/${category!.id}` : "/api/categories",
      method: editing ? "PATCH" : "POST",
      body: payload,
      run: () => (editing ? categoriesApi.update(category!.id, payload) : categoriesApi.create(payload)),
      successMsg: editing ? "Category updated" : `“${trimmed}” created`,
      onDone: () => {
        invalidate.categories();
        invalidate.exercises();
        onOpenChange(false);
      },
    });
    if (!ok) setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            {editing ? "Edit category" : "New category"}
          </DialogTitle>
          <DialogDescription>
            Categories colour-code your exercises across the app.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name" className="text-xs font-medium text-muted-foreground">
              Name *
            </Label>
            <Input
              id="cat-name"
              autoFocus
              placeholder="e.g. Forearms"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSave()}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Colour</Label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {CATEGORY_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use colour ${c}`}
                  aria-pressed={colour === c}
                  className={cn(
                    "h-9 w-9 rounded-xl transition-transform",
                    colour === c && "ring-2 ring-ring ring-offset-2 ring-offset-background scale-110",
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColour(c)}
                />
              ))}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-1">
                <input
                  type="color"
                  aria-label="Custom colour"
                  className="h-9 w-11 cursor-pointer rounded-lg border border-input bg-transparent p-0.5"
                  value={colour}
                  onChange={(e) => setColour(e.target.value)}
                />
                Custom
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving} className="gap-1.5 min-w-24">
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
