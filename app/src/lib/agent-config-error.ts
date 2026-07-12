// True when an error means "your AI agent isn't set up" rather than a transient
// failure — no provider configured, or the configured key was rejected. These
// should route the user to Agent Setup, not read as a cryptic error message.
export function isAgentConfigError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    /no llm provider|not configured|no.*api key|missing.*key/.test(msg) ||
    /unauthor|invalid.*key|api key|authentication failed|\b401\b|\b403\b/.test(msg)
  );
}
