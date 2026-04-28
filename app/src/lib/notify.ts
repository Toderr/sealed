import { insforge, table } from "@/lib/insforge";

export async function queueNotification(
  recipientWallet: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Try email channel if user has a verified email
  const { data: user } = await insforge.database
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
    await insforge.database.from(table("notification_queue")).insert({
      recipient_wallet: recipientWallet,
      channel,
      event_type: eventType,
      payload,
      status: "pending",
    });
  }
}

export async function drainQueue(): Promise<{ sent: number; failed: number }> {
  const { data: pending } = await insforge.database
    .from(table("notification_queue"))
    .select("*")
    .eq("status", "pending")
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

      await insforge.database
        .from(table("notification_queue"))
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent++;
    } catch {
      await insforge.database
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
  const { data: user } = await insforge.database
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
  const reviewUrl = dealId
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/deals/${dealId}/review`
    : `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/app`;

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
    <a href="${reviewUrl}" style="display:inline-block;background:#22C55E;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">View in Sealed Agent →</a>
    <p style="font-size:12px;color:#484f58;margin-top:40px;">You received this because you have notifications enabled. Manage preferences in your Sealed Agent profile settings.</p>
  </div>
</body>
</html>`;

  return { subject: msg.subject, html };
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notify] RESEND_API_KEY not set — skipping email to", to);
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: "Sealed Agent <noreply@sealed.app>",
    to,
    subject,
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}
