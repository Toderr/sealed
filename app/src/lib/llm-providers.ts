// Single source of truth for the selectable LLM providers (bug #1).
//
// The onboarding "train your agent" step and the profile "agent setup" panel
// previously each hardcoded their own provider array, which drifted — onboarding
// was missing DeepSeek. Both now consume this list so they can't diverge.

import type { LLMProvider } from "@/lib/profile-store";

export type LlmProviderOption = {
  id: LLMProvider;
  label: string;
  /** Example key prefix, shown as an input hint where relevant. */
  hint: string;
};

/** All providers a user can pick their own key for. */
export const LLM_PROVIDERS: LlmProviderOption[] = [
  { id: "anthropic", label: "Anthropic", hint: "sk-ant-..." },
  { id: "openai", label: "OpenAI", hint: "sk-..." },
  { id: "groq", label: "Groq", hint: "gsk_..." },
  { id: "gemini", label: "Gemini", hint: "AIza..." },
  { id: "openrouter", label: "OpenRouter", hint: "sk-or-..." },
  { id: "deepseek", label: "DeepSeek", hint: "sk-..." },
];
