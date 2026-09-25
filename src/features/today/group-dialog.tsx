"use client";

// Group (superset) dialogs:
// - CreateGroupDialog: name + colour (GROUP_PALETTE) + member exercises
// - EditGroupDialog: rename / recolour / ungroup (remove group)
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Link2, Palette, Trash2, Unlink } from "lucide-react";
import { GROUP_PALETTE } from "@/lib/constants";
import { workoutsApi } from "@/lib/client/api";
import { useInvalidate } from "@/lib/client/query";
import type { WorkoutDTO, WorkoutGroupDTO } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function ColourPicker({ colour, onChange }: { colour: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Group colour">
      {GROUP_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={colour === c}
          aria-label={`Colour ${c}`}
          className={cn(
            "h-9 w-9 rounded-xl transition-transform hover:scale-110",
            colour === c ? "scale-110 ring-2 ring-ring ring-offset-2 ring-offset-background" : "",
          )}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  workout,
  preselectedIds,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workout: WorkoutDTO;
  preselectedIds?: string[];
  onCreated?: () => void;
}) {
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [colour, setColour] = useState(GROUP_PALETTE[0]);
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(`Superset ${workout.groups.length + 1}`);
      setColour(workout.groups[workout.groups.length - 1]?.colour ? nextColour(workout.groups) : GROUP_PALETTE[0]);
      setMembers(new Set(preselectedIds ?? []));
    }
  }, [open]);

  const exercises = [...workout.exercises].sort((a, b) => a.sortOrder - b.sortOrder);

  const create = async () => {
    if (!name.trim() || members.size === 0 || busy) return;
    setBusy(true);
    try {
      await workoutsApi.createGroup(workout.id, { name: name.trim(), colour, exerciseIds: [...members] });
      invalidate.workout();
      toast.success(`Group “${name.trim()}” created`);
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create group");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b p-4 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4.5 w-4.5 text-primary" /> Create superset group
          </DialogTitle>
          <DialogDescription>Grouped exercises rotate automatically while training.</DialogDescription>
        </DialogHeader>

        <div className="scroll-slim min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <label htmlFor="group-name" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Group name
            </label>
            <Input
              id="group-name"
              value={name}
              maxLength={40}
              placeholder="e.g. Push tri-set"
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Palette className="h-3.5 w-3.5" /> Colour
            </span>
            <ColourPicker colour={colour} onChange={setColour} />
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Exercises ({members.size} selected)
            </span>
            <ul className="space-y-1.5">
              {exercises.map((we) => (
                <li key={we.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border bg-card px-3 py-2 transition-colors hover:bg-accent/60">
                    <Checkbox
                      checked={members.has(we.id)}
                      onCheckedChange={() => {
                        const next = new Set(members);
                        if (next.has(we.id)) next.delete(we.id);
                        else next.add(we.id);
                        setMembers(next);
                      }}
                      className="h-5 w-5"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{we.exercise.name}</span>
                    {we.groupId && (
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        in group
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t bg-muted/30 p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="font-bold" disabled={!name.trim() || members.size === 0 || busy} onClick={() => void create()}>
            {busy ? "Creating…" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function nextColour(groups: WorkoutGroupDTO[]): string {
  const used = new Set(groups.map((g) => g.colour));
  return GROUP_PALETTE.find((c) => !used.has(c)) ?? GROUP_PALETTE[0];
}

export function EditGroupDialog({
  open,
  onOpenChange,
  workout,
  group,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workout: WorkoutDTO;
  group: WorkoutGroupDTO | null;
}) {
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [colour, setColour] = useState(GROUP_PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [confirmUngroup, setConfirmUngroup] = useState(false);

  useEffect(() => {
    if (open && group) {
      setName(group.name);
      setColour(group.colour);
      setConfirmUngroup(false);
    }
  }, [open, group]);

  if (!group) return null;

  const members = workout.exercises.filter((we) => we.groupId === group.id);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await workoutsApi.updateGroup(workout.id, group.id, { name: name.trim(), colour });
      invalidate.workout();
      toast.success("Group updated");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update group");
    } finally {
      setBusy(false);
    }
  };

  const ungroup = async () => {
    setBusy(true);
    try {
      await workoutsApi.removeGroup(workout.id, group.id);
      invalidate.workout();
      toast.success(`“${group.name}” ungrouped`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove group");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b p-4 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: colour }} />
            Edit group
          </DialogTitle>
          <DialogDescription>{members.length} exercise{members.length === 1 ? "" : "s"} in this superset.</DialogDescription>
        </DialogHeader>

        <div className="scroll-slim min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-group-name" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Group name
            </label>
            <Input
              id="edit-group-name"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Palette className="h-3.5 w-3.5" /> Colour
            </span>
            <ColourPicker colour={colour} onChange={setColour} />
          </div>

          <ul className="space-y-1">
            {members.map((we) => (
              <li key={we.id} className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colour }} />
                <span className="min-w-0 flex-1 truncate">{we.exercise.name}</span>
                <span className="numeric shrink-0 text-[11px] text-muted-foreground">{we.sets.length} sets</span>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-muted/30 p-4 sm:flex-row">
          <Button
            variant="ghost"
            className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
            onClick={() => setConfirmUngroup(true)}
            disabled={busy}
          >
            <Unlink className="h-4 w-4" /> Ungroup
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="font-bold" disabled={!name.trim() || busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>

        {confirmUngroup && (
          <div className="rounded-b-2xl border-t border-destructive/30 bg-destructive/5 p-4">
            <p className="mb-3 text-sm">
              Remove the “{group.name}” group? The {members.length} exercise{members.length === 1 ? "" : "s"} stay in the
              workout, just no longer linked.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmUngroup(false)}>
                Keep group
              </Button>
              <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => void ungroup()}>
                <Trash2 className="h-3.5 w-3.5" /> Ungroup
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
