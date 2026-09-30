"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SubscriptionScreen — #/account/subscription (Part 9 §9).
//
//   TopBar (56)  : BackButton (→ More) · "Subscription" · TopBarHelp
//   ScrollBody   : static "Free plan" card — icon tile + plan name + Current
//                  plan chip, 40px info rows (Price / Renews / Card required),
//                  prose note. "Manage billing" is a ghost button: this
//                  deployment wires no billing provider (PAYMENTS_PROVIDER
//                  defaults to "none"), so it honestly toasts instead of
//                  opening a checkout. Prose is exempt from the nowrap law.
// ─────────────────────────────────────────────────────────────────────────────

import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { tourAttrs } from "@/lib/tour/attrs";

// 40px info row (legal data-row height): label flex-1 | value right.
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div data-row className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3">
      <span className="min-w-0 flex-1 truncate text-sm font-medium leading-none">{label}</span>
      <span className="flex-none text-sm font-semibold leading-none text-muted-foreground">{value}</span>
    </div>
  );
}

export default function SubscriptionScreen() {
  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/more" label="Back to More" />}
          title="Subscription"
          actions={<TopBarHelp />}
        />
      }
    >
      <ScrollBody>
        {/* Free plan card — static, honest (no billing provider is wired). */}
        <section aria-label="Current plan" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold leading-none">Free plan</p>
              <p className="mt-1 truncate text-sm leading-none text-muted-foreground">
                All features · No card required
              </p>
            </div>
            <Badge variant="secondary" className="flex-none">Current plan</Badge>
          </div>
          <div className="flex flex-col gap-2">
            <InfoRow label="Price" value="Free" />
            <InfoRow label="Renews" value="Never" />
            <InfoRow label="Card required" value="No" />
          </div>
          <p className="whitespace-normal text-sm leading-relaxed text-muted-foreground">
            SetForge is free while it is under active development. Every training feature — programs,
            logging, records, body tracking and tools — is included. Billing appears here only if this
            deployment configures a payments provider.
          </p>
        </section>

        <Button
          type="button"
          variant="outline"
          className="h-11 w-full flex-none rounded-lg text-sm font-bold"
          {...tourAttrs({
            id: "accountSubscription.manageBilling",
            label: "Manage billing",
            help: "No billing provider is wired on this deployment — nothing to manage.",
            order: 30,
          })}
          onClick={() => toast.info("Billing is not enabled on this deployment")}
        >
          Manage billing
        </Button>
      </ScrollBody>
    </Screen>
  );
}
