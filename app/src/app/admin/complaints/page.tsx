"use client";

// Admin · Complaints. Read + triage user-reported problems. The platform
// mediates (updates status, reaches out) — it cannot move escrow funds.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { apiFetch, ApiError } from "@/lib/api-client";
import { PageWithRail, RailSection, CheckboxGroup, Pager, shortWallet } from "../_components";

type Complaint = {
  id: string;
  deal_id: string | null;
  reporter_wallet: string;
  category: string;
  message: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
};

const STATUSES = ["open", "reviewing", "resolved", "dismissed"];
const CATEGORY_LABEL: Record<string, string> = {
  non_delivery: "Not delivered",
  quality: "Quality",
  communication: "Communication",
  payment: "Payment",
  other: "Other",
};

function statusColor(s: string) {
  switch (s) {
    case "open": return "text-yellow-400";
    case "reviewing": return "text-indigo-300";
    case "resolved": return "text-green-400";
    default: return "text-gray-500";
  }
}

const PAGE = 100;

export default function AdminComplaintsPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const [items, setItems] = useState<Complaint[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      for (const s of statuses) p.append("status", s);
      const json = await apiFetch<{ complaints?: Complaint[]; count?: number }>(
        `/api/complaints?${p.toString()}`,
        { wallet }
      );
      setItems(json.complaints ?? []);
      setCount(json.count ?? 0);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { setError("This wallet is not an admin."); setItems([]); return; }
      setError(e instanceof Error ? e.message : "Failed to load complaints");
    } finally {
      setLoading(false);
    }
  }, [wallet, offset, statuses]);

  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: string) {
    if (!wallet) return;
    try {
      await apiFetch("/api/complaints", { method: "PATCH", wallet, body: { id, status } });
      load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Update failed");
    }
  }

  function toggleStatus(v: string) {
    setOffset(0);
    setStatuses((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  }

  if (!wallet) return <p className="text-gray-400">Connect an admin wallet to continue.</p>;

  const hasFilters = statuses.length > 0;
  const rail = (
    <RailSection label="Status">
      <CheckboxGroup options={STATUSES.map((s) => ({ value: s, label: s }))} selected={statuses} onToggle={toggleStatus} />
    </RailSection>
  );

  return (
    <PageWithRail title="Complaints" count={count} countLabel="complaint" rail={rail} onClearFilters={() => { setOffset(0); setStatuses([]); }} hasActiveFilters={hasFilters}>
      {error && <div className="bg-red-950 border border-red-800 rounded p-4 mb-4 text-sm">{error}</div>}
      {loading && <p className="text-gray-400 text-sm">Loading…</p>}
      {!loading && !error && items.length === 0 && <p className="text-gray-400 text-sm">No complaints.</p>}

      <div className="space-y-3">
        {items.map((c) => (
          <div key={c.id} className="border border-gray-800 rounded-lg p-4 bg-[#161B22]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-300">{CATEGORY_LABEL[c.category] ?? c.category}</span>
                  <span className={`text-xs ${statusColor(c.status)}`}>{c.status}</span>
                  {c.deal_id && (
                    <Link href={`/admin/deals/${encodeURIComponent(c.deal_id)}`} className="text-xs text-indigo-300 font-mono hover:underline">
                      {c.deal_id}
                    </Link>
                  )}
                </div>
                <p className="text-sm text-gray-200 mt-2 whitespace-pre-wrap break-words">{c.message}</p>
                <p className="text-[11px] text-gray-500 mt-2">
                  by <span className="font-mono">{shortWallet(c.reporter_wallet)}</span> · {new Date(c.created_at).toLocaleString()}
                </p>
              </div>
              <select
                value={c.status}
                onChange={(e) => setStatus(c.id, e.target.value)}
                className="shrink-0 px-2 py-1 text-xs bg-[#0D1117] border border-gray-800 rounded outline-none"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      <Pager offset={offset} shown={items.length} count={count} loading={loading} onPrev={() => setOffset(Math.max(0, offset - PAGE))} onNext={() => setOffset(offset + PAGE)} />
    </PageWithRail>
  );
}
