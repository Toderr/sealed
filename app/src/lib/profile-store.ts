"use client";

import { useState, useEffect } from "react";

export type SocialLinks = {
  twitter: string;
  telegram: string;
  instagram: string;
  linkedin: string;
  website: string;
};

export type LLMProvider = "openai" | "anthropic" | "groq" | "gemini" | "openrouter";

export type LLMConfig =
  | { mode: "own-key"; provider: LLMProvider; apiKey: string; model: string }
  | { mode: "x402"; balance: number; model: string }; // balance in USD cents

export const X402_MODELS: { id: string; label: string; costPer1k: number }[] =
  [
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", costPer1k: 0.8 },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", costPer1k: 3.0 },
    { id: "gpt-4o-mini", label: "GPT-4o mini", costPer1k: 0.6 },
    { id: "gpt-4o", label: "GPT-4o", costPer1k: 5.0 },
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq)", costPer1k: 0.4 },
  ];

export const X402_TOP_UP_AMOUNTS = [
  { usd: 5, label: "$5" },
  { usd: 10, label: "$10", popular: true },
  { usd: 25, label: "$25" },
  { usd: 50, label: "$50" },
];

export type UserProfile = {
  name: string;
  username: string;
  bio: string;
  socials: SocialLinks;
  companyFileUrl?: string;
  companyFileName?: string;
  llmConfig?: LLMConfig;
  onboardingComplete: boolean;
  createdAt: number;
  updatedAt: number;
};

export const LLM_MODELS: Record<LLMProvider, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  anthropic: [
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
  ],
  groq: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  openrouter: [
    "anthropic/claude-sonnet-4",
    "openai/gpt-4o",
    "google/gemini-2.5-pro",
    "meta-llama/llama-3.3-70b-instruct",
  ],
};

const EMPTY_SOCIALS: SocialLinks = {
  twitter: "",
  telegram: "",
  instagram: "",
  linkedin: "",
  website: "",
};

function storageKey(wallet: string) {
  return `sealed:profile:${wallet}`;
}

export function loadProfileFromStorage(wallet: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(storageKey(wallet));
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function persist(wallet: string, profile: UserProfile) {
  localStorage.setItem(storageKey(wallet), JSON.stringify(profile));
}

export function useProfileStore(wallet: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!wallet) {
      setProfile(null);
      setLoaded(true);
      return;
    }
    setProfile(loadProfileFromStorage(wallet));
    setLoaded(true);
  }, [wallet]);

  function updateProfile(updates: Partial<UserProfile>) {
    if (!wallet) return;
    const now = Date.now();
    const next: UserProfile = profile
      ? { ...profile, ...updates, updatedAt: now }
      : {
          name: "",
          username: "",
          bio: "",
          socials: EMPTY_SOCIALS,
          onboardingComplete: false,
          createdAt: now,
          updatedAt: now,
          ...updates,
        };
    setProfile(next);
    persist(wallet, next);
  }

  return { profile, loaded, updateProfile };
}

export type InvitePayload = {
  dealId: string;
  dealTitle: string;
  inviterName: string;
  inviterWallet: string;
  amount: number;
  currency: string;
  milestoneCount: number;
  milestones: Array<{ description: string; amount: number }>;
  description: string;
};

export function encodeInvite(payload: InvitePayload): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

export function decodeInvite(token: string): InvitePayload | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(token))));
  } catch {
    return null;
  }
}
