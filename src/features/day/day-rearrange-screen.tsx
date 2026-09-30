"use client";

// DayRearrangeScreen — #/days/{dayId}/rearrange (Part 9 §5.1).
// Interim scaffold: the drag-and-drop §5.1 build replaces this.

import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Skeleton } from "@/components/ui/skeleton";

export default function DayRearrangeScreen({ dayId }: { dayId: string }) {
  return (
    <Screen topBar>
      <TopBar leading={<BackButton fallbackHash={`#/days/${dayId}`} label="Back" />} title="Rearrange" />
      <ScrollBody>
        <div className="space-y-3 p-4">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </ScrollBody>
    </Screen>
  );
}
