"use client";

// Admin · Users list with a left filter rail (multi-KYC, email-verified) and
// search over wallet/handle/name/email. Read-only; admin-gated server-side.

import { useCallback, useEffect, useState } from "react";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  PageWithRail,
  RailSection,
  CheckboxGroup,
  SearchBox,
  Pager,
  shortWallet,
  kycColor,
} from "../_components";

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

const KYC = ["none", "pending", "approved", "rejected"];
const EMAIL = [
  { value: "true", label: "Verified email" },
  { value: "false", label: "Unverified / none" },
];

const PAGE = 50;

export default function AdminUsersPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [kyc, setKyc] = useState<string[]>([]);
  const [email, setEmail] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (q.trim()) p.set("q", q.trim());
      for (const k of kyc) p.append("kyc", k);
      // email-verified is a single effective flag; apply only if exactly one is picked.
      if (email.length === 1) p.set("emailVerified", email[0]);
      const json = await apiFetch<{ users?: AdminUser[]; count?: number }>(
        `/api/admin/users?${p.toString()}`,
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
  }, [wallet, offset, q, kyc, email]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    setOffset(0);
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }
  function setFilter<T>(set: (v: T) => void, v: T) {
    setOffset(0);
    set(v);
  }

  const hasActiveFilters = kyc.length > 0 || email.length > 0;
  function clearFilters() {
    setOffset(0);
    setKyc([]);
    setEmail([]);
  }

  if (!wallet) {
    return <p className="text-gray-400">Connect an admin wallet to continue.</p>;
  }

  const search = (
    <SearchBox value={q} onChange={(v) => setFilter(setQ, v)} placeholder="Search wallet, handle, name, or email…" />
  );

  const rail = (
    <>
      <RailSection label="KYC status">
        <CheckboxGroup
          options={KYC.map((s) => ({ value: s, label: s }))}
          selected={kyc}
          onToggle={(v) => toggle(kyc, setKyc, v)}
        />
      </RailSection>
      <RailSection label="Email">
        <CheckboxGroup options={EMAIL} selected={email} onToggle={(v) => toggle(email, setEmail, v)} />
      </RailSection>
    </>
  );

  return (
    <PageWithRail
      title="Users"
      count={count}
      countLabel="user"
      search={search}
      rail={rail}
      onClearFilters={clearFilters}
      hasActiveFilters={hasActiveFilters}
    >
      {error && <div className="bg-red-950 border border-red-800 rounded p-4 mb-4 text-sm">{error}</div>}
      {loading && <p className="text-gray-400 text-sm">Loading…</p>}
      {!loading && !error && users.length === 0 && <p className="text-gray-400 text-sm">No users match.</p>}

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

      <Pager
        offset={offset}
        shown={users.length}
        count={count}
        loading={loading}
        onPrev={() => setOffset(Math.max(0, offset - PAGE))}
        onNext={() => setOffset(offset + PAGE)}
      />
    </PageWithRail>
  );
}
