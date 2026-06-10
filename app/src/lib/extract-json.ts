/**
 * Extract a JSON object from an LLM response. Models sometimes wrap output in
 * ```json ... ``` (or plain ``` ... ```) fences or surround it with prose, so we
 * pull the first {...} block and parse it.
 *
 * Previously duplicated verbatim in negotiation/engine.ts and the
 * verify-milestone route. `context` only customizes the not-found error message.
 *
 * NOTE: this is the brittle first-{ to last-} slice approach. A future pass
 * should move to provider structured-output / tool-use instead (see
 * Code analysis/sealed-negotiation-llm-analysis.md).
 */
export function extractJson<T>(text: string, context = "response"): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object found in ${context}`);
  }
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
