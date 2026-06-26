"use client";

// Admin · Deals list. Minimal columns (name, amount, status, milestones); each
// row links to the full detail at /admin/deals/[dealId]. The left filter rail
// drives multi-status, amount range, date range, pairing, and search — note the
// search still matches hidden fields (wallets) server-side even though they
// aren't shown as columns.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  PageWithRail,
  RailSection,
  CheckboxGroup,
  SearchBox,
  RangeInputs,
  Pager,
  dealStatusColor,
} from "../_components";

type AdminDeal = {
  deal_id: string;
  title: string;
  total_amount_usdc: number;
  status: string;
  milestones_total: number;
  milestones_done: number;
};

const STATUSES = [
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

const PAIRING = [
  { value: "open", label: "Open (slot empty)" },
  { value: "paired", label: "Paired (both filled)" },
];

const PAGE = 50;

export default function AdminDealsPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const [deals, setDeals] = useState<AdminDeal[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [pairing, setPairing] = useState<string[]>([]);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (q.trim()) p.set("q", q.trim());
      for (const s of statuses) p.append("status", s);
      if (min.trim()) p.set("min", min.trim());
      if (max.trim()) p.set("max", max.trim());
      if (from) p.set("from", new Date(from).toISOString());
      if (to) p.set("to", new Date(to + "T23:59:59").toISOString());
      // pairing is single-effective: if exactly one is chosen, apply it.
      if (pairing.length === 1) p.set("pairing", pairing[0]);
      const json = await apiFetch<{ deals?: AdminDeal[]; count?: number }>(
        `/api/admin/deals?${p.toString()}`,
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
  }, [wallet, offset, q, statuses, pairing, min, max, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  // Any filter change resets to the first page.
  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    setOffset(0);
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }
  function setFilter<T>(set: (v: T) => void, v: T) {
    setOffset(0);
    set(v);
  }

  const hasActiveFilters =
    statuses.length > 0 || pairing.length > 0 || !!min || !!max || !!from || !!to;
  function clearFilters() {
    setOffset(0);
    setStatuses([]);
    setPairing([]);
    setMin("");
    setMax("");
    setFrom("");
    setTo("");
  }

  if (!wallet) {
    return <p className="text-gray-400">Connect an admin wallet to continue.</p>;
  }

  const search = (
    <div>
      <SearchBox value={q} onChange={(v) => setFilter(setQ, v)} placeholder="Search title, deal id, or wallet…" />
      <p className="text-[11px] text-gray-600 mt-1">Searches wallets too, not just the visible columns.</p>
    </div>
  );

  const rail = (
    <>
      <RailSection label="Updated between">
        <RangeInputs minValue={from} maxValue={to} onMin={(v) => setFilter(setFrom, v)} onMax={(v) => setFilter(setTo, v)} type="date" />
      </RailSection>
      <RailSection label="Status">
        <CheckboxGroup
          options={STATUSES.map((s) => ({ value: s, label: s }))}
          selected={statuses}
          onToggle={(v) => toggle(statuses, setStatuses, v)}
        />
      </RailSection>
      <RailSection label="Amount (USDC)">
        <RangeInputs minValue={min} maxValue={max} onMin={(v) => setFilter(setMin, v)} onMax={(v) => setFilter(setMax, v)} type="number" />
      </RailSection>
      <RailSection label="Pairing">
        <CheckboxGroup options={PAIRING} selected={pairing} onToggle={(v) => toggle(pairing, setPairing, v)} />
      </RailSection>
    </>
  );

  return (
    <PageWithRail
      title="Deals"
      count={count}
      countLabel="deal"
      search={search}
      rail={rail}
      onClearFilters={clearFilters}
      hasActiveFilters={hasActiveFilters}
    >
      {error && <div className="bg-red-950 border border-red-800 rounded p-4 mb-4 text-sm">{error}</div>}
      {loading && <p className="text-gray-400 text-sm">Loading…</p>}
      {!loading && !error && deals.length === 0 && <p className="text-gray-400 text-sm">No deals match.</p>}

      {deals.length > 0 && (
        <div className="overflow-x-auto border border-gray-800 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-[#161B22] text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Deal</th>
                <th className="text-right px-3 py-2 font-medium">Amount</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Milestones</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.deal_id} className="border-t border-gray-800 hover:bg-[#161B22] cursor-pointer">
                  <td className="px-3 py-2">
                    <Link href={`/admin/deals/${encodeURIComponent(d.deal_id)}`} className="block">
                      <div className="text-white hover:text-indigo-300">{d.title || "—"}</div>
                      <div className="text-[11px] text-gray-500 font-mono">{d.deal_id}</div>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {Number(d.total_amount_usdc).toLocaleString()} <span className="text-gray-500">USDC</span>
                  </td>
                  <td className={`px-3 py-2 ${dealStatusColor(d.status)}`}>{d.status}</td>
                  <td className="px-3 py-2 text-gray-300">
                    {d.milestones_done}/{d.milestones_total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager
        offset={offset}
        shown={deals.length}
        count={count}
        loading={loading}
        onPrev={() => setOffset(Math.max(0, offset - PAGE))}
        onNext={() => setOffset(offset + PAGE)}
      />
    </PageWithRail>
  );
}
