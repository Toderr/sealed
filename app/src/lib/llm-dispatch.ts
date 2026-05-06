import Anthropic from "@anthropic-ai/sdk";

export type LlmMessage = {
  role: "user" | "assistant";
  content: string | Array<{ text: string } | { imageDataUrl: string }>;
};

export type LlmCallOptions = {
  provider: string;
  model: string;
  apiKey: string;
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
};

type OaiMessage = { role: string; content: string | unknown[] };

function toOaiMessages(system: string, messages: LlmMessage[]): OaiMessage[] {
  const out: OaiMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
    } else {
      const parts: unknown[] = [];
      for (const part of m.content) {
        if ("text" in part) {
          parts.push({ type: "text", text: part.text });
        } else if ("imageDataUrl" in part) {
          parts.push({ type: "image_url", image_url: { url: part.imageDataUrl } });
        }
      }
      out.push({ role: m.role, content: parts });
    }
  }
  return out;
}

async function callOpenAiCompat(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  messages: LlmMessage[],
  maxTokens: number
): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new Error("API key is empty — please save your API key in Profile settings.");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: toOaiMessages(system, messages),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content as string;
}

async function callGemini(
  apiKey: string,
  model: string,
  system: string,
  messages: LlmMessage[],
  maxTokens: number
): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new Error("API key is empty — please save your API key in Profile settings.");
  const contents = messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
    }
    const parts: unknown[] = [];
    for (const part of m.content) {
      if ("text" in part) {
        parts.push({ text: part.text });
      } else if ("imageDataUrl" in part) {
        const match = part.imageDataUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
        if (match) {
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
      }
    }
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callAnthropic(
  apiKey: string,
  model: string,
  system: string,
  messages: LlmMessage[],
  maxTokens: number
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: m.content };
    }
    const content: Anthropic.ContentBlockParam[] = [];
    for (const part of m.content) {
      if ("text" in part) {
        content.push({ type: "text", text: part.text });
      } else if ("imageDataUrl" in part) {
        const match = part.imageDataUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
        if (match) {
          content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: match[2],
            },
          });
        }
      }
    }
    return { role: m.role, content };
  });

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: anthropicMessages,
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

export async function dispatchLlm(opts: LlmCallOptions): Promise<string> {
  const maxTokens = opts.maxTokens ?? 1024;
  switch (opts.provider) {
    case "anthropic":
      return callAnthropic(opts.apiKey, opts.model, opts.system, opts.messages, maxTokens);
    case "openai":
      return callOpenAiCompat("https://api.openai.com/v1", opts.apiKey, opts.model, opts.system, opts.messages, maxTokens);
    case "groq":
      return callOpenAiCompat("https://api.groq.com/openai/v1", opts.apiKey, opts.model, opts.system, opts.messages, maxTokens);
    case "openrouter":
      return callOpenAiCompat("https://openrouter.ai/api/v1", opts.apiKey, opts.model, opts.system, opts.messages, maxTokens);
    case "gemini":
      return callGemini(opts.apiKey, opts.model, opts.system, opts.messages, maxTokens);
    default:
      throw new Error(`Unknown LLM provider: ${opts.provider}`);
  }
}

export function getLlmOptsFromEnv(): { provider: string; model: string; apiKey: string } | null {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4",
      apiKey: process.env.OPENROUTER_API_KEY,
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }
  return null;
}
