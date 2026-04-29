"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

interface Submission {
  wallet: string;
  handle: string;
  email: string | null;
  kyc_status: "pending" | "approved" | "rejected";
  kyc_document_url: string | null;
  kyc_submitted_at: string | null;
}

export default function AdminKycPage() {
  const { publicKey } = useWallet();
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wallet = publicKey?.toBase58();

  const fetchSubmissions = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/kyc", {
        headers: { "x-wallet": wallet },
      });
      if (res.status === 403) {
        setError("Wallet kamu bukan admin.");
        setItems([]);
        return;
      }
      const json = await res.json();
      setItems(json.submissions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  async function decide(target: string, decision: "approved" | "rejected") {
    if (!wallet) return;
    const res = await fetch("/api/admin/kyc", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-wallet": wallet },
      body: JSON.stringify({ target_wallet: target, decision }),
    });
    if (!res.ok) {
      const json = await res.json();
      alert(`Failed: ${json.error ?? res.statusText}`);
      return;
    }
    fetchSubmissions();
  }

  async function viewDocument(key: string) {
    const res = await fetch(`/api/upload/signed?key=${encodeURIComponent(key)}`);
    const json = await res.json();
    if (json.url) window.open(json.url, "_blank");
  }

  if (!wallet) {
    return (
      <div className="min-h-screen bg-[#0D1117] text-white p-8">
        <h1 className="text-2xl font-bold mb-4">Admin: KYC Review</h1>
        <p className="text-gray-400">Connect wallet to continue.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D1117] text-white p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Admin: KYC Review</h1>
        <p className="text-sm text-gray-400 mb-6">Wallet: {wallet}</p>

        {error && (
          <div className="bg-red-950 border border-red-800 rounded p-4 mb-4">
            {error}
          </div>
        )}

        {loading && <p className="text-gray-400">Loading...</p>}

        {!loading && items.length === 0 && !error && (
          <p className="text-gray-400">No KYC submissions yet.</p>
        )}

        <div className="space-y-3">
          {items.map((s) => (
            <div
              key={s.wallet}
              className="border border-gray-800 rounded-lg p-4 bg-[#161B22]"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">@{s.handle}</div>
                  <div className="text-xs text-gray-500 truncate">{s.wallet}</div>
                  {s.email && (
                    <div className="text-xs text-gray-400 mt-1">{s.email}</div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    Submitted:{" "}
                    {s.kyc_submitted_at
                      ? new Date(s.kyc_submitted_at).toLocaleString()
                      : "—"}
                  </div>
                  <div className="text-xs mt-1">
                    Status:{" "}
                    <span
                      className={
                        s.kyc_status === "approved"
                          ? "text-green-400"
                          : s.kyc_status === "rejected"
                          ? "text-red-400"
                          : "text-yellow-400"
                      }
                    >
                      {s.kyc_status}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.kyc_document_url && (
                    <button
                      onClick={() => viewDocument(s.kyc_document_url!)}
                      className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded"
                    >
                      View doc
                    </button>
                  )}
                  {s.kyc_status === "pending" && (
                    <>
                      <button
                        onClick={() => decide(s.wallet, "approved")}
                        className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 rounded"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => decide(s.wallet, "rejected")}
                        className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 rounded"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
