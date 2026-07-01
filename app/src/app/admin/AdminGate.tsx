"use client";

// Full-screen access gate for the admin area. Access is granted by the server
// when EITHER the connected wallet is allowlisted OR a valid passcode is sent
// (see lib/admin.ts). The client can't know the allowlist, so it simply probes
// a lightweight admin endpoint:
//   - 2xx  → allowed (allowlisted wallet, or a passcode already stored) → render.
//   - 403  → show the passcode prompt; on submit, store it and re-probe.
// The passcode lives in sessionStorage and is auto-attached by apiFetch.

import { useCallback, useEffect, useState } from "react";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { apiFetch, ApiError } from "@/lib/api-client";

type Status = "checking" | "allowed" | "need-passcode";

const PROBE = "/api/admin/deals?limit=1";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();
  const [status, setStatus] = useState<Status>("checking");
  const [passcode, setPasscode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const probe = useCallback(async () => {
    try {
      await apiFetch(PROBE, { wallet });
      setStatus("allowed");
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setStatus("need-passcode");
      } else {
        // Network/other error — don't lock out; surface it but allow retry.
        setStatus("need-passcode");
        setError(e instanceof Error ? e.message : "Could not verify admin access");
      }
    }
  }, [wallet]);

  // Re-probe whenever the wallet changes (e.g. connecting an allowlisted wallet).
  useEffect(() => {
    setStatus("checking");
    probe();
  }, [probe]);

  async function submitPasscode(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      sessionStorage.setItem("admin:passcode", passcode.trim());
    } catch {
      /* ignore */
    }
    try {
      await apiFetch(PROBE, { wallet });
      setStatus("allowed");
    } catch (e) {
      try {
        sessionStorage.removeItem("admin:passcode");
      } catch {
        /* ignore */
      }
      setError(
        e instanceof ApiError && e.status === 403
          ? "Incorrect passcode."
          : e instanceof Error
          ? e.message
          : "Could not verify passcode"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "allowed") return <>{children}</>;

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-[#0D1117] text-white flex items-center justify-center">
        <p className="text-sm text-gray-500">Checking access…</p>
      </div>
    );
  }

  // need-passcode
  return (
    <div className="min-h-screen bg-[#0D1117] text-white flex items-center justify-center px-4">
      <form
        onSubmit={submitPasscode}
        className="w-full max-w-sm rounded-xl border border-gray-800 bg-[#11161D] p-6"
      >
        <div className="text-lg font-bold">Sealed — Admin</div>
        <p className="text-sm text-gray-400 mt-1 mb-5">
          Enter the admin passcode to continue. (Allowlisted wallets are admitted
          automatically.)
        </p>
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Admin passcode"
          autoFocus
          className="w-full px-3 py-2 text-sm bg-[#161B22] border border-gray-800 rounded outline-none focus:border-gray-600"
        />
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !passcode.trim()}
          className="mt-4 w-full px-3 py-2 text-sm rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600"
        >
          {submitting ? "Checking…" : "Enter"}
        </button>
        <p className="text-[11px] text-gray-600 mt-4">
          Read-only internal tool. Passcode is sent over HTTPS and stored only for
          this browser session.
        </p>
      </form>
    </div>
  );
}
