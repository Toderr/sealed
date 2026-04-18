"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Shared (not wallet-keyed) localStorage slot for mutual-refund partial-sign
// handoffs. Because each wallet's deals-store is isolated by pubkey, we need
// a cross-wallet channel to pass the partially-signed refund tx from the
// initiator to the counter-party. Same-browser demos see each other's slot
// directly; cross-browser users copy the base64 blob manually.

const STORAGE_KEY = "sealed:refund-handoffs";

export interface RefundHandoff {
  dealId: string;
  requestedBy: string; // base58 pubkey of initiator
  requestedAt: number; // unix seconds
  partialTxB64: string;
  blockhash: string; // for staleness detection (~90s window)
}

type Handoffs = Record<string, RefundHandoff>;

const EMPTY: Handoffs = {};
let cachedRaw: string | null = null;
let cachedValue: Handoffs = EMPTY;

function read(): Handoffs {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  if (!raw) {
    cachedValue = EMPTY;
    return cachedValue;
  }
  try {
    cachedValue = JSON.parse(raw) as Handoffs;
  } catch {
    cachedValue = EMPTY;
  }
  return cachedValue;
}

function write(next: Handoffs) {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(next);
  window.localStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw;
  cachedValue = next;
  window.dispatchEvent(new CustomEvent("sealed:refund-handoffs-updated"));
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  const onCustom = () => onChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener("sealed:refund-handoffs-updated", onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("sealed:refund-handoffs-updated", onCustom);
  };
}

export function useRefundHandoffs() {
  const handoffs = useSyncExternalStore(subscribe, read, () => EMPTY);

  const setHandoff = useCallback((h: RefundHandoff) => {
    const next = { ...read(), [h.dealId]: h };
    write(next);
  }, []);

  const clearHandoff = useCallback((dealId: string) => {
    const current = read();
    if (!(dealId in current)) return;
    const { [dealId]: _removed, ...rest } = current;
    void _removed;
    write(rest);
  }, []);

  return useMemo(
    () => ({ handoffs, setHandoff, clearHandoff }),
    [handoffs, setHandoff, clearHandoff]
  );
}
