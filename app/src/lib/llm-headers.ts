// API keys must never transit through the server. LLM provider is always
// server-side env var only. This function intentionally returns no credentials.
export function getLlmHeaders(_wallet: string | null): Record<string, string> {
  return {};
}
