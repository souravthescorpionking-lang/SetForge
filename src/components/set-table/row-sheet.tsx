"use client";

// Row sheet (tap the … cell): note, set type, RPE, tempo, rest, duplicate,
// delete, "use as prefill" and copy-to-clipboard — everything for one set.
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Copy, CopyPlus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SET_TYPES, SET_TYPE_META, formatRestSec, type SetType } from "@/lib/constants";
import { setSummary } from "@/lib/client/format";
import type { SetDTO } from "@/lib/types";
import { RpeCell, TempoCell, RestCell } from "./cells";

type Props = {
  set: SetDTO | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onDuplicate: (set: SetDTO) => void;
  onDelete: (set: SetDTO) => void;
  onUseAsPrefill: (set: SetDTO) => void;
};

export function RowSheet({ set, open, onOpenChange, onPatch, onDuplicate, onDelete, onUseAsPrefill }: Props) {
  if (!set) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="hidden" />
      </Sheet>
    );
  }
  return (
    <RowSheetInner
      key={set.id}
      set={set}
      open={open}
      onOpenChange={onOpenChange}
      onPatch={onPatch}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      onUseAsPrefill={onUseAsPrefill}
    />
  );
}

type InnerProps = Omit<Props, "set"> & { set: SetDTO };

function RowSheetInner({ set: s, open, onOpenChange, onPatch, onDuplicate, onDelete, onUseAsPrefill }: InnerProps) {
  const [note, setNote] = useState(s.comment ?? "");
  const [noteSaved, setNoteSaved] = useState(true);
  const type = (s.setType ?? (s.isWarmup ? "WARMUP" : "NORMAL")) as SetType;

  const saveNote = () => {
    const trimmed = note.trim() || null;
    if (trimmed !== (s.comment ?? null)) onPatch(s.id, { comment: trimmed });
    setNoteSaved(true);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[85vh] w-full flex-col rounded-t-2xl px-0 sm:max-w-lg sm:rounded-t-3xl"
      >
        <SheetHeader className="px-4 pb-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span className={cn("flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold", SET_TYPE_META[type].className)}>
              {SET_TYPE_META[type].letter}
            </span>
            Set {s.sortOrder + 1} · <span className="tabular-nums">{setSummary(s)}</span>
          </SheetTitle>
          <SheetDescription className="text-xs">
            {SET_TYPE_META[type].label}
            {s.newPr && " · personal record"}
            {s.completedAt && s.restActualSec != null && (
              <> · rest actual <span className="tabular-nums">{formatRestSec(s.restActualSec)}</span></>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          {/* note */}
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Note</p>
            <Textarea
              rows={2}
              value={note}
              placeholder="e.g. paused reps, belt on"
              onChange={(e) => { setNote(e.target.value); setNoteSaved(false); }}
              onBlur={saveNote}
            />
            {!noteSaved && <p className="mt-1 text-[11px] text-muted-foreground">Saved when you leave the field</p>}
          </div>

          <Separator />

          {/* set type chips */}
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Set type</p>
            <div className="flex flex-wrap gap-1.5">
              {SET_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={t === type}
                  onClick={() => onPatch(s.id, { setType: t })}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                    t === type ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold", SET_TYPE_META[t].className)}>
                    {SET_TYPE_META[t].letter}
                  </span>
                  {SET_TYPE_META[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* RPE / tempo / rest */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border p-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">RPE</p>
              <RpeCell value={s.rpe ?? null} onChange={(rpe) => onPatch(s.id, { rpe })} />
            </div>
            <div className="rounded-xl border p-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tempo</p>
              <TempoCell value={s.tempo ?? null} onChange={(tempo) => onPatch(s.id, { tempo })} />
            </div>
            <div className="rounded-xl border p-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rest</p>
              <RestCell plannedSec={s.restPlannedSec ?? null} remainingSec={null} onChange={(restPlannedSec) => onPatch(s.id, { restPlannedSec })} />
            </div>
          </div>

          {s.completedAt && (s.restActualSec != null || s.restPlannedSec != null) && (
            <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Rest — planned{" "}
              <span className="font-semibold tabular-nums text-foreground">{s.restPlannedSec ? formatRestSec(s.restPlannedSec) : "–"}</span>
              {" · actual "}
              <span className="font-semibold tabular-nums text-foreground">{s.restActualSec != null ? formatRestSec(s.restActualSec) : "–"}</span>
            </p>
          )}

          <Separator />

          {/* actions */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-11 justify-start rounded-xl text-sm font-medium"
              onClick={() => { onUseAsPrefill(s); onOpenChange(false); }}
            >
              <Wand2 className="h-4 w-4 text-primary" /> Use as prefill
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 justify-start rounded-xl text-sm font-medium"
              onClick={() => {
                void navigator.clipboard?.writeText(setSummary(s)).then(() => toast.success("Copied to clipboard"));
                onOpenChange(false);
              }}
            >
              <Copy className="h-4 w-4 text-muted-foreground" /> Copy summary
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 justify-start rounded-xl text-sm font-medium"
              onClick={() => { onDuplicate(s); onOpenChange(false); }}
            >
              <CopyPlus className="h-4 w-4 text-muted-foreground" /> Duplicate set
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 justify-start rounded-xl border-destructive/40 text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => { onDelete(s); onOpenChange(false); }}
            >
              <Trash2 className="h-4 w-4" /> Delete set
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
