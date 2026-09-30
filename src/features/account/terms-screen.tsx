"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TermsScreen — #/account/terms (Part 9 §9). Static markdown prose rendered
// with react-markdown inside a card. Prose blocks are exempt from the
// single-line nowrap law (no data-rows on this screen).
// ─────────────────────────────────────────────────────────────────────────────

import ReactMarkdown from "react-markdown";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { MD_PROSE_COMPONENTS } from "./md-prose";

const TERMS_MD = `
## Accepting these terms

By creating an account and using SetForge you agree to these terms. If you do
not agree, do not use the service — and use More → Delete account to remove
your data.

## What the service is

SetForge is a training log: programs, workout logging, records and body
tracking. It is a tool for your own training decisions. It is **not** medical
advice, injury diagnosis or a substitute for a qualified coach or clinician.

## Your content

Workouts, notes, programs and photos you add are yours. You grant SetForge
only the limited licence needed to store, back up and display them to you.
Nothing you upload is used to train models or shared with third parties.

## License and attribution

The app is provided for your personal training use. Exercise reference data
(including the built-in library and catalogue) is curated content — respect its
attribution when reusing it elsewhere. You may export and reuse your own data
freely (Settings → Backup & data).

## Acceptable use

Do not attempt to break the service, overload it, scrape other users' data or
use SetForge to harass anyone. Accounts that do may be suspended.

## Availability

We aim for a reliable service with offline logging and scheduled backups, but
we do not promise uninterrupted availability. Keep your own backups — the
export tools exist exactly for that.

## No warranty

The service is provided **as is**, without warranties of any kind. Estimated
one-rep maxes, progression suggestions and volume statistics are estimates,
not guarantees; use your own judgement when lifting.

## Liability

To the maximum extent permitted by law, SetForge's liability for any claim
relating to the service is limited to the amount you paid for it — which, on
the Free plan, is zero.

## Changes and termination

These terms may evolve with the app; material changes are announced in-app.
You may close your account at any time (More → Delete account). We may purge
abandoned or deleted accounts as described in the privacy policy.

*Version 1 — Part 9.*
`;


export default function TermsScreen() {
  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/more" label="Back to More" />}
          title="Terms"
          actions={<TopBarHelp />}
        />
      }
    >
      <ScrollBody>
        <article aria-label="Terms of service" className="whitespace-normal rounded-lg border bg-card p-4">
          <ReactMarkdown components={MD_PROSE_COMPONENTS}>{TERMS_MD}</ReactMarkdown>
        </article>
      </ScrollBody>
    </Screen>
  );
}
