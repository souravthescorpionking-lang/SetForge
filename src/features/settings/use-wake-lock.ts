"use client";

// Screen Wake Lock hook — keeps the display awake while enabled.
// Acquires on mount/toggle-on, releases on toggle-off/unmount,
// and re-acquires when the document becomes visible again.
// (Browsers auto-release wake locks when the tab is hidden.)
import { useCallback, useEffect, useRef, useState } from "react";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

type WakeLockNav = { request: (type: "screen") => Promise<WakeLockSentinelLike> };

function getWakeLock(): WakeLockNav | null {
  if (typeof navigator === "undefined") return null;
  const n = navigator as Navigator & { wakeLock?: WakeLockNav };
  return n.wakeLock ?? null;
}

export function isWakeLockSupported(): boolean {
  return getWakeLock() !== null;
}

export function useWakeLock(enabled: boolean): boolean {
  const [active, setActive] = useState(false);
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  const release = useCallback(async () => {
    const s = sentinelRef.current;
    sentinelRef.current = null;
    if (s && !s.released) {
      try {
        await s.release();
      } catch {
        /* already released */
      }
    }
    setActive(false);
  }, []);

  const acquire = useCallback(async () => {
    const wl = getWakeLock();
    if (!wl || sentinelRef.current) return;
    let s: WakeLockSentinelLike;
    try {
      s = await wl.request("screen");
    } catch {
      // transient denial (e.g. document hidden) — visibilitychange retries
      return;
    }
    // another acquire won the race — discard this sentinel
    if (sentinelRef.current) {
      try {
        await s.release();
      } catch {
        /* noop */
      }
      return;
    }
    sentinelRef.current = s;
    setActive(true);
    s.addEventListener("release", () => {
      if (sentinelRef.current === s) setActive(false);
    });
  }, []);

  useEffect(() => {
    if (!enabled) return; // nothing to hold — previous cleanup already released
    // fire from a timer callback (not the effect body) so wake-lock
    // promise continuations never run during the render commit
    const t = setTimeout(() => void acquire(), 0);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisibility);
      void release();
    };
  }, [enabled, acquire, release]);

  return active;
}
