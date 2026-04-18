"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { PublicKey } from "@solana/web3.js";
import type { MemoryStore } from "./interface";
import {
  BusinessMemory,
  createDefaultMemory,
} from "./types";

const STORAGE_PREFIX = "sealed:memory:";
const EVENT_NAME = "sealed:memory-updated";

function storageKey(wallet: string): string {
  return `${STORAGE_PREFIX}${wallet}`;
}

function readRaw(wallet: string): BusinessMemory | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(wallet));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BusinessMemory;
  } catch (err) {
    console.error("Failed to parse memory:", err);
    return null;
  }
}

function writeRaw(wallet: string, memory: BusinessMemory) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(wallet), JSON.stringify(memory));
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, { detail: { wallet } })
  );
}

// Implementation of MemoryStore backed by localStorage.
export class LocalStorageMemoryStore implements MemoryStore {
  async get(wallet: string): Promise<BusinessMemory | null> {
    return readRaw(wallet);
  }

  async update(
    wallet: string,
    patch: Partial<BusinessMemory>
  ): Promise<BusinessMemory> {
    const existing = readRaw(wallet) ?? createDefaultMemory(wallet);
    const next: BusinessMemory = {
      ...existing,
      ...patch,
      // deep-merge boundaries so partial updates don't wipe unrelated fields
      boundaries: patch.boundaries
        ? { ...existing.boundaries, ...patch.boundaries }
        : existing.boundaries,
      walletAddress: wallet,
      updatedAt: Math.floor(Date.now() / 1000),
    };
    writeRaw(wallet, next);
    return next;
  }
}

export const memoryStore = new LocalStorageMemoryStore();

// --- React hook ---
// Follows the pattern of deals-store.ts: useSyncExternalStore keeps every
// component in sync when memory mutates in another tab or same-tab update.

const snapshotCache = new Map<string, BusinessMemory | null>();

function readSnapshot(wallet: string): BusinessMemory | null {
  if (typeof window === "undefined") return null;
  if (snapshotCache.has(wallet)) return snapshotCache.get(wallet)!;
  const value = readRaw(wallet);
  snapshotCache.set(wallet, value);
  return value;
}

function invalidateSnapshot(wallet: string) {
  snapshotCache.delete(wallet);
}

function subscribe(wallet: string, onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const key = storageKey(wallet);
  const onStorage = (e: StorageEvent) => {
    if (e.key === key) {
      invalidateSnapshot(wallet);
      onChange();
    }
  };
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<{ wallet: string }>).detail;
    if (detail?.wallet === wallet) {
      invalidateSnapshot(wallet);
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT_NAME, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT_NAME, onCustom);
  };
}

export function useBusinessMemory(wallet: PublicKey | null) {
  const walletKey = wallet ? wallet.toBase58() : "";

  const memory = useSyncExternalStore(
    useCallback((cb) => subscribe(walletKey, cb), [walletKey]),
    useCallback(() => readSnapshot(walletKey), [walletKey]),
    () => null
  );

  const updateMemory = useCallback(
    async (patch: Partial<BusinessMemory>) => {
      if (!walletKey) return null;
      const next = await memoryStore.update(walletKey, patch);
      invalidateSnapshot(walletKey);
      return next;
    },
    [walletKey]
  );

  const resolvedMemory = useMemo(
    () => memory ?? (walletKey ? createDefaultMemory(walletKey) : null),
    [memory, walletKey]
  );

  return useMemo(
    () => ({ memory: resolvedMemory, updateMemory }),
    [resolvedMemory, updateMemory]
  );
}
