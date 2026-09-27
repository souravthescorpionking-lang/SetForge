"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Daily workout reminder (Part 5).
//
// Contract:
//   • armDailyReminder("HH:MM") — arms a next-occurrence reminder for the given
//     local time. Uses the Notification Trigger API when the browser supports
//     it (Chrome installed-PWA); otherwise a plain setTimeout that only lives
//     while the tab is open, re-armed on visibilitychange.
//   • armDailyReminder(null) — disarms everything (reminders off / logout).
//   • NEVER more than 1 notification per local day: the last fired date is
//     persisted in localStorage and checked before every fire.
//   • If the app opens AFTER today's reminder time has passed and nothing has
//     fired yet today, fire once on that open (the "catch-up" path).
//   • Notification body: "Your workout day is ready". Tap → focus the app and
//     navigate to #/home.
//
// No service-worker push: this is a best-effort local reminder only.
// ─────────────────────────────────────────────────────────────────────────────

const FIRED_KEY_PREFIX = "setforge:reminder-fired:";
const ARMED_KEY = "setforge:reminder-armed";

let timeoutId: ReturnType<typeof setTimeout> | null = null;
let armedTime: string | null = null;

function localDayStamp(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firedToday(): boolean {
  try {
    return localStorage.getItem(FIRED_KEY_PREFIX + localDayStamp()) === "1";
  } catch {
    return false;
  }
}

function markFired(): void {
  try {
    localStorage.setItem(FIRED_KEY_PREFIX + localDayStamp(), "1");
    // opportunistic cleanup of stale day keys (keep the store tiny)
    const keep = localDayStamp();
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(FIRED_KEY_PREFIX) && k !== FIRED_KEY_PREFIX + keep) stale.push(k);
    }
    stale.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable — reminder dedupe degrades gracefully */
  }
}

function fireNotification(): void {
  if (firedToday()) return; // max 1/day, no matter how many paths reach here
  try {
    const n = new Notification("SetForge", {
      body: "Your workout day is ready",
      tag: "setforge-daily-reminder", // replaces any earlier twin
    });
    n.onclick = () => {
      window.focus();
      window.location.hash = "#/home";
      n.close();
    };
    markFired();
  } catch {
    // Notification constructor unavailable (permissions/old browser) — mark so
    // we don't retry-loop; the catch-up path would spam otherwise.
    markFired();
  }
}

function supportsShowTrigger(): boolean {
  try {
    return "showTrigger" in new Notification("SetForge");
  } catch {
    return false;
  }
}

/** ms from now until the next local occurrence of HH:MM (0 if invalid). */
function msUntilNext(timeStr: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!m) return 0;
  const hh = Math.min(23, Number(m[1]));
  const mm = Math.min(59, Number(m[2]));
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

/** Local "HH:MM" has already passed today (and nothing fired yet)? */
function alreadyPassedToday(timeStr: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!m) return false;
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(m[1]), Number(m[2]));
  return target.getTime() <= now.getTime();
}

function clearTimer(): void {
  if (timeoutId != null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}

function armTimer(timeStr: string): void {
  clearTimer();
  if (supportsShowTrigger()) {
    // Notification Trigger API: the browser fires it even if the tab closes
    // (installed PWA). We still mark not-fired; onclick focuses the app.
    try {
      const fireAt = new Date(Date.now() + msUntilNext(timeStr));
      const opts = {
        body: "Your workout day is ready",
        tag: "setforge-daily-reminder",
        showTrigger: fireAt,
      } as NotificationOptions & { showTrigger?: Date };
      const n = new Notification("SetForge", opts);
      n.onclick = () => {
        window.focus();
        window.location.hash = "#/home";
        markFired();
        n.close();
      };
      return;
    } catch {
      /* fall through to the timer path */
    }
  }
  timeoutId = setTimeout(() => {
    fireNotification();
    armTimer(timeStr); // re-arm for tomorrow
  }, msUntilNext(timeStr));
}

/** Arm/disarm the daily reminder. Call on session load + settings change. */
export function armDailyReminder(timeStr: string | null | undefined): void {
  clearTimer();
  armedTime = null;
  try {
    localStorage.removeItem(ARMED_KEY);
  } catch {
    /* ignore */
  }
  if (!timeStr) return;
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  armedTime = timeStr;
  try {
    localStorage.setItem(ARMED_KEY, timeStr);
  } catch {
    /* ignore */
  }

  // catch-up: the scheduled time already passed today and nothing fired yet
  if (alreadyPassedToday(timeStr) && !firedToday()) {
    fireNotification();
  }
  armTimer(timeStr);
}

/** Request permission for reminders. Returns the granted state. */
export async function requestReminderPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  try {
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Re-arm on tab visibility change (the setTimeout only lives while open). */
export function rearmOnVisible(): void {
  if (document.visibilityState === "visible" && armedTime) {
    armDailyReminder(armedTime);
  }
}

/** Currently armed reminder time (null when off/unknown). */
export function currentReminderTime(): string | null {
  if (armedTime) return armedTime;
  try {
    return localStorage.getItem(ARMED_KEY);
  } catch {
    return null;
  }
}
