"use client";

// DeleteAccountScreen — #/account/delete (Part 9 §9).
// Interim scaffold: the type-DELETE destructive flow replaces this.

import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Skeleton } from "@/components/ui/skeleton";

export default function DeleteAccountScreen() {
  return (
    <Screen topBar>
      <TopBar leading={<BackButton fallbackHash="#/more" label="Back" />} title="Delete account" />
      <ScrollBody>
        <div className="space-y-3 p-4">
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </ScrollBody>
    </Screen>
  );
}
