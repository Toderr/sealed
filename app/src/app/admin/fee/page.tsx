"use client";

// Admin · Platform fee. View and change the on-chain fee config (fee_bps +
// treasury). Reads via fetchFeeConfig (mock or on-chain). Writes:
//   - mock mode → mockEscrow.setConfig (offline).
//   - real mode → sign set_fee / set_treasury with the connected wallet, which
//     must be the on-chain authority (the program enforces this).
// The fee is only "live" (actually charged) when a rate is set AND a treasury
// exists — so until a treasury is set, deals run fee-free.

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useAppWallet as useWallet } from "@/lib/use-app-wallet";
import { useAppConnection as useConnection } from "@/lib/use-app-connection";
import { MOCK_CHAIN } from "@/lib/env";
import { mockEscrow } from "@/lib/mock-escrow";
import { fetchFeeConfig, buildSetFeeIx, buildSetTreasuryIx, sendTx } from "@/lib/escrow-client";

export default function AdminFeePage() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const wallet = publicKey?.toBase58();

  const [feeBps, setFeeBps] = useState<number>(0);
  const [treasury, setTreasury] = useState<string>("");
  const [active, setActive] = useState(false);
  const [feeInput, setFeeInput] = useState("");
  const [treasuryInput, setTreasuryInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await fetchFeeConfig(connection);
      setFeeBps(c.feeBps);
      setTreasury(c.treasury);
      setActive(c.active);
      setFeeInput(String(c.feeBps));
      setTreasuryInput(c.treasury);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setBusy(true); setErr(null); setMsg(null);
    const nextBps = parseInt(feeInput, 10);
    const nextTreasury = treasuryInput.trim();
    if (!Number.isFinite(nextBps) || nextBps < 0 || nextBps > 500) {
      setErr("Fee must be between 0 and 500 bps (0–5%)."); setBusy(false); return;
    }
    if (nextTreasury) {
      try { new PublicKey(nextTreasury); } catch { setErr("Treasury must be a valid wallet address (or blank to unset)."); setBusy(false); return; }
    }
    try {
      if (MOCK_CHAIN) {
        mockEscrow.setConfig({ feeBps: nextBps, treasury: nextTreasury });
      } else {
        if (!publicKey || !signTransaction) throw new Error("Connect the authority wallet.");
        const ixs = [];
        if (nextBps !== feeBps) ixs.push(await buildSetFeeIx(publicKey, nextBps));
        if (nextTreasury !== treasury) {
          ixs.push(await buildSetTreasuryIx(publicKey, nextTreasury ? new PublicKey(nextTreasury) : PublicKey.default));
        }
        if (ixs.length === 0) { setMsg("No changes."); setBusy(false); return; }
        await sendTx(connection, ixs, signTransaction);
      }
      setMsg("Saved.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed (are you the config authority?).");
    } finally {
      setBusy(false);
    }
  }

  if (!wallet) return <p className="text-gray-400">Connect an admin wallet to continue.</p>;

  const buyerPct = (feeBps / 200).toFixed(2);
  const sellerPct = (feeBps / 200).toFixed(2);

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold mb-1">Platform fee</h2>
      <p className="text-[13px] text-gray-400 mb-6 leading-relaxed">
        The total fee is split half to the buyer (at funding) and half to the seller (at release).
        The fee is only charged once a <strong>treasury</strong> is set — until then, deals run fee-free.
        Changes apply to <strong>new deals only</strong>; in-flight deals keep the rate they were created under.
      </p>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <>
          <div className="rounded-lg border border-gray-800 bg-[#11161D] p-4 mb-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Current status</span>
              <span className={active ? "text-green-400" : "text-yellow-400"}>
                {active ? "Fee active" : "Fee-free (no treasury set)"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-gray-400">Rate</span>
              <span className="text-gray-200">{feeBps} bps ({(feeBps / 100).toFixed(2)}% total · {buyerPct}% buyer + {sellerPct}% seller)</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-gray-400">Treasury</span>
              <span className="text-gray-200 font-mono text-xs break-all">{treasury || "— unset —"}</span>
            </div>
          </div>

          <label className="text-[12px] text-gray-400 block mb-1">Fee (basis points, 100 = 1%, max 500)</label>
          <input
            value={feeInput}
            onChange={(e) => setFeeInput(e.target.value)}
            inputMode="numeric"
            className="w-full px-3 py-2 text-sm bg-[#161B22] border border-gray-800 rounded outline-none focus:border-gray-600 mb-4"
          />

          <label className="text-[12px] text-gray-400 block mb-1">Treasury wallet (blank = unset / fee-free)</label>
          <input
            value={treasuryInput}
            onChange={(e) => setTreasuryInput(e.target.value)}
            placeholder="Treasury USDC owner wallet address"
            className="w-full px-3 py-2 text-sm bg-[#161B22] border border-gray-800 rounded outline-none focus:border-gray-600 font-mono mb-4"
          />

          {err && <p className="text-red-400 text-xs mb-3">{err}</p>}
          {msg && <p className="text-green-400 text-xs mb-3">{msg}</p>}

          <button
            onClick={save}
            disabled={busy}
            className="px-4 py-2 text-sm rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save fee settings"}
          </button>
          {!MOCK_CHAIN && (
            <p className="text-[11px] text-gray-600 mt-3">
              Signs an on-chain transaction; the connected wallet must be the config authority.
            </p>
          )}
        </>
      )}
    </div>
  );
}
