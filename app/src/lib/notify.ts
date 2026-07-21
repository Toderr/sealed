import { supabase, table } from "@/lib/supabase";

export async function queueNotification(
  recipientWallet: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Try email channel if user has a verified email
  const { data: user } = await supabase
    .from(table("users"))
    .select("email, email_verified, telegram_chat_id, notify_on")
    .eq("wallet", recipientWallet)
    .single();

  if (!user) return;

  const u = user as {
    email: string | null;
    email_verified: boolean;
    telegram_chat_id: string | null;
    notify_on: Record<string, boolean>;
  };

  if (!u.notify_on?.[eventType]) return;

  const channels: string[] = [];
  if (u.email && u.email_verified) channels.push("email");
  if (u.telegram_chat_id) channels.push("telegram");

  for (const channel of channels) {
    await supabase.from(table("notification_queue")).insert({
      recipient_wallet: recipientWallet,
      channel,
      event_type: eventType,
      payload,
      status: "pending",
    });
  }
}

export async function drainQueue(): Promise<{ sent: number; failed: number }> {
  // When email isn't configured, EXCLUDE email rows from the batch entirely.
  // Otherwise stuck email rows (left pending, never sendable) fill the LIMIT 50
  // window on every drain and starve sendable channels (e.g. telegram) — a
  // head-of-line block on the whole queue. Skipping them keeps the queue moving;
  // they resume sending once the key is set.
  let query = supabase
    .from(table("notification_queue"))
    .select("*")
    .eq("status", "pending");
  if (!emailConfigured()) {
    query = query.neq("channel", "email");
  }
  const { data: pending } = await query
    .order("created_at", { ascending: true })
    .limit(50);

  if (!pending || pending.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const row of pending as Array<{
    id: string;
    recipient_wallet: string;
    channel: string;
    event_type: string;
    payload: Record<string, unknown>;
  }>) {
    try {
      if (row.channel === "email") {
        await sendEmailForEvent(row.recipient_wallet, row.event_type, row.payload);
      }
      // Telegram: reserved, no-op for now

      await supabase
        .from(table("notification_queue"))
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent++;
    } catch (err) {
      // If email simply isn't configured yet, DON'T burn the row to "failed"
      // (nothing ever resets failed → pending, so it'd never send once the key
      // is added). Leave it pending so a later drain retries it.
      if (err instanceof EmailNotConfiguredError) {
        failed++;
        continue;
      }
      await supabase
        .from(table("notification_queue"))
        .update({ status: "failed" })
        .eq("id", row.id);
      failed++;
    }
  }

  return { sent, failed };
}

async function sendEmailForEvent(
  wallet: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { data: user } = await supabase
    .from(table("users"))
    .select("email, handle")
    .eq("wallet", wallet)
    .single();

  if (!user) return;
  const u = user as { email: string | null; handle: string };
  if (!u.email) return;

  const { subject, html } = buildEmailContent(u.handle, eventType, payload);
  await sendEmail(u.email, subject, html);
}

function buildEmailContent(
  handle: string,
  eventType: string,
  payload: Record<string, unknown>
): { subject: string; html: string } {
  const dealId = payload.deal_id as string | undefined;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  // An explicit href on the payload wins (non-deal events like friend requests
  // point at a profile, not a deal). Otherwise: renegotiation reopens terms in
  // the negotiate room; other deal events go to the review page. Fall back to
  // the board when there's no deal id.
  const href = typeof payload.href === "string" ? payload.href : null;
  const ctaUrl = href
    ? `${base}${href}`
    : dealId
    ? eventType === "renegotiation_escalated"
      ? `${base}/negotiate/${dealId}`
      : `${base}/deals/${dealId}/review`
    : `${base}/app`;

  const messages: Record<string, { subject: string; body: string }> = {
    deal_review_needed: {
      subject: "Action needed: Review your deal on Sealed Agent",
      body: "Your agent has completed a negotiation round. Review the proposed terms and approve, decline, or renegotiate.",
    },
    milestone_due: {
      subject: "Milestone confirmation needed — Sealed Agent",
      body: "A milestone in your deal is awaiting your confirmation.",
    },
    deal_accepted: {
      subject: "Deal accepted — Sealed Agent",
      body: "Your counterparty has approved the deal terms. The escrow is now active.",
    },
    deal_declined: {
      subject: "Deal declined — Sealed Agent",
      body: `Your counterparty declined the deal. Reason: ${payload.reason ?? "No reason provided."}`,
    },
    new_deal_invite: {
      subject: "You've been invited to a deal — Sealed Agent",
      body: "Someone wants to seal a deal with you on Sealed Agent.",
    },
    renegotiation_escalated: {
      subject: "Renegotiation requested — Sealed Agent",
      body: "Your counterparty reopened the terms on a deal. Review the requested changes and respond in the negotiation room.",
    },
    friend_request: {
      subject: "New friend request — Sealed Agent",
      body: (payload.message as string | undefined) ?? "Someone sent you a friend request on Sealed Agent.",
    },
    friend_request_accepted: {
      subject: "Friend request accepted — Sealed Agent",
      body: (payload.message as string | undefined) ?? "Someone accepted your friend request on Sealed Agent.",
    },
  };

  const msg = messages[eventType] ?? {
    subject: "Sealed Agent notification",
    body: "You have a new notification on Sealed Agent.",
  };

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0D1117;color:#e6edf3;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;">
    <p style="font-size:18px;font-weight:600;color:#fff;margin-bottom:8px;">Sealed Agent</p>
    <p style="font-size:13px;color:#8b949e;margin-bottom:32px;">Autonomous B2B escrow on Solana</p>
    <p style="font-size:15px;color:#e6edf3;margin-bottom:8px;">Hey @${handle},</p>
    <p style="font-size:14px;color:#c9d1d9;line-height:1.6;margin-bottom:32px;">${msg.body}</p>
    <a href="${ctaUrl}" style="display:inline-block;background:#22C55E;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">View in Sealed Agent →</a>
    <p style="font-size:12px;color:#484f58;margin-top:40px;">You received this because you have notifications enabled. Manage preferences in your Sealed Agent profile settings.</p>
  </div>
</body>
</html>`;

  return { subject: msg.subject, html };
}

/** True when the email transport is configured (a Resend key is present). */
export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/** Thrown when a send is attempted but the transport isn't configured. Lets
 *  callers that MUST reach the user (e.g. the OTP flow) surface a real error,
 *  while background/queue senders can choose to swallow it. */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email is not configured (RESEND_API_KEY unset)");
    this.name = "EmailNotConfiguredError";
  }
}

// The verified sender. Override with EMAIL_FROM once your domain is verified in
// Resend; the default domain must be verified there or Resend rejects the send.
const EMAIL_FROM = process.env.EMAIL_FROM ?? "Sealed Agent <noreply@sealed.app>";

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // No silent success: throw so callers decide. Previously this returned
    // void, so the OTP route reported ok:true while nothing was ever sent
    // (Round 6, #13).
    console.warn("[notify] RESEND_API_KEY not set — cannot send email to", to);
    throw new EmailNotConfiguredError();
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}
