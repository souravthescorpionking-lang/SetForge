"use client";

// SubscriptionScreen — #/account/subscription (Part 9 §9).
// Interim scaffold: the static Free-plan screen replaces this.

import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Skeleton } from "@/components/ui/skeleton";

export default function SubscriptionScreen() {
  return (
    <Screen topBar>
      <TopBar leading={<BackButton fallbackHash="#/more" label="Back" />} title="Subscription" />
      <ScrollBody>
        <div className="space-y-3 p-4">
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </ScrollBody>
    </Screen>
  );
}
