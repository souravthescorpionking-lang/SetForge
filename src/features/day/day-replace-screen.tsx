"use client";

// DayReplaceScreen — #/days/{dayId}/replace/{reId} (Part 9 §5.2).
// Interim scaffold: the suggestions + catalogue §5.2 build replaces this.

import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Skeleton } from "@/components/ui/skeleton";

export default function DayReplaceScreen({ dayId, reId }: { dayId: string; reId?: string }) {
  return (
    <Screen topBar>
      <TopBar leading={<BackButton fallbackHash={`#/days/${dayId}`} label="Back" />} title="Replace exercise" />
      <ScrollBody>
        <div className="space-y-3 p-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </ScrollBody>
    </Screen>
  );
}
