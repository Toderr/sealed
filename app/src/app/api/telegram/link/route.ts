import { supabase, table } from "@/lib/supabase";
import { requireWallet } from "@/lib/auth";
import { withRoute, json, HttpError } from "@/lib/api-error";
import { telegramConfigured } from "@/lib/notify";

// Linking a Telegram account.
//
// The queue sends to `telegram_chat_id`, which a user has no way to look up
// themselves — so they can't just paste it. Instead we mint a short-lived code,
// they send it to the bot, and the bot's webhook resolves code → wallet and
// stores the chat id it received the message from. That also proves they
// control the chat, which a pasted id would not.
//
// Codes live in sealed_users.telegram_link_code (+ _expires_at) rather than a
// new table: one row per user, cleared on use, no cleanup job needed.

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
// Unambiguous alphabet: no O/0, I/1, so a code read off a screen can be typed.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function mintCode(): string {
  // Rejection-sample so the alphabet stays uniform (256 % 32 === 0 here, so no
  // bytes are actually rejected — the guard keeps it correct if either constant
  // changes later).
  const limit = 256 - (256 % CODE_ALPHABET.length);
  const bytes = new Uint8Array(CODE_LENGTH * 2);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) {
    if (b >= limit) continue;
    out += CODE_ALPHABET[b % CODE_ALPHABET.length];
    if (out.length === CODE_LENGTH) break;
  }
  return out;
}

/** Mint (or re-mint) a link code for the calling wallet. */
export const POST = withRoute(async (req) => {
  const wallet = requireWallet(req);

  if (!telegramConfigured()) {
    throw new HttpError(503, "Telegram isn't set up on this deployment yet.");
  }

  const code = mintCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error } = await supabase
    .from(table("users"))
    .update({ telegram_link_code: code, telegram_link_expires_at: expiresAt })
    .eq("wallet", wallet);

  if (error) throw new HttpError(500, "Could not start Telegram linking.");

  const botName = process.env.TELEGRAM_BOT_USERNAME;
  return json({
    code,
    expires_at: expiresAt,
    // Deep link pre-fills the message, so the user taps once instead of typing.
    deep_link: botName ? `https://t.me/${botName}?start=${code}` : null,
    bot_username: botName ?? null,
  });
});

/** Unlink: stop sending to Telegram and forget the chat id. */
export const DELETE = withRoute(async (req) => {
  const wallet = requireWallet(req);

  const { error } = await supabase
    .from(table("users"))
    .update({
      telegram_chat_id: null,
      telegram_username: null,
      telegram_link_code: null,
      telegram_link_expires_at: null,
    })
    .eq("wallet", wallet);

  if (error) throw new HttpError(500, "Could not unlink Telegram.");
  return json({ ok: true });
});
