import type { LLMConfig } from "@/types";
import { STREAMING_TIMEOUT_MS } from "@/lib/constants";

export class LLMError extends Error {
  constructor(
    message: string,
    public code: "timeout" | "unauthorized" | "rate_limited" | "network" | "unknown"
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export async function* streamLLM(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string
): AsyncGenerator<string> {
  return yield* streamLLMChat(config, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

export async function* streamLLMChat(
  config: LLMConfig,
  messages: { role: string; content: string }[]
): AsyncGenerator<string> {
  const controller = new AbortController();
  const connectTimeout = setTimeout(() => controller.abort(), STREAMING_TIMEOUT_MS);

  try {
    const baseUrl = config.base_url.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (response.status === 401) {
      throw new LLMError("API Key 无效，请检查设置", "unauthorized");
    }
    if (response.status === 429) {
      throw new LLMError("API 额度已用尽", "rate_limited");
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new LLMError(text || `请求失败 (${response.status})`, "unknown");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new LLMError("无法读取响应流", "network");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // skip malformed SSE lines
        }
      }
    }
  } catch (err) {
    if (err instanceof LLMError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new LLMError("请求超时", "timeout");
    }
    throw new LLMError("网络连接失败", "network");
  } finally {
    clearTimeout(connectTimeout);
  }
}

export async function testConnection(config: LLMConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const baseUrl = config.base_url.replace(/\/+$/, "");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) return { ok: true, message: "连接成功" };
    if (response.status === 401) return { ok: false, message: "API Key 无效" };
    const text = await response.text().catch(() => "");
    return { ok: false, message: text || `请求失败 (${response.status})` };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return { ok: false, message: "连接超时" };
    }
    return { ok: false, message: "网络连接失败" };
  }
}
