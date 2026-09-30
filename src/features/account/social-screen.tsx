"use client";

// SocialScreen — #/account/social (Part 9 §9).
// Interim scaffold: the linked-providers screen replaces this.

import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Skeleton } from "@/components/ui/skeleton";

export default function SocialScreen() {
  return (
    <Screen topBar>
      <TopBar leading={<BackButton fallbackHash="#/more" label="Back" />} title="Social accounts" />
      <ScrollBody>
        <div className="space-y-3 p-4">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </ScrollBody>
    </Screen>
  );
}
