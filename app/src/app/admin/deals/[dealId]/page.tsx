"use client";

// Admin · Deal detail. Full read-only view of one deal: parties, derived
// on-chain addresses (deal PDA + escrow vault), milestone breakdown, and raw
// timestamps. Data from the admin-gated GET /api/admin/deals/[dealId].

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { apiFetch, ApiError } from "@/lib/api-client";
import { dealStatusColor } from "../../_components";

type Milestone = { description?: string; amount?: number; status?: string };
type DealRow = {
  deal_id: string;
  buyer_wallet: string;
  seller_wallet: string | null;
  title: string;
  description: string | null;
  total_amount_usdc: number;
  status: string;
  milestones: Milestone[];
  created_at?: string;
  updated_at?: string;
};
type OnChain = { program_id: string; deal_pda: string; escrow_vault_pda: string } | null;

function Copyable({ value }: { value: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-gray-500">—</span>;
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard may be unavailable */
        }
      }}
      className="font-mono text-xs text-gray-200 hover:text-indigo-300 break-all text-left"
      title="Click to copy"
    >
      {value} <span className="text-gray-600">{copied ? "✓ copied" : "⧉"}</span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2 border-b border-gray-800/60">
      <span className="text-[11px] uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

function msDone(s?: string) {
  return s === "Released" || s === "Completed";
}

export default function AdminDealDetailPage() {
  const params = useParams<{ dealId: string }>();
  const dealId = decodeURIComponent(params.dealId);
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const [deal, setDeal] = useState<DealRow | null>(null);
  const [onchain, setOnchain] = useState<OnChain>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const json = await apiFetch<{ deal: DealRow; onchain: OnChain }>(
        `/api/admin/deals/${encodeURIComponent(dealId)}`,
        { wallet }
      );
      setDeal(json.deal);
      setOnchain(json.onchain);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setError("This wallet is not an admin.");
      else if (e instanceof ApiError && e.status === 404) setError("Deal not found.");
      else setError(e instanceof Error ? e.message : "Failed to load deal");
    } finally {
      setLoading(false);
    }
  }, [wallet, dealId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!wallet) return <p className="text-gray-400">Connect an admin wallet to continue.</p>;

  return (
    <div className="max-w-3xl">
      <Link href="/admin/deals" className="text-xs text-gray-400 hover:text-gray-200">
        ← Back to deals
      </Link>

      {loading && <p className="text-gray-400 text-sm mt-4">Loading…</p>}
      {error && <div className="bg-red-950 border border-red-800 rounded p-4 mt-4 text-sm">{error}</div>}

      {deal && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-4 mb-1">
            <h2 className="text-xl font-semibold">{deal.title || "Untitled deal"}</h2>
            <span className={`text-sm ${dealStatusColor(deal.status)}`}>{deal.status}</span>
          </div>
          <p className="text-[11px] font-mono text-gray-500 mb-6">{deal.deal_id}</p>

          <div className="grid sm:grid-cols-2 gap-x-8">
            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-1 mt-2">Parties</h3>
              <Field label="Buyer (funds + releases)">
                <Copyable value={deal.buyer_wallet} />
              </Field>
              <Field label="Seller (provides)">
                <Copyable value={deal.seller_wallet} />
              </Field>

              <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-1 mt-5">On-chain</h3>
              <Field label="Program ID">
                <Copyable value={onchain?.program_id ?? null} />
              </Field>
              <Field label="Deal PDA">
                <Copyable value={onchain?.deal_pda ?? null} />
              </Field>
              <Field label="Escrow vault PDA">
                <Copyable value={onchain?.escrow_vault_pda ?? null} />
              </Field>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-1 mt-2">Terms</h3>
              <Field label="Total">
                <span className="font-mono">{Number(deal.total_amount_usdc).toLocaleString()} USDC</span>
              </Field>
              <Field label="Description">
                {deal.description ? (
                  <span className="text-gray-300">{deal.description}</span>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
              </Field>
              <Field label="Created">
                <span className="text-gray-300">{deal.created_at ? new Date(deal.created_at).toLocaleString() : "—"}</span>
              </Field>
              <Field label="Updated">
                <span className="text-gray-300">{deal.updated_at ? new Date(deal.updated_at).toLocaleString() : "—"}</span>
              </Field>
            </div>
          </div>

          <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-2 mt-6">
            Milestones ({(deal.milestones ?? []).filter((m) => msDone(m.status)).length}/
            {(deal.milestones ?? []).length})
          </h3>
          <div className="border border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#161B22] text-gray-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2 font-medium w-8">#</th>
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                  <th className="text-right px-3 py-2 font-medium">Amount</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(deal.milestones ?? []).map((m, i) => (
                  <tr key={i} className="border-t border-gray-800">
                    <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                    <td className="px-3 py-2 text-gray-200">{m.description || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {m.amount != null ? Number(m.amount).toLocaleString() : "—"}
                    </td>
                    <td className={`px-3 py-2 ${msDone(m.status) ? "text-green-400" : "text-gray-400"}`}>
                      {m.status || "Pending"}
                    </td>
                  </tr>
                ))}
                {(deal.milestones ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-gray-500 text-sm">
                      No milestones.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
