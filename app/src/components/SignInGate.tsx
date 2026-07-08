"use client";

// Sign-in-with-Solana gate. Probes /api/auth/session; if the connected wallet
// has no session, shows a full-screen "Sign in" prompt that runs the handshake
// (a wallet popup — no gas). Once signed in, renders children.
//
// Phase 1 (foundation): this component exists and works, but is mounted in a
// NON-BLOCKING way (see `soft` prop) so it changes no existing behavior — routes
// still accept the x-wallet header. Later phases can mount it as a hard gate.

import { useCallback, useEffect, useState } from "react";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { getSessionWallet, signIn } from "@/lib/auth-client";
import WalletMultiButton from "@/components/AppWalletButton";

type Status = "checking" | "authed" | "need-signin" | "unconfigured";

export default function SignInGate({
  children,
  soft = false,
}: {
  children: React.ReactNode;
  // soft = render children regardless; only show a dismissible prompt when not
  // signed in. Use during the additive rollout so nothing is blocked.
  soft?: boolean;
}) {
  const { publicKey, signMessage } = useWallet();
  const wallet = publicKey?.toBase58();
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const probe = useCallback(async () => {
    if (!wallet) {
      setStatus("need-signin");
      return;
    }
    try {
      const sessionWallet = await getSessionWallet();
      setStatus(sessionWallet === wallet ? "authed" : "need-signin");
    } catch {
      // /api/auth/session 503 (unconfigured) or network error → don't block.
      setStatus("unconfigured");
    }
  }, [wallet]);

  useEffect(() => {
    setStatus("checking");
    probe();
  }, [probe]);

  async function handleSignIn() {
    if (!wallet || !signMessage) {
      setError("Your wallet can't sign messages.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(wallet, signMessage);
      setStatus("authed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Auth not configured, or already authed → just render.
  if (status === "authed" || status === "unconfigured") return <>{children}</>;

  const prompt = (
    <div className="rounded-xl border p-6" style={{ maxWidth: 380, background: "var(--panel, #11161D)", borderColor: "var(--card-border, #2c2c38)" }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: "var(--primary, #fff)", margin: "0 0 6px" }}>Sign in to Sealed</p>
      <p style={{ fontSize: 13, color: "var(--muted, #9a9aa8)", margin: "0 0 18px", lineHeight: 1.5 }}>
        Sign a message with your wallet to verify you own it. It&apos;s free — no transaction, no gas.
      </p>
      {error && <p style={{ fontSize: 12, color: "var(--danger, #f87171)", margin: "0 0 12px" }}>{error}</p>}
      {!wallet ? (
        // No wallet connected yet — let them connect first.
        <div style={{ display: "flex", justifyContent: "center" }}>
          <WalletMultiButton />
        </div>
      ) : (
        <button
          onClick={handleSignIn}
          disabled={busy}
          className="btn-primary"
          style={{ width: "100%", height: 40, borderRadius: 8, fontSize: 14, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Waiting for signature…" : "Sign in with wallet"}
        </button>
      )}
      {soft && (
        <button
          onClick={() => setDismissed(true)}
          style={{ width: "100%", height: 32, marginTop: 8, fontSize: 12, color: "var(--muted, #9a9aa8)", background: "none", border: "none", cursor: "pointer" }}
        >
          Not now
        </button>
      )}
    </div>
  );

  // Soft mode: render the app, overlay a dismissible prompt (bottom-right).
  if (soft) {
    return (
      <>
        {children}
        {status === "need-signin" && !dismissed && (
          <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9998 }}>{prompt}</div>
        )}
      </>
    );
  }

  // Hard mode (later phases): block until signed in.
  if (status === "checking") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: 13, color: "var(--muted, #9a9aa8)" }}>Checking session…</p>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      {prompt}
    </div>
  );
}
