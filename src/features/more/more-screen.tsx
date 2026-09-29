"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MoreScreen — #/more (Part 8 §3.3). The third NavBar tab: a profile header
// row plus the seven secondary destinations.
//
//   TopBar (56)  : "More" + TopBarHelp (no calendar icon on this tab)
//   ScrollBody   : profile row (56) — "{name} · {weight} kg · {level}" from the
//                  shared ["profile"] query + session name; skeleton while it
//                  loads; "Your profile · Set details" fallback until
//                  weight/level are set. Tap → #/profile.
//                  Then 7 destination rows (56 each, rowBar, icon + label +
//                  chevron): Body & photos · Records & stats · Tools ·
//                  Dictionary · Settings · Backup & data · Help & tours.
//
// History/Logs and Exercises/Library moved to the Workout tab (§3.1). Backup &
// data opens #/settings — the settings screen does not read ?tab= yet, so no
// query param is sent. One static tour declaration per row (LAW 2).
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  ChevronRight,
  CircleHelp,
  DatabaseBackup,
  Ruler,
  Settings,
  Trophy,
  UserRound,
  Wrench,
} from "lucide-react";
import { profileApi } from "@/lib/client/api";
import { round1 } from "@/lib/client/format";
import { useApp } from "@/lib/client/store";
import { tourAttrs } from "@/lib/tour/attrs";
import { rowBar } from "@/lib/ui/tokens";
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

export default function MoreScreen() {
  const session = useApp((s) => s.session);
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
              onClick={() => {
                window.location.hash = "#/profile";
              }}
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
            onClick={() => {
              window.location.hash = "#/body";
            }}
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
            onClick={() => {
              window.location.hash = "#/insights";
            }}
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
            onClick={() => {
              window.location.hash = "#/tools";
            }}
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
            onClick={() => {
              window.location.hash = "#/dictionary";
            }}
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
            onClick={() => {
              window.location.hash = "#/settings";
            }}
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
            onClick={() => {
              window.location.hash = "#/settings";
            }}
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

          <button
            type="button"
            data-row
            {...tourAttrs({
              id: "more.help",
              label: "Help & tours",
              help: "Open help topics, shortcuts and screen tours.",
              order: 80,
            })}
            onClick={() => {
              window.location.hash = "#/help";
            }}
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
    </Screen>
  );
}
