"use client";

// TermsScreen — #/account/terms (Part 9 §9). Static markdown prose.
// Interim scaffold: the §9 legal prose build replaces this.

import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Skeleton } from "@/components/ui/skeleton";

export default function TermsScreen() {
  return (
    <Screen topBar>
      <TopBar leading={<BackButton fallbackHash="#/more" label="Back" />} title="Terms" />
      <ScrollBody>
        <div className="space-y-3 p-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </ScrollBody>
    </Screen>
  );
}
