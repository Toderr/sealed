"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { PublicKey } from "@solana/web3.js";
import type { Deal, MilestoneProof } from "./types";

const STORAGE_PREFIX = "sealed:deals:";
const GUEST_KEY = "guest";

type SerializedDeal = Omit<
  Deal,
  "buyer" | "seller" | "mint" | "escrowTokenAccount" | "milestones"
> & {
  buyer: string;
  seller: string;
  mint: string;
  escrowTokenAccount: string;
  milestones: Array<{
    description: string;
    amount: number;
    status: Deal["milestones"][number]["status"];
    confirmedBy: string | null;
    confirmedAt: number | null;
    proof?: MilestoneProof;
  }>;
};

function serializeDeal(deal: Deal): SerializedDeal {
  return {
    ...deal,
    buyer: deal.buyer.toBase58(),
    seller: deal.seller.toBase58(),
    mint: deal.mint.toBase58(),
    escrowTokenAccount: deal.escrowTokenAccount.toBase58(),
    milestones: deal.milestones.map((m) => ({
      ...m,
      confirmedBy: m.confirmedBy ? m.confirmedBy.toBase58() : null,
    })),
  };
}

function deserializeDeal(data: SerializedDeal): Deal {
  return {
    ...data,
    buyer: new PublicKey(data.buyer),
    seller: new PublicKey(data.seller),
    mint: new PublicKey(data.mint),
    escrowTokenAccount: new PublicKey(data.escrowTokenAccount),
    milestones: data.milestones.map((m) => ({
      ...m,
      confirmedBy: m.confirmedBy ? new PublicKey(m.confirmedBy) : null,
    })),
  };
}

function storageKey(wallet: string | null): string {
  return `${STORAGE_PREFIX}${wallet ?? GUEST_KEY}`;
}

const EMPTY_DEALS: Deal[] = [];
const snapshotCache = new Map<string, { raw: string | null; deals: Deal[] }>();

function readSnapshot(key: string): Deal[] {
  if (typeof window === "undefined") return EMPTY_DEALS;
  const raw = window.localStorage.getItem(key);
  const cached = snapshotCache.get(key);
  if (cached && cached.raw === raw) return cached.deals;

  let deals: Deal[] = EMPTY_DEALS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as SerializedDeal[];
      deals = parsed.map(deserializeDeal);
    } catch (err) {
      console.error("Failed to parse deals from storage:", err);
    }
  }
  snapshotCache.set(key, { raw, deals });
  return deals;
}

function writeDeals(key: string, deals: Deal[]) {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(deals.map(serializeDeal));
    window.localStorage.setItem(key, serialized);
    snapshotCache.set(key, { raw: serialized, deals });
    // Notify same-tab subscribers (storage event only fires cross-tab).
    window.dispatchEvent(
      new CustomEvent("sealed:deals-updated", { detail: { key } })
    );
  } catch (err) {
    console.error("Failed to save deals to storage:", err);
  }
}

function subscribe(key: string, onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === key) onChange();
  };
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<{ key: string }>).detail;
    if (detail?.key === key) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("sealed:deals-updated", onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("sealed:deals-updated", onCustom);
  };
}

export function useDealsStore(wallet: PublicKey | null) {
  const walletKey = wallet ? wallet.toBase58() : null;
  const key = storageKey(walletKey);

  const deals = useSyncExternalStore(
    useCallback((cb) => subscribe(key, cb), [key]),
    useCallback(() => readSnapshot(key), [key]),
    () => EMPTY_DEALS
  );

  const addDeal = useCallback(
    (deal: Deal) => {
      writeDeals(key, [deal, ...readSnapshot(key)]);
    },
    [key]
  );

  const updateDeal = useCallback(
    (dealId: string, updater: (deal: Deal) => Deal) => {
      const next = readSnapshot(key).map((d) =>
        d.dealId === dealId ? updater(d) : d
      );
      writeDeals(key, next);
    },
    [key]
  );

  const removeDeal = useCallback(
    (dealId: string) => {
      writeDeals(
        key,
        readSnapshot(key).filter((d) => d.dealId !== dealId)
      );
    },
    [key]
  );

  return useMemo(
    () => ({ deals, addDeal, updateDeal, removeDeal }),
    [deals, addDeal, updateDeal, removeDeal]
  );
}
