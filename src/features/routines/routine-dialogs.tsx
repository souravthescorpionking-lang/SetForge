"use client";

// Dialogs for the Routines feature: routine create/edit + day add/rename.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { routinesApi } from "@/lib/client/api";
import { queueMutation } from "@/lib/client/offline";
import { useInvalidate, useOnline } from "@/lib/client/query";
import type { RoutineDayDTO, RoutineDTO } from "@/lib/types";
import { toast } from "sonner";
import { errorMessage } from "./use-routine-mutations";

// ---------------------------------------------------------------- routine form

export function RoutineFormDialog({
  open,
  onOpenChange,
  routine,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → create mode. */
  routine: RoutineDTO | null;
  onCreated?: (routine: RoutineDTO) => void;
}) {
  const online = useOnline();
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setName(routine?.name ?? "");
      setNotes(routine?.notes ?? "");
      setPending(false);
    }
  }, [open, routine]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setPending(true);
    try {
      const payload = { name: trimmed, notes: notes.trim() ? notes.trim() : null };
      if (!routine) {
        if (!online) {
          queueMutation("/api/routines", "POST", payload, "New routine");
          toast.info("Routine saved offline — will sync when reconnected");
          onOpenChange(false);
          return;
        }
        const created = await routinesApi.create(payload);
        invalidate.routines();
        toast.success(`Created “${created.name}”`);
        onCreated?.(created);
        onOpenChange(false);
      } else {
        if (!online) {
          queueMutation(`/api/routines/${routine.id}`, "PATCH", payload, "Routine changes");
          toast.info("Changes saved offline — will sync when reconnected");
          onOpenChange(false);
          return;
        }
        await routinesApi.update(routine.id, payload);
        invalidate.routines();
        toast.success("Routine updated");
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{routine ? "Edit routine" : "New routine"}</DialogTitle>
          <DialogDescription>
            {routine ? "Rename this routine or update its notes." : "Create a template you can log in one tap."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="routine-name">Name</Label>
            <Input
              id="routine-name"
              autoFocus
              maxLength={80}
              placeholder="e.g. Push Day, Full Body A…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="routine-notes">Notes (optional)</Label>
            <Textarea
              id="routine-notes"
              maxLength={2000}
              rows={3}
              placeholder="Split, focus, reminders…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={pending || !name.trim()} className="gap-1.5">
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {routine ? "Save changes" : "Create routine"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- day name form

export function DayNameDialog({
  open,
  onOpenChange,
  routineId,
  /** null → create (add day) mode. */
  day,
  defaultName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routineId: string | null;
  day: RoutineDayDTO | null;
  defaultName: string;
}) {
  const online = useOnline();
  const invalidate = useInvalidate();
  const [name, setName] = useState(defaultName);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setName(day?.name ?? defaultName);
      setPending(false);
    }
  }, [open, day, defaultName]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || !routineId || pending) return;
    setPending(true);
    try {
      if (!day) {
        if (!online) {
          queueMutation(`/api/routines/${routineId}/days`, "POST", { name: trimmed }, "New day");
          toast.info("Day saved offline — will sync when reconnected");
          onOpenChange(false);
          return;
        }
        await routinesApi.addDay(routineId, trimmed);
        invalidate.routines();
        toast.success(`Added “${trimmed}”`);
        onOpenChange(false);
      } else {
        if (!online) {
          queueMutation(`/api/routines/${routineId}/days/${day.id}`, "PATCH", { name: trimmed }, "Day renamed");
          toast.info("Rename saved offline — will sync when reconnected");
          onOpenChange(false);
          return;
        }
        await routinesApi.updateDay(routineId, day.id, { name: trimmed });
        invalidate.routines();
        toast.success("Day renamed");
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{day ? "Rename day" : "Add day"}</DialogTitle>
          <DialogDescription>
            {day ? "Give this training day a new name." : "A day is one training session you can log in one tap."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          <Label htmlFor="day-name">Day name</Label>
          <Input
            id="day-name"
            autoFocus
            maxLength={80}
            placeholder="e.g. Day A, Push, Legs…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={pending || !name.trim()} className="gap-1.5">
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {day ? "Rename" : "Add day"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
