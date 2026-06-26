"use client";

// Admin dashboard — Deals tab. Read-only table of every deal in the off-chain
// mirror, with status filter, search, and pagination. Data comes from the
// admin-gated GET /api/admin/deals; access is enforced server-side.

import { useCallback, useEffect, useState } from "react";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { apiFetch, ApiError } from "@/lib/api-client";

type AdminDeal = {
  deal_id: string;
  buyer_wallet: string;
  seller_wallet: string | null;
  title: string;
  total_amount_usdc: number;
  status: string;
  milestones_total: number;
  milestones_done: number;
  created_at: string;
  updated_at: string;
};

const STATUS_OPTIONS = [
  "",
  "draft",
  "seller-ready",
  "seller-agreed",
  "escalated",
  "proposed",
  "funded",
  "in_progress",
  "completed",
  "refunded",
  "disputed",
];

function shortWallet(w: string | null) {
  if (!w) return "—";
  return w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

function statusColor(status: string) {
  switch (status) {
    case "completed":
      return "text-green-400";
    case "funded":
    case "in_progress":
      return "text-indigo-300";
    case "refunded":
    case "disputed":
      return "text-red-400";
    case "escalated":
      return "text-orange-300";
    default:
      return "text-gray-300";
  }
}

const PAGE = 50;

export default function AdminDealsPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const [deals, setDeals] = useState<AdminDeal[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const json = await apiFetch<{ deals?: AdminDeal[]; count?: number }>(
        `/api/admin/deals?${params.toString()}`,
        { wallet }
      );
      setDeals(json.deals ?? []);
      setCount(json.count ?? 0);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setError("This wallet is not an admin.");
        setDeals([]);
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, [wallet, offset, status, q]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to the first page whenever a filter changes.
  function onFilterChange(next: () => void) {
    setOffset(0);
    next();
  }

  if (!wallet) {
    return <p className="text-gray-400">Connect an admin wallet to continue.</p>;
  }

  const from = count === 0 ? 0 : offset + 1;
  const to = Math.min(offset + deals.length, count);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => onFilterChange(() => setQ(e.target.value))}
          placeholder="Search deal id, title, or wallet"
          className="flex-1 min-w-[220px] px-3 py-2 text-sm bg-[#161B22] border border-gray-800 rounded outline-none"
        />
        <select
          value={status}
          onChange={(e) => onFilterChange(() => setStatus(e.target.value))}
          className="px-3 py-2 text-sm bg-[#161B22] border border-gray-800 rounded outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "" ? "All statuses" : s}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500">
          {count} deal{count === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded p-4 mb-4 text-sm">{error}</div>
      )}
      {loading && <p className="text-gray-400 text-sm">Loading…</p>}
      {!loading && !error && deals.length === 0 && (
        <p className="text-gray-400 text-sm">No deals match.</p>
      )}

      {deals.length > 0 && (
        <div className="overflow-x-auto border border-gray-800 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-[#161B22] text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Title</th>
                <th className="text-left px-3 py-2 font-medium">Buyer</th>
                <th className="text-left px-3 py-2 font-medium">Seller</th>
                <th className="text-right px-3 py-2 font-medium">Amount</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Milestones</th>
                <th className="text-left px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.deal_id} className="border-t border-gray-800 hover:bg-[#161B22]">
                  <td className="px-3 py-2">
                    <div className="text-white">{d.title || "—"}</div>
                    <div className="text-[11px] text-gray-500 font-mono">{d.deal_id}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-300">{shortWallet(d.buyer_wallet)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-300">{shortWallet(d.seller_wallet)}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {Number(d.total_amount_usdc).toLocaleString()} <span className="text-gray-500">USDC</span>
                  </td>
                  <td className={`px-3 py-2 ${statusColor(d.status)}`}>{d.status}</td>
                  <td className="px-3 py-2 text-gray-300">
                    {d.milestones_done}/{d.milestones_total}
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-xs">
                    {d.updated_at ? new Date(d.updated_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between mt-4 text-xs text-gray-400">
        <span>
          {from}–{to} of {count}
        </span>
        <div className="flex gap-2">
          <button
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
            className="px-3 py-1.5 rounded bg-[#161B22] border border-gray-800 disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={offset + deals.length >= count || loading}
            onClick={() => setOffset(offset + PAGE)}
            className="px-3 py-1.5 rounded bg-[#161B22] border border-gray-800 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
