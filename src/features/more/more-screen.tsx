"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MoreScreen — #/more (Part 8 §3.3 + Part 9 §9). The third NavBar tab.
//
//   TopBar (56)  : "More" + TopBarHelp (no calendar icon on this tab)
//   ScrollBody   : profile row (56) — "{name} · {weight} kg · {level}" from the
//                  shared ["profile"] query + session name; skeleton while it
//                  loads; "Your profile · Set details" fallback until
//                  weight/level are set. Tap → #/profile.
//                  Then the Part 8 destination rows (56 each): Body & photos ·
//                  Records & stats · Tools · Dictionary · Settings ·
//                  Backup & data.
//                  ACCOUNT section (32px header) — Part 9 §9 rows:
//                  Manage notifications · Manage subscription · Message
//                  support · Social accounts · Invite friends (share/copy) ·
//                  Privacy policy · Terms · Sign out (confirm modal) ·
//                  Delete account (destructive tint).
//                  Help & tours closes the list.
//
// History/Logs and Exercises/Library moved to the Workout tab (§3.1). Backup &
// data opens #/settings — the settings screen does not read ?tab= yet, so no
// query param is sent. One static tour declaration per row (LAW 2).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BellRing,
  BookOpen,
  ChevronRight,
  CircleHelp,
  CreditCard,
  DatabaseBackup,
  FileText,
  LifeBuoy,
  LogOut,
  Ruler,
  Settings,
  ShieldCheck,
  Trash2,
  Trophy,
  UserPlus,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { authApi, profileApi } from "@/lib/client/api";
import { round1 } from "@/lib/client/format";
import { wipeLocalData } from "@/lib/client/offline";
import { useApp } from "@/lib/client/store";
import { tourAttrs } from "@/lib/tour/attrs";
import { rowBar } from "@/lib/ui/tokens";
import { clearSwCaches } from "@/components/shared/pwa";
import { cn } from "@/lib/utils";

// 56px single-line row (tokens.rowBar) + the card chrome shared by every row.
// gap-2 (8px — the rowBar+gap-2 precedent from tip-row) keeps the profile
// string on one line down to 320px.
const ROW_CLASS = cn(
  rowBar,
  "w-full gap-2 rounded-lg border bg-card px-3 text-left",
  "transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
);

// 44px icon tile — keeps every row's touch target comfortable.
const ICON_TILE =
  "flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary";

// Destructive variant (sign out / delete account) — same 56px geometry.
const ROW_DESTRUCTIVE = cn(ROW_CLASS, "border-destructive/30");
const TILE_DESTRUCTIVE =
  "flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-destructive/10 text-destructive";

// profile.level is stored uppercase (PROFILE_LEVELS); label it like the
// profile screen does, with a safe capitalisation for unknown values.
const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

function levelLabel(raw: string): string {
  return LEVEL_LABELS[raw] ?? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** 32px section header — muted, uppercase, NOT a data-row (settings precedent). */
function SectionHeader({ title }: { title: string }) {
  return (
    <p className="flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span className="truncate">{title}</span>
    </p>
  );
}

/** §9 Invite friends — Web Share API with a clipboard-write fallback. */
async function inviteFriends(): Promise<void> {
  const url = window.location.origin;
  const shareData = { title: "SetForge", text: "Train with me on SetForge", url };
  // navigator.share is optional at runtime (Safari/Chrome only) — feature-detect.
  const nav = navigator as Navigator & {
    share?: (data: { title: string; text: string; url: string }) => Promise<void>;
    canShare?: (data?: { title: string; text: string; url: string }) => boolean;
  };
  if (typeof nav.share === "function" && nav.canShare?.(shareData) !== false) {
    try {
      await nav.share(shareData);
      return; // shared (or dismissed) — nothing else to do
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // user cancelled
      // any other share failure falls through to the clipboard fallback
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  } catch {
    toast.error("Could not copy the link");
  }
}

export default function MoreScreen() {
  const session = useApp((s) => s.session);
  const setSession = useApp((s) => s.setSession);
  const qc = useQueryClient();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const { data: profile, isPending } = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileApi.get(),
    enabled: Boolean(session),
  });

  // §3.3 profile row text: "{name} · {weight} kg · {level}". Falls back to
  // "Your profile · Set details" while weight/level are missing.
  const name = session?.user.name?.trim() || null;
  const weightPart = profile?.weightKg != null ? `${round1(profile.weightKg)} kg` : null;
  const levelPart = profile?.level != null ? levelLabel(profile.level) : null;
  const detailsReady = weightPart != null && levelPart != null;
  const lead = detailsReady ? (name ?? "Your profile") : "Your profile";
  const tail = detailsReady ? `${weightPart} · ${levelPart}` : "Set details";

  // §9 Sign out — same flow as the settings/profile screens: server logout,
  // SW caches cleared, local data wiped, query cache dropped, session nulled
  // (the app-shell gate then forces #/auth).
  const signOut = async () => {
    try {
      await authApi.logout();
    } finally {
      clearSwCaches();
      wipeLocalData();
      qc.clear();
      setSession(null);
      toast.success("Signed out — local data cleared");
    }
  };

  const go = (hash: string) => {
    window.location.hash = hash;
  };

  return (
    <Screen topBar={<TopBar title="More" actions={<TopBarHelp />} />}>
      <ScrollBody>
        <nav aria-label="More destinations" className="flex flex-col gap-2">
          {isPending ? (
            <div data-row aria-busy="true" aria-label="Loading profile" className={ROW_CLASS}>
              <Skeleton className="h-11 w-11 flex-none rounded-lg" />
              <Skeleton className="h-4 w-40" />
              <span className="sr-only">Loading profile…</span>
            </div>
          ) : (
            <button
              type="button"
              data-row
              {...tourAttrs({
                id: "more.profile",
                label: "Profile",
                help: "Open your profile: name, body weight and experience level.",
                order: 10,
              })}
              onClick={() => go("#/profile")}
              className={ROW_CLASS}
            >
              <span className={ICON_TILE}>
                <UserRound className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm leading-none">
                <span className="font-semibold">{lead}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {tail}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
            </button>
          )}

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.body",
              label: "Body & photos",
              help: "Open body measurements and progress photos.",
              order: 20,
            })}
            onClick={() => go("#/body")}
            className={ROW_CLASS}
          >
            <span className={ICON_TILE}>
              <Ruler className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
              Body &amp; photos
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          </button>

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.records",
              label: "Records & stats",
              help: "Open personal records, rolling stats and goals.",
              order: 30,
            })}
            onClick={() => go("#/insights")}
            className={ROW_CLASS}
          >
            <span className={ICON_TILE}>
              <Trophy className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
              Records &amp; stats
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          </button>

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.tools",
              label: "Tools",
              help: "Open the 1RM, plates, pace and interval timer tools.",
              order: 40,
            })}
            onClick={() => go("#/tools")}
            className={ROW_CLASS}
          >
            <span className={ICON_TILE}>
              <Wrench className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">Tools</span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          </button>

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.dictionary",
              label: "Dictionary",
              help: "Open the training terms and methods glossary.",
              order: 50,
            })}
            onClick={() => go("#/dictionary")}
            className={ROW_CLASS}
          >
            <span className={ICON_TILE}>
              <BookOpen className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
              Dictionary
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          </button>

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.settings",
              label: "Settings",
              help: "Open preferences, display and account settings.",
              order: 60,
            })}
            onClick={() => go("#/settings")}
            className={ROW_CLASS}
          >
            <span className={ICON_TILE}>
              <Settings className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
              Settings
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          </button>

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.backup",
              label: "Backup & data",
              help: "Open settings to back up and manage your data.",
              order: 70,
            })}
            onClick={() => go("#/settings")}
            className={ROW_CLASS}
          >
            <span className={ICON_TILE}>
              <DatabaseBackup className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
              Backup &amp; data
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          </button>

          {/* ── Part 9 §9 — ACCOUNT cluster ─────────────────────────────── */}
          <SectionHeader title="Account" />

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.notifications",
              label: "Manage notifications",
              help: "Open settings to tune reminders and notification switches.",
              order: 90,
            })}
            onClick={() => go("#/settings")}
            className={ROW_CLASS}
          >
            <span className={ICON_TILE}>
              <BellRing className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
              Manage notifications
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          </button>

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.subscription",
              label: "Manage subscription",
              help: "Your plan and billing status (Free plan, no billing wired).",
              order: 100,
            })}
            onClick={() => go("#/account/subscription")}
            className={ROW_CLASS}
          >
            <span className={ICON_TILE}>
              <CreditCard className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
              Manage subscription
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          </button>

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.support",
              label: "Message support",
              help: "Send the team a message — up to 5 per day, replies by email.",
              order: 110,
            })}
            onClick={() => go("#/account/support")}
            className={ROW_CLASS}
          >
            <span className={ICON_TILE}>
              <LifeBuoy className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
              Message support
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          </button>

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.social",
              label: "Social accounts",
              help: "Linked sign-in providers for this account.",
              order: 120,
            })}
            onClick={() => go("#/account/social")}
            className={ROW_CLASS}
          >
            <span className={ICON_TILE}>
              <Users className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
              Social accounts
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          </button>

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.invite",
              label: "Invite friends",
              help: "Share your SetForge link — or copy it to the clipboard.",
              order: 130,
            })}
            onClick={() => void inviteFriends()}
            className={ROW_CLASS}
          >
            <span className={ICON_TILE}>
              <UserPlus className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
              Invite friends
            </span>
          </button>

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.privacy",
              label: "Privacy policy",
              help: "How SetForge stores and protects your training data.",
              order: 140,
            })}
            onClick={() => go("#/account/privacy")}
            className={ROW_CLASS}
          >
            <span className={ICON_TILE}>
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
              Privacy policy
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          </button>

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.terms",
              label: "Terms",
              help: "The terms of service for using SetForge.",
              order: 150,
            })}
            onClick={() => go("#/account/terms")}
            className={ROW_CLASS}
          >
            <span className={ICON_TILE}>
              <FileText className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">Terms</span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          </button>

          {/* sign out — confirm-destructive (settings/profile screen pattern) */}
          <button
            type="button"
            data-row
            aria-label="Sign out"
            {...tourAttrs({
              id: "more.signOut",
              label: "Sign out",
              help: "End the session and clear offline data on this device.",
              order: 160,
            })}
            onClick={() => setSignOutOpen(true)}
            className={ROW_DESTRUCTIVE}
          >
            <span className={TILE_DESTRUCTIVE}>
              <LogOut className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none text-destructive">
              Sign out
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-destructive/70" aria-hidden />
          </button>

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.delete",
              label: "Delete account",
              help: "Soft-delete the account, anonymize data, purge after 30 days.",
              order: 170,
            })}
            onClick={() => go("#/account/delete")}
            className={ROW_DESTRUCTIVE}
          >
            <span className={TILE_DESTRUCTIVE}>
              <Trash2 className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none text-destructive">
              Delete account
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-destructive/70" aria-hidden />
          </button>

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.help",
              label: "Help & tours",
              help: "Open help topics, shortcuts and screen tours.",
              order: 180,
            })}
            onClick={() => go("#/help")}
            className={ROW_CLASS}
          >
            <span className={ICON_TILE}>
              <CircleHelp className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
              Help &amp; tours
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          </button>
        </nav>
      </ScrollBody>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              This ends your session and clears offline data stored on this device. You can sign back in
              any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setSignOutOpen(false);
                void signOut();
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
