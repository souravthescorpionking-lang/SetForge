"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PrivacyPolicyScreen — #/account/privacy (Part 9 §9). Static markdown prose
// rendered with react-markdown inside a card. Prose blocks are exempt from the
// single-line nowrap law (no data-rows on this screen).
// ─────────────────────────────────────────────────────────────────────────────

import ReactMarkdown from "react-markdown";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { MD_PROSE_COMPONENTS } from "./md-prose";

const PRIVACY_MD = `
## What we store

SetForge stores the data you enter to train: your account email and name,
workouts and sets, programs and sessions, body measurements, personal records,
and the progress photos you upload.

## Where it lives

Your data belongs to your account on this SetForge deployment. A local offline
copy is cached on your device so you can log workouts without a connection;
signing out clears that copy from the device.

## Photos and media

Progress photos are stored against your account only. Deleting a photo removes
it from the timeline, and deleting your account purges every photo during the
permanent cleanup after the 30-day grace period.

## Export and portability

Everything can leave at any time. Settings → Backup & data offers a full JSON
backup and CSV exports of your workout history and body measurements, so you
are never locked in.

## Deleting your account

Deleting is a two-step design. Immediately: your email is anonymized, your
name cleared and all sessions destroyed. After 30 days the account and all its
data are purged permanently from the database.

## Support messages

Messages you send from More → Message support are stored so the team can reply
to your account email (limited to 5 per day). They follow the same deletion
rules as the rest of your data.

## No ads, no trackers, no data selling

SetForge shows no ads, embeds no third-party trackers and never sells or shares
your personal data. Analytics, if ever added, will be aggregate-only and
documented here first.

## Changes to this policy

If this policy changes materially, the in-app announcement and the version
line below will say so. Continued use after a change means you accept it.

*Version 1 — Part 9.*
`;


export default function PrivacyPolicyScreen() {
  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/more" label="Back to More" />}
          title="Privacy policy"
          actions={<TopBarHelp />}
        />
      }
    >
      <ScrollBody>
        <article
          aria-label="Privacy policy"
          className="whitespace-normal rounded-lg border bg-card p-4"
        >
          <ReactMarkdown components={MD_PROSE_COMPONENTS}>{PRIVACY_MD}</ReactMarkdown>
        </article>
      </ScrollBody>
    </Screen>
  );
}
