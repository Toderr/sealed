"use client";

// KYC verification entry point. Lets the connected user upload an identity
// document (PDF/JPG/PNG) which POSTs to /api/kyc/submit and moves them into the
// "pending" review queue. Shows the current KYC state (none/pending/approved/
// rejected) so the page is idempotent. This is the page the profile "Get
// verified" links point to.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { apiFetch, ApiError } from "@/lib/api-client";

type KycStatus = "none" | "pending" | "approved" | "rejected";
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png";

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result is a data URL: "data:<mime>;base64,<data>"
      const result = String(reader.result);
      const base64 = result.split(",")[1] ?? "";
      resolve({ base64, mimeType: file.type || "application/octet-stream" });
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function VerifyPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

  const [status, setStatus] = useState<KycStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadStatus = useCallback(async () => {
    if (!wallet) { setLoading(false); return; }
    setLoading(true);
    try {
      const p = await apiFetch<{ kyc_status?: KycStatus }>(
        `/api/users/${wallet}/public?self=1`,
        { wallet }
      );
      setStatus(p.kyc_status ?? "none");
    } catch {
      setStatus("none");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  function pickFile(f: File | null) {
    setError(null);
    if (!f) { setFile(null); return; }
    if (f.size > MAX_BYTES) { setError("File exceeds 10 MB."); return; }
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) { setError("Please upload a PDF, JPG, or PNG."); return; }
    setFile(f);
  }

  async function submit() {
    if (!wallet || !file) return;
    setSubmitting(true);
    setError(null);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      await apiFetch("/api/kyc/submit", {
        method: "POST",
        wallet,
        body: { wallet, documentBase64: base64, mimeType },
      });
      setJustSubmitted(true);
      setStatus("pending");
      setFile(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const effectiveStatus: KycStatus = justSubmitted ? "pending" : (status ?? "none");
  const canSubmit = effectiveStatus === "none" || effectiveStatus === "rejected";

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px 80px" }}>
        <Link href={wallet ? `/profile/${wallet}` : "/profile"} className="text-[13px] text-muted hover:text-primary">
          ← Back to profile
        </Link>

        <h1 className="text-primary" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", margin: "18px 0 6px" }}>
          Get verified
        </h1>
        <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
          Verify your identity to raise trust signals on your profile and unlock more agent templates.
          Upload a government ID or business document — our team reviews it and updates your status.
        </p>

        {!wallet ? (
          <div className="surface-card rounded-xl p-6 text-center">
            <p className="text-muted text-[14px]">Connect your wallet to start verification.</p>
          </div>
        ) : loading ? (
          <p className="text-muted text-[13px]">Loading…</p>
        ) : effectiveStatus === "approved" ? (
          <StatusCard tone="success" title="You're verified ✓" body="Your account is verified. Nothing more to do here." />
        ) : effectiveStatus === "pending" ? (
          <StatusCard
            tone="pending"
            title={justSubmitted ? "Submitted — under review" : "Verification pending"}
            body="Your document is with our review team. We'll update your status once it's checked. This can take a little while."
          />
        ) : (
          <div className="surface-card rounded-xl p-6">
            {effectiveStatus === "rejected" && (
              <div className="rounded-lg mb-5 p-3" style={{ background: "var(--danger-bg, rgba(220,38,38,0.08))", border: "1px solid rgba(220,38,38,0.3)" }}>
                <p className="text-[13px]" style={{ color: "var(--danger, #f87171)" }}>
                  Your previous submission was rejected. Please upload a clearer or valid document.
                </p>
              </div>
            )}

            <label className="text-[12px] text-muted block mb-2">Identity or business document</label>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-lg border border-dashed p-6 text-center transition-colors hover:border-accent"
              style={{ borderColor: "var(--card-border)", background: "var(--surface)" }}
            >
              {file ? (
                <span className="text-[13px] text-primary" style={{ fontWeight: 510 }}>{file.name}</span>
              ) : (
                <span className="text-[13px] text-muted">Click to choose a file — PDF, JPG, or PNG (max 10 MB)</span>
              )}
            </button>

            {error && <p className="text-[12px] mt-3" style={{ color: "var(--danger, #f87171)" }}>{error}</p>}

            <button
              onClick={submit}
              disabled={!file || submitting}
              className="btn-primary w-full h-11 rounded-md text-[14px] mt-5 disabled:opacity-40"
            >
              {submitting ? "Submitting…" : "Submit for verification"}
            </button>
            <p className="text-[11px] text-muted mt-3 leading-relaxed">
              Your document is stored privately and used only for verification.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCard({ tone, title, body }: { tone: "success" | "pending"; title: string; body: string }) {
  const color = tone === "success" ? "var(--success, #34d399)" : "var(--warning, #f5a623)";
  return (
    <div className="surface-card rounded-xl p-6">
      <p className="text-[15px]" style={{ fontWeight: 600, color }}>{title}</p>
      <p className="text-muted text-[13px] mt-2 leading-relaxed">{body}</p>
    </div>
  );
}
