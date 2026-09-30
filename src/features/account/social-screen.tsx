"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SocialScreen — #/account/social (Part 9 §9).
//
//   TopBar (56)  : BackButton (→ More) · "Social accounts" · TopBarHelp
//   ScrollBody   : one 56px row per env-configured provider (GET
//                  /api/account/social): initial tile · label · Linked/Not
//                  linked chip · Link/Unlink button (44px). Footnote prose.
//
// This deployment has no OAuth sign-in flow, so `linked` is honestly false and
// Link returns {ok:false} with the server's message (surfaced as a toast) —
// never a faked success. Unlink is a destructive-confirm AlertDialog and
// rejects server-side while nothing is linked. Prose is exempt from nowrap.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link2, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { socialApi } from "@/lib/client/api";
import { useOnline } from "@/lib/client/query";
import { tourAttrs } from "@/lib/tour/attrs";
import { errorMessage } from "@/features/routines/screen-helpers";

type Provider = { id: string; label: string; linked: boolean };

export default function SocialScreen() {
  const online = useOnline();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingUnlink, setPendingUnlink] = useState<Provider | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["account-social"],
    queryFn: () => socialApi.list(),
  });
  const providers: Provider[] = data?.providers ?? [];

  // Link — the server answers honestly; ok:false carries the reason.
  const link = async (provider: Provider) => {
    if (busyId) return;
    if (!online) {
      toast.info("Linking a provider needs a connection");
      return;
    }
    setBusyId(provider.id);
    try {
      const res = await socialApi.link(provider.id);
      // The wire type omits `message`; the server includes it on ok:false.
      const message = (res as { ok: boolean; message?: string }).message;
      if (!res.ok) {
        toast.info(message ?? "Social sign-in is not available on this deployment");
      } else {
        await qc.invalidateQueries({ queryKey: ["account-social"] });
        toast.success(`${provider.label} linked`);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  // Unlink — destructive confirm, then the server rejects while nothing is linked.
  const unlink = async (provider: Provider) => {
    if (busyId) return;
    setBusyId(provider.id);
    try {
      await socialApi.unlink(provider.id);
      await qc.invalidateQueries({ queryKey: ["account-social"] });
      toast.success(`${provider.label} unlinked`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
      setPendingUnlink(null);
    }
  };

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/more" label="Back to More" />}
          title="Social accounts"
          actions={<TopBarHelp />}
        />
      }
    >
      <ScrollBody>
        <section aria-label="Sign-in providers" className="flex flex-col gap-2">
          {isPending ? (
            <>
              <div data-row aria-busy="true" aria-label="Loading providers" className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3">
                <Skeleton className="h-11 w-11 flex-none rounded-lg" />
                <Skeleton className="h-4 w-24" />
                <span className="sr-only">Loading providers…</span>
              </div>
              <div data-row aria-busy="true" aria-label="Loading providers" className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3">
                <Skeleton className="h-11 w-11 flex-none rounded-lg" />
                <Skeleton className="h-4 w-20" />
                <span className="sr-only">Loading providers…</span>
              </div>
            </>
          ) : providers.length === 0 ? (
            <div data-row className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium leading-none text-muted-foreground">
                No social providers configured
              </span>
            </div>
          ) : (
            providers.map((p) => {
              const busy = busyId === p.id;
              return (
                <div
                  key={p.id}
                  data-row
                  className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
                >
                  <span
                    aria-hidden
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-primary/10 text-base font-bold text-primary"
                  >
                    {p.label.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{p.label}</span>
                  {p.linked ? (
                    <Badge variant="secondary" className="flex-none">Linked</Badge>
                  ) : (
                    <Badge variant="outline" className="flex-none text-muted-foreground">Not linked</Badge>
                  )}
                  {p.linked ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 flex-none rounded-lg px-4 text-sm font-semibold text-destructive"
                      disabled={busy}
                      aria-label={`Unlink ${p.label}`}
                      {...tourAttrs({
                        id: "accountSocial.unlink",
                        label: "Unlink",
                        help: "Disconnect this provider after confirming.",
                        order: 30,
                      })}
                      onClick={() => setPendingUnlink(p)}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Unlink className="h-4 w-4" aria-hidden />}
                      Unlink
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 flex-none rounded-lg px-4 text-sm font-semibold"
                      disabled={busy}
                      aria-label={`Link ${p.label}`}
                      {...tourAttrs({
                        id: "accountSocial.link",
                        label: "Link",
                        help: "Connect this provider for sign-in (needs deployment OAuth).",
                        order: 20,
                      })}
                      onClick={() => void link(p)}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
                      Link
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </section>

        <p className="whitespace-normal px-1 text-sm leading-relaxed text-muted-foreground">
          Social sign-in is available when the deployment configures OAuth providers. Until then, use your
          email and password — your account works exactly the same.
        </p>
      </ScrollBody>

      {/* unlink — destructive confirm (modals are only for destructive confirms) */}
      <AlertDialog open={pendingUnlink !== null} onOpenChange={(open) => !open && setPendingUnlink(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink {pendingUnlink?.label ?? "provider"}?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer be able to sign in with this provider. Your account and data stay
              untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (pendingUnlink) void unlink(pendingUnlink);
              }}
            >
              <Unlink className="h-4 w-4" aria-hidden /> Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
