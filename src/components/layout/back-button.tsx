"use client";

// BackButton — the standard TopBar leading back affordance (44px touch
// target). History-back when possible so in-app navigation chains behave like
// the browser; hash fallback for direct deep links.

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackButton({ fallbackHash, label }: { fallbackHash: string; label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-11 w-11 px-0"
      aria-label={label}
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          window.history.back();
        } else {
          window.location.hash = fallbackHash;
        }
      }}
    >
      <ArrowLeft className="h-5 w-5" aria-hidden />
    </Button>
  );
}
