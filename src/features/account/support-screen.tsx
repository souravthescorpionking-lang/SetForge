"use client";

// SupportScreen — #/account/support (Part 9 §9).
// Interim scaffold: the support form (rate-limited POST /api/support) replaces this.

import { Screen, TopBar, ScrollBody } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Skeleton } from "@/components/ui/skeleton";

export default function SupportScreen() {
  return (
    <Screen topBar>
      <TopBar leading={<BackButton fallbackHash="#/more" label="Back" />} title="Message support" />
      <ScrollBody>
        <div className="space-y-3 p-4">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </ScrollBody>
    </Screen>
  );
}
