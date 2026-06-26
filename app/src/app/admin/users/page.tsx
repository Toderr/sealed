"use client";

// Admin dashboard — Users tab. Read-only table of every user with their
// reputation aggregate. Data comes from the admin-gated GET /api/admin/users;
// access is enforced server-side.

import { useCallback, useEffect, useState } from "react";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { apiFetch, ApiError } from "@/lib/api-client";

type AdminUser = {
  wallet: string;
  handle: string;
  display_name: string | null;
  email: string | null;
  email_verified: boolean;
  kyc_status: "none" | "pending" | "approved" | "rejected";
  member_since: string;
  reputation: { deals_total: number; deals_successful: number; avg_rating: number };
};

const KYC_OPTIONS = ["", "none", "pending", "approved", "rejected"];

function shortWallet(w: string) {
  return w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

function kycColor(s: string) {
  switch (s) {
    case "approved":
      return "text-green-400";
    case "rejected":
      return "text-red-400";
    case "pending":
      return "text-yellow-400";
    default:
      return "text-gray-500";
  }
}

const PAGE = 50;

export default function AdminUsersPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [kyc, setKyc] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (kyc) params.set("kyc", kyc);
      if (q.trim()) params.set("q", q.trim());
      const json = await apiFetch<{ users?: AdminUser[]; count?: number }>(
        `/api/admin/users?${params.toString()}`,
        { wallet }
      );
      setUsers(json.users ?? []);
      setCount(json.count ?? 0);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setError("This wallet is not an admin.");
        setUsers([]);
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [wallet, offset, kyc, q]);

  useEffect(() => {
    load();
  }, [load]);

  function onFilterChange(next: () => void) {
    setOffset(0);
    next();
  }

  if (!wallet) {
    return <p className="text-gray-400">Connect an admin wallet to continue.</p>;
  }

  const from = count === 0 ? 0 : offset + 1;
  const to = Math.min(offset + users.length, count);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => onFilterChange(() => setQ(e.target.value))}
          placeholder="Search wallet, handle, name, or email"
          className="flex-1 min-w-[220px] px-3 py-2 text-sm bg-[#161B22] border border-gray-800 rounded outline-none"
        />
        <select
          value={kyc}
          onChange={(e) => onFilterChange(() => setKyc(e.target.value))}
          className="px-3 py-2 text-sm bg-[#161B22] border border-gray-800 rounded outline-none"
        >
          {KYC_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "" ? "All KYC" : s}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500">
          {count} user{count === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded p-4 mb-4 text-sm">{error}</div>
      )}
      {loading && <p className="text-gray-400 text-sm">Loading…</p>}
      {!loading && !error && users.length === 0 && (
        <p className="text-gray-400 text-sm">No users match.</p>
      )}

      {users.length > 0 && (
        <div className="overflow-x-auto border border-gray-800 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-[#161B22] text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-medium">User</th>
                <th className="text-left px-3 py-2 font-medium">Wallet</th>
                <th className="text-left px-3 py-2 font-medium">Email</th>
                <th className="text-left px-3 py-2 font-medium">KYC</th>
                <th className="text-right px-3 py-2 font-medium">Deals</th>
                <th className="text-right px-3 py-2 font-medium">Rating</th>
                <th className="text-left px-3 py-2 font-medium">Member since</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.wallet} className="border-t border-gray-800 hover:bg-[#161B22]">
                  <td className="px-3 py-2">
                    <div className="text-white">{u.display_name || u.handle}</div>
                    <div className="text-[11px] text-gray-500">@{u.handle}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-300">{shortWallet(u.wallet)}</td>
                  <td className="px-3 py-2 text-gray-300 text-xs">
                    {u.email || "—"}
                    {u.email && (
                      <span className={u.email_verified ? "text-green-400" : "text-gray-500"}>
                        {u.email_verified ? " ✓" : " (unverified)"}
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2 ${kycColor(u.kyc_status)}`}>{u.kyc_status}</td>
                  <td className="px-3 py-2 text-right text-gray-300">
                    {u.reputation.deals_successful}/{u.reputation.deals_total}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-300">
                    {u.reputation.avg_rating ? Number(u.reputation.avg_rating).toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-xs">
                    {u.member_since ? new Date(u.member_since).toLocaleDateString() : "—"}
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
            disabled={offset + users.length >= count || loading}
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
