"use client";

// App navigation: desktop sidebar + mobile top bar & bottom tab bar (sticky footer).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useApp, type RouteView } from "@/lib/client/store";
import { authApi } from "@/lib/client/api";
import { wipeLocalData, outboxCount, isOnline } from "@/lib/client/offline";
import { clearSwCaches, useInstallPrompt } from "@/components/shared/pwa";
import { useQueryClient } from "@tanstack/react-query";
import {
  Flame,
  CalendarDays,
  History,
  Dumbbell,
  RoutineIcon,
  MoreHorizontal,
  Settings,
  LogOut,
  UserRound,
  Ruler,
  BarChart3,
  Calculator,
  WifiOff,
  Trophy,
  MonitorSmartphone,
} from "@/lib/nav-icons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type NavItem = {
  view: RouteView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean; // shown in bottom bar
};

const NAV: NavItem[] = [
  { view: "today", label: "Today", icon: Flame, primary: true },
  { view: "calendar", label: "Calendar", icon: CalendarDays, primary: true },
  { view: "history", label: "History", icon: History, primary: true },
  { view: "exercises", label: "Exercises", icon: Dumbbell, primary: true },
  { view: "routines", label: "Routines", icon: RoutineIcon },
  { view: "body", label: "Body", icon: Ruler },
  { view: "insights", label: "Insights", icon: BarChart3 },
  { view: "tools", label: "Tools", icon: Calculator },
  { view: "settings", label: "Settings", icon: Settings },
];

export function useLogout() {
  const setSession = useApp((s) => s.setSession);
  const qc = useQueryClient();
  return async () => {
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
}

export function TopBar({ children }: { children?: React.ReactNode }) {
  const session = useApp((s) => s.session);
  const navigate = useApp((s) => s.navigate);
  const logout = useLogout();
  const online = isOnline();
  const pending = outboxCount();
  const { canInstall, installed, promptInstall } = useInstallPrompt();

  if (!session) return null;
  const initials = (session.user.name ?? session.user.email)
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-3">
        <button
          className="flex items-center gap-2.5 lg:hidden"
          onClick={() => navigate("/today")}
          aria-label="SetForge home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Flame className="h-4.5 w-4.5" />
          </span>
          <span className="font-black text-lg tracking-tight">SetForge</span>
        </button>
        <div className="flex-1" />
        {children}
        {(!online || pending > 0) && (
          <span
            className={cn(
              "hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              !online ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" : "border-border bg-muted text-muted-foreground",
            )}
            title={!online ? "Offline — changes are queued" : `${pending} change(s) queued`}
          >
            <WifiOff className="h-3 w-3" />
            {!online ? "Offline" : `${pending} queued`}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
              <Avatar className="h-9 w-9 border-2 border-primary/30">
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                  {initials || "SF"}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="truncate font-semibold">{session.user.name ?? "Athlete"}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{session.user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <UserRound className="h-4 w-4" /> Account & settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/insights")}>
              <Trophy className="h-4 w-4" /> Records & stats
            </DropdownMenuItem>
            {canInstall && !installed && (
              <DropdownMenuItem onClick={() => void promptInstall()}>
                <MonitorSmartphone className="h-4 w-4" /> Install app
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function Sidebar() {
  const route = useApp((s) => s.route);
  const navigate = useApp((s) => s.navigate);
  const session = useApp((s) => s.session);
  if (!session) return null;

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col border-r bg-sidebar z-40">
      <div className="h-16 flex items-center gap-2.5 px-5 border-b">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <Flame className="h-5 w-5" />
        </span>
        <div>
          <p className="font-black text-lg leading-none tracking-tight">SetForge</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Workout tracker</p>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 scroll-slim overflow-y-auto" aria-label="Main">
        {NAV.map((item) => {
          const active = route.view === item.view;
          return (
            <button
              key={item.view}
              onClick={() => navigate(`/${item.view}`)}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="h-4.5 w-4.5" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="border-t p-4">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-9 w-9 border border-border/60">
            <AvatarFallback className="bg-primary/10 text-xs font-black text-primary">
              {(session.user.name ?? session.user.email).slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{session.user.name ?? session.user.email}</p>
            <p className="truncate text-[11px] text-muted-foreground">{session.user.email}</p>
          </div>
        </div>
        <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          v1.0 · offline-ready PWA
        </p>
      </div>
    </aside>
  );
}

export function BottomNav() {
  const route = useApp((s) => s.route);
  const navigate = useApp((s) => s.navigate);
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = NAV.filter((n) => n.primary);
  const others = NAV.filter((n) => !n.primary);
  const moreActive = others.some((o) => o.view === route.view);
  const { canInstall, installed, promptInstall } = useInstallPrompt();

  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur-md safe-bottom"
    >
      <div className="mx-auto max-w-md grid grid-cols-5">
        {primary.map((item) => {
          const active = route.view === item.view;
          return (
            <button
              key={item.view}
              onClick={() => navigate(`/${item.view}`)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2.5 min-h-[60px] transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className={cn("h-5 w-5", active && "drop-shadow-sm")} />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </button>
          );
        })}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2.5 min-h-[60px] transition-colors",
                moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] font-semibold">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl pb-8">
            <SheetHeader className="pb-2">
              <SheetTitle className="text-base">More</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-2 px-1">
              {others.map((item) => (
                <button
                  key={item.view}
                  onClick={() => {
                    navigate(`/${item.view}`);
                    setMoreOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3.5 text-sm font-medium transition-colors",
                    route.view === item.view
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <item.icon className="h-4.5 w-4.5" />
                  {item.label}
                </button>
              ))}
            </div>
            {canInstall && !installed && (
              <button
                onClick={() => {
                  setMoreOpen(false);
                  void promptInstall();
                }}
                className="mx-1 mt-3 flex w-[calc(100%-8px)] items-center gap-3 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-transform active:scale-[0.98]"
              >
                <MonitorSmartphone className="h-4.5 w-4.5" />
                <span className="flex-1 text-left">Install SetForge</span>
                <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">Offline-ready</span>
              </button>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

export { NAV };
