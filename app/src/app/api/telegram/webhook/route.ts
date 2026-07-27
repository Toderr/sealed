import { supabase, table } from "@/lib/supabase";
import { withRoute, json } from "@/lib/api-error";
import { sendTelegram, telegramConfigured } from "@/lib/notify";

// Telegram bot webhook. Register with:
//   https://api.telegram.org/bot<TOKEN>/setWebhook
//     ?url=https://<host>/api/telegram/webhook
//     &secret_token=<TELEGRAM_WEBHOOK_SECRET>
//
// This endpoint is PUBLIC (Telegram calls it), so it is authenticated by the
// shared secret Telegram echoes in a header — not by x-wallet. Without the
// secret check, anyone could POST a forged update and bind their own chat id to
// somebody else's wallet.

export const runtime = "nodejs";

type TgUpdate = {
  message?: {
    chat?: { id?: number | string };
    from?: { username?: string };
    text?: string;
  };
};

export const POST = withRoute(async (req) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  // Fail closed: an unset secret would otherwise accept every caller.
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    // 200 so Telegram doesn't retry a request we will never accept.
    return json({ ok: true });
  }

  const update = (await req.json().catch(() => ({}))) as TgUpdate;
  const chatId = update.message?.chat?.id;
  const text = (update.message?.text ?? "").trim();
  if (!chatId || !text) return json({ ok: true });

  // Accept "/start CODE" (deep link) and a bare "CODE" (manual paste).
  const code = text.replace(/^\/start\s*/i, "").trim().toUpperCase();
  if (!code) return json({ ok: true });

  const { data: match } = await supabase
    .from(table("users"))
    .select("wallet, telegram_link_expires_at")
    .eq("telegram_link_code", code)
    .maybeSingle();

  const row = match as { wallet: string; telegram_link_expires_at: string | null } | null;
  const expired =
    !row?.telegram_link_expires_at || Date.parse(row.telegram_link_expires_at) < Date.now();

  if (!row || expired) {
    if (telegramConfigured()) {
      await sendTelegram(
        String(chatId),
        expired && row
          ? "That link code has expired. Generate a new one from your Sealed Agent profile settings."
          : "I don't recognize that code. Generate one from your Sealed Agent profile settings and send it here."
      ).catch(() => {});
    }
    return json({ ok: true });
  }

  // Bind the chat and burn the code so it can't be replayed.
  await supabase
    .from(table("users"))
    .update({
      telegram_chat_id: String(chatId),
      telegram_username: update.message?.from?.username ?? null,
      telegram_link_code: null,
      telegram_link_expires_at: null,
    })
    .eq("wallet", row.wallet);

  await sendTelegram(
    String(chatId),
    "<b>Telegram connected</b>\n\nYou'll get Sealed Agent notifications here. Manage which events in your profile settings."
  ).catch(() => {});

  return json({ ok: true });
});
