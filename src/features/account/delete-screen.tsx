"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DeleteAccountScreen — #/account/delete (Part 9 §9).
//
//   TopBar (56)  : BackButton (→ More) · "Delete account" · TopBarHelp
//   ScrollBody   : warning card (prose, destructive 4px left bar) explaining
//                  the SOFT delete: email anonymized + name cleared + signed
//                  out everywhere now, data purged permanently after a 30-day
//                  grace period. Then a 56px input row — "Type DELETE to
//                  confirm" with an uppercase check.
//   BottomBar(56): primary DESTRUCTIVE "Delete my account" — disabled until
//                  the typed word matches. Typing DELETE IS the confirmation
//                  (no second modal — LAW: modals only for destructive
//                  confirms, and this one is already explicit).
//
// Submit → accountDeleteApi.delete (POST /api/account/delete): the server
// soft-deletes + destroys sessions + clears the cookie; the client then wipes
// local state exactly like sign-out (SW caches, offline data, query cache,
// session) and the app-shell gate forces #/auth. Prose is exempt from nowrap.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { accountDeleteApi } from "@/lib/client/api";
import { wipeLocalData } from "@/lib/client/offline";
import { useApp } from "@/lib/client/store";
import { useOnline } from "@/lib/client/query";
import { tourAttrs } from "@/lib/tour/attrs";
import { clearSwCaches } from "@/components/shared/pwa";
import { errorMessage } from "@/features/routines/screen-helpers";

export default function DeleteAccountScreen() {
  const online = useOnline();
  const setSession = useApp((s) => s.setSession);
  const qc = useQueryClient();
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Uppercase check — forgiving of keyboard autocapitalisation.
  const confirmed = typed.trim().toUpperCase() === "DELETE";

  const submit = async () => {
    if (!confirmed || deleting) return;
    if (!online) {
      toast.info("Deleting your account needs a connection");
      return;
    }
    setDeleting(true);
    try {
      await accountDeleteApi.delete();
      // The server destroyed the sessions and cleared the cookie — mirror the
      // sign-out wipe locally; the app-shell gate then forces #/auth.
      clearSwCaches();
      wipeLocalData();
      qc.clear();
      setSession(null);
      toast.success("Account deleted", {
        description: "Data is purged permanently after a 30-day grace period.",
      });
    } catch (e) {
      toast.error(errorMessage(e));
      setDeleting(false);
    }
  };

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/more" label="Back to More" />}
          title="Delete account"
          actions={<TopBarHelp />}
        />
      }
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            variant="destructive"
            className="h-11 flex-1 rounded-lg text-sm font-bold"
            disabled={!confirmed || deleting}
            aria-label="Delete my account"
            {...tourAttrs({
              id: "accountDelete.submit",
              label: "Delete account",
              help: "Soft-delete now; data is purged after the 30-day grace period.",
              order: 30,
            })}
            onClick={() => void submit()}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden />
            )}
            {deleting ? "Deleting…" : "Delete my account"}
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody>
        {/* Warning card — destructive 4px left bar; prose (whitespace-normal). */}
        <section
          aria-label="What deleting does"
          className="whitespace-normal rounded-lg border border-l-4 border-l-destructive border-destructive/30 bg-card p-4"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 flex-none text-destructive" aria-hidden />
            <p className="text-base font-bold leading-none text-destructive">Delete your account</p>
          </div>
          <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-foreground/90">
            <p>
              Deleting is immediate and serious. Right away: your email is anonymized, your name is
              cleared, every session is destroyed and you are signed out on all devices. You cannot sign
              back in.
            </p>
            <p>
              Your workouts, programs, measurements and photos are kept hidden for a 30-day grace period
              in case of an accidental deletion — then the account and all its data are purged
              permanently. Nothing is recoverable after that.
            </p>
            <p className="font-semibold">
              Prefer a clean slate without losing history? Settings → Backup &amp; data can export
              everything first.
            </p>
          </div>
        </section>

        {/* Typed confirmation — 56px input row, uppercase check. */}
        <div
          data-row
          className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
        >
          <label htmlFor="delete-confirm" className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
            Type DELETE to confirm
          </label>
          <Input
            id="delete-confirm"
            type="text"
            className="h-10 w-28 flex-none rounded-lg text-center text-sm font-bold tracking-widest"
            placeholder="DELETE"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Type DELETE to confirm"
            {...tourAttrs({
              id: "accountDelete.confirmInput",
              label: "Confirm field",
              help: "Type DELETE (uppercase word) to unlock the delete button.",
              order: 20,
            })}
          />
        </div>
      </ScrollBody>
    </Screen>
  );
}
