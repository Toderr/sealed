import { loadProfileFromStorage } from "./profile-store";

export function getLlmHeaders(wallet: string | null): Record<string, string> {
  if (!wallet) return {};
  try {
    const profile = loadProfileFromStorage(wallet);
    if (profile?.llmConfig?.mode === "own-key" && profile.llmConfig.apiKey) {
      const { provider, model, apiKey } = profile.llmConfig;
      return {
        "x-llm-provider": provider,
        "x-llm-model": model,
        "x-llm-key": apiKey,
      };
    }
  } catch {
    // localStorage unavailable (SSR guard)
  }
  return {};
}
