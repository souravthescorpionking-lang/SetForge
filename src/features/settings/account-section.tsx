"use client";

// Account section: profile, password change, sign out, account deletion.
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogout } from "@/components/nav-shell";
import { accountApi } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { useOnline } from "@/lib/client/query";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  KeyRound,
  Link2,
  Loader2,
  Lock,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingRow, SectionHeading } from "./settings-controls";

export function AccountSection() {
  const session = useApp((s) => s.session);
  const online = useOnline();
  // captured BEFORE any deletion so the local wipe still runs afterwards
  const logout = useLogout();

  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [delOpen, setDelOpen] = useState(false);
  const [delTyped, setDelTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!pwOpen) {
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setPwError(null);
    }
  }, [pwOpen]);

  useEffect(() => {
    if (!delOpen) setDelTyped("");
  }, [delOpen]);

  if (!session) return null;

  const initials = (session.user.name ?? session.user.email)
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const submitPassword = async () => {
    setPwError(null);
    if (newPw.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("New passwords don't match.");
      return;
    }
    setPwBusy(true);
    try {
      await accountApi.changePassword({ currentPassword: currentPw, newPassword: newPw });
      toast.success("Password changed — other sessions signed out");
      setPwOpen(false);
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "Could not change password");
    } finally {
      setPwBusy(false);
    }
  };

  const confirmDeleteAccount = async () => {
    setDeleting(true);
    try {
      await accountApi.delete();
      toast.success("Account deleted — all data removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete account");
      setDeleting(false);
      return;
    }
    // local wipe + session clear (logout captured before the API call)
    await logout();
  };

  return (
    <>
      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-3">
          <SectionHeading
            icon={<UserRound className="h-4.5 w-4.5" />}
            title="Account"
            description="Your identity, security and danger zone"
          />
        </CardHeader>
        <CardContent className="divide-y divide-border/60 pt-0">
          {/* Profile */}
          <div className="flex items-center gap-4 py-4">
            <Avatar className="h-14 w-14 border-2 border-primary/30">
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                {initials || "SF"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold leading-tight">
                {session.user.name ?? "Athlete"}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                {session.user.email}
              </p>
            </div>
          </div>

          {/* Linked providers */}
          <SettingRow
            icon={<Link2 className="h-4 w-4" />}
            label="Linked providers"
            helper="How you can sign in to this account."
            control={
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <Badge variant="secondary" className="gap-1.5 font-medium">
                  <ShieldCheck className="h-3 w-3 text-primary" /> Email &amp; Password
                </Badge>
                <span className="hidden text-[11px] text-muted-foreground sm:inline">
                  Google OAuth not configured
                </span>
              </div>
            }
          />

          {/* Change password */}
          <SettingRow
            stacked
            icon={<KeyRound className="h-4 w-4" />}
            label="Password"
            helper="Changing your password signs out all other sessions and devices."
            control={
              <Button
                variant="outline"
                disabled={!online}
                onClick={() => setPwOpen(true)}
                className="w-full gap-2 sm:w-auto"
              >
                <KeyRound className="h-4 w-4" />
                Change password
              </Button>
            }
          />

          {/* Sign out */}
          <SettingRow
            icon={<LogOut className="h-4 w-4" />}
            label="Sign out"
            helper="Ends this session and clears offline data stored on this device."
            control={
              <Button variant="secondary" className="gap-2" onClick={() => void logout()}>
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            }
          />
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="rounded-2xl border-destructive/40 bg-destructive/[0.04]">
        <CardHeader className="pb-3">
          <SectionHeading
            icon={<TriangleAlert className="h-4.5 w-4.5 text-destructive" />}
            title="Danger zone"
            description="Irreversible account actions"
          />
        </CardHeader>
        <CardContent className="pt-0">
          <SettingRow
            stacked
            icon={<Trash2 className="h-4 w-4 text-destructive" />}
            label="Delete account"
            helper="Permanently deletes your account and every piece of data in it — workouts, PRs, routines, body logs. This cannot be undone."
            control={
              <Button
                variant="destructive"
                className="w-full gap-2 sm:w-auto"
                disabled={!online}
                onClick={() => setDelOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete account…
              </Button>
            }
          />
        </CardContent>
      </Card>

      {/* Change password dialog */}
      <Dialog open={pwOpen} onOpenChange={(o) => !pwBusy && setPwOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" /> Change password
            </DialogTitle>
            <DialogDescription>
              Minimum 8 characters. Other sessions will be signed out.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              void submitPassword();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="cur-pw">Current password</Label>
              <Input
                id="cur-pw"
                type="password"
                autoComplete="current-password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">New password</Label>
              <Input
                id="new-pw"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
              />
              {newPw.length > 0 && newPw.length < 8 && (
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">Confirm new password</Label>
              <Input
                id="confirm-pw"
                type="password"
                autoComplete="new-password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
              />
              {confirmPw.length > 0 && confirmPw !== newPw && (
                <p className="text-xs text-destructive">Passwords don&apos;t match.</p>
              )}
            </div>
            {pwError && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {pwError}
              </motion.p>
            )}
            <DialogFooter className="gap-2 pt-1 sm:justify-end">
              <Button type="button" variant="outline" disabled={pwBusy} onClick={() => setPwOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pwBusy || !currentPw || newPw.length < 8 || newPw !== confirmPw}
              >
                {pwBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete account dialog */}
      <Dialog open={delOpen} onOpenChange={(o) => !deleting && setDelOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="h-4 w-4" /> Delete account
            </DialogTitle>
            <DialogDescription>
              This permanently removes your account and all of its data from SetForge. There is no
              undo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
              Workouts, personal records, routines, body measurements, plate inventory — everything
              goes. Export a backup first if you might want it back.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="del-account-type" className="text-xs text-muted-foreground">
                Type <span className="font-mono font-semibold text-destructive">DELETE</span> to confirm
              </Label>
              <Input
                id="del-account-type"
                value={delTyped}
                onChange={(e) => setDelTyped(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                className="font-mono tracking-widest"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" disabled={deleting} onClick={() => setDelOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={delTyped.trim().toUpperCase() !== "DELETE" || deleting}
              onClick={() => void confirmDeleteAccount()}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete my account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
