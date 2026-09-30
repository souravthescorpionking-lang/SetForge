"use client";

// DayNotesScreen — #/days/{dayId}/notes/{reId} (Part 9 §5.4).
// Interim scaffold: the DayOverride.notes editor replaces this.

import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Skeleton } from "@/components/ui/skeleton";

export default function DayNotesScreen({ dayId, reId }: { dayId: string; reId?: string }) {
  return (
    <Screen topBar>
      <TopBar leading={<BackButton fallbackHash={`#/days/${dayId}`} label="Back" />} title="Notes" />
      <ScrollBody>
        <div className="space-y-3 p-4">
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </ScrollBody>
    </Screen>
  );
}
