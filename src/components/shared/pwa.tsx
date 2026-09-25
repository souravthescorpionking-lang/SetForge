"use client";

// PWA glue: service-worker registration, update handling, install prompt,
// and offline-cache management. Mounted once from AppRoot.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/** Ask the active service worker to drop every cache (call on logout/login swap). */
export function clearSwCaches(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready.then((reg) => {
    reg.active?.postMessage({ type: "CLEAR_CACHES" });
  }).catch(() => {});
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** True when the app is running as an installed PWA (not a plain browser tab). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Captures the browser install prompt. `canInstall` flips true when the app
 *  is installable and not yet installed; `promptInstall()` shows the dialog. */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
      toast.success("SetForge installed", {
        description: "Find it on your home screen — it works offline too.",
      });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "dismissed") return false;
    setDeferred(null);
    return true;
  }, [deferred]);

  return {
    canInstall: !!deferred,
    promptInstall,
    installed: installed || isStandalone(),
  };
}

/** Registers /sw.js and keeps it fresh; exposes nothing — mount and forget. */
export function PwaBridge() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // Push an updated SW through as soon as it lands.
          reg.addEventListener("updatefound", () => {
            const sw = reg.installing;
            sw?.addEventListener("statechange", () => {
              if (sw.state === "installed" && navigator.serviceWorker.controller) {
                sw.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch(() => {
          /* SW is a progressive enhancement — never break the app over it. */
        });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  // One-shot reload when a new worker takes control (after SKIP_WAITING).
  useEffect(() => {
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return null;
}
