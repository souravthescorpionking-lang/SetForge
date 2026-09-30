"use client";

// DayScreen — #/days/{dayId} (Part 9 §5 Day Overview).
// Interim scaffold: the full §5 build (muscle chips, action row, GroupCard
// stack with overrides, … menu) replaces this in the §5 wave.

import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Skeleton } from "@/components/ui/skeleton";

export default function DayScreen({ dayId }: { dayId: string }) {
  return (
    <Screen topBar>
      <TopBar
        leading={<BackButton fallbackHash="#/workout" label="Back" />}
        title="Day overview"
      />
      <ScrollBody>
        <div className="space-y-3 p-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </ScrollBody>
    </Screen>
  );
}
