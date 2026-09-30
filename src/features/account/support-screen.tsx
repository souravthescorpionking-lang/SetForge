"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SupportScreen — #/account/support (Part 9 §9).
//
//   TopBar (56)  : BackButton (→ More) · "Message support" · TopBarHelp
//   ScrollBody   : Subject (32px label + 48px input, ≤120 chars) · Message
//                  (32px label + textarea min-h 32vh, ≤4000 chars) · hint
//                  prose. Labels mirror the settings SectionHeader style.
//   BottomBar(56): primary "Send message" — disabled until the Zod contract
//                  holds (subject ≥3, body ≥10) or while sending.
//
// Submit → supportApi.create (POST /api/support → SupportTicket). Success
// toasts "Message sent — we'll reply by email" and clears the form; the
// server's 5-per-rolling-24h limit surfaces as a toast with its message.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Screen, TopBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supportApi } from "@/lib/client/api";
import { useOnline } from "@/lib/client/query";
import { supportTicketSchema } from "@/lib/schemas";
import { tourAttrs } from "@/lib/tour/attrs";
import { errorMessage } from "@/features/routines/screen-helpers";

/** 32px section label — muted, uppercase, NOT a data-row (settings precedent). */
function FieldLabel({ children }: { children: string }) {
  return (
    <p className="flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span className="truncate">{children}</span>
    </p>
  );
}

export default function SupportScreen() {
  const online = useOnline();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // The Zod contract IS the gate (same schema the API parses).
  const valid = supportTicketSchema.safeParse({ subject, body }).success;

  const submit = async () => {
    if (!valid || sending) return;
    if (!online) {
      toast.info("Sending a support message needs a connection");
      return;
    }
    setSending(true);
    try {
      await supportApi.create({ subject: subject.trim(), body: body.trim() });
      setSubject("");
      setBody("");
      toast.success("Message sent — we'll reply by email");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/more" label="Back to More" />}
          title="Message support"
          actions={<TopBarHelp />}
        />
      }
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            className="h-11 flex-1 rounded-lg text-sm font-bold"
            disabled={!valid || sending}
            aria-label="Send the support message"
            {...tourAttrs({
              id: "accountSupport.send",
              label: "Send message",
              help: "Send to the team — 5 messages per day, replies by email.",
              order: 30,
            })}
            onClick={() => void submit()}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
            {sending ? "Sending…" : "Send message"}
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody>
        <FieldLabel>Subject</FieldLabel>
        <Input
          type="text"
          className="h-12 w-full flex-none rounded-lg"
          placeholder="What's it about? (3+ characters)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={120}
          autoComplete="off"
          aria-label="Subject"
          {...tourAttrs({
            id: "accountSupport.subject",
            label: "Subject",
            help: "One line summarising your message (3–120 characters).",
            order: 10,
          })}
        />

        <FieldLabel>Message</FieldLabel>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Tell us what happened, what you expected, and what you saw — at least 10 characters."
          maxLength={4000}
          aria-label="Message body"
          {...tourAttrs({
            id: "accountSupport.body",
            label: "Message",
            help: "The full message (10–4000 characters). We reply by email.",
            order: 20,
          })}
          className="min-h-[32vh] w-full flex-none resize-none text-base leading-relaxed"
        />

        <p className="whitespace-normal px-1 text-xs leading-relaxed text-muted-foreground">
          Replies go to your account email. Up to 5 messages per rolling day — the limit keeps the queue
          healthy for everyone.
        </p>
      </ScrollBody>
    </Screen>
  );
}
