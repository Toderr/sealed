"use client";

import { loadProfileFromStorage } from "@/lib/profile-store";

// Forward the user's own-key LLM config to the API as request headers
// (x-llm-provider / x-llm-model / x-llm-key). The server reads these in
// getLlmOptsFromRequest and uses them for THAT request only — the key is never
// persisted server-side. Without an own-key config, returns {} and the server
// falls back to its own env provider.
//
// Only "own-key" mode carries a key; "x402" (managed billing) has no user key
// to forward, so it defers to the server.
export function getLlmHeaders(wallet: string | null): Record<string, string> {
  if (!wallet || typeof window === "undefined") return {};

  const profile = loadProfileFromStorage(wallet);
  const cfg = profile?.llmConfig;
  if (!cfg || cfg.mode !== "own-key") return {};
  if (!cfg.provider || !cfg.apiKey) return {};

  return {
    "x-llm-provider": cfg.provider,
    "x-llm-model": cfg.model || "",
    "x-llm-key": cfg.apiKey,
  };
}
