"use client";

// OnDemandFiltersScreen — #/on-demand/filters (Part 9 §7).
// Interim scaffold: the §7 filter screen (URL state, server filtering) replaces this.

import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Skeleton } from "@/components/ui/skeleton";

export default function OnDemandFiltersScreen() {
  return (
    <Screen topBar bottomBar>
      <TopBar leading={<BackButton fallbackHash="#/on-demand" label="Back" />} title="Filters" />
      <ScrollBody>
        <div className="space-y-3 p-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </ScrollBody>
    </Screen>
  );
}
