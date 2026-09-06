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

export interface StreamChunk {
  content?: string;
  reasoning?: string;
}

/**
 * 构造 thinking 触发参数（按 base_url 判断网关格式）。
 * - DeepSeek 官方 / 智谱原生 / Kimi K2.x：`thinking: {type: "enabled"}`
 * - 阿里百炼 / QwenCloud（dashscope/aliyuncs）：`enable_thinking: true`
 * - 其他（默认 OpenAI 兼容）：发 `thinking.type`，不强行加避免不兼容网关报错
 */
function buildThinkingParam(config: LLMConfig): Record<string, unknown> | null {
  if (config.enableThinking === false) return null;
  const base = config.base_url.toLowerCase();
  if (base.includes("dashscope") || base.includes("aliyuncs")) {
    return { enable_thinking: true };
  }
  return { thinking: { type: "enabled" } };
}

export async function* streamLLM(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string
): AsyncGenerator<StreamChunk> {
  return yield* streamLLMChat(config, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

/**
 * 流式调用 chat/completions。
 * @param signal 外部中止信号（新流打断旧流用）：中止会真正取消底层 fetch 并静默结束生成器，
 *   让调用方把旧 entry 置 done 保留部分内容，而不是永久停在 streaming。
 * 超时语义：
 * - 连接超时 STREAMING_TIMEOUT_MS 只覆盖建连阶段，收到响应头即清除（流式过程无总体超时，防长回复被腰斩）。
 * - 空闲看门狗：建连后每收到一帧数据重置；网关静默挂起（无数据）超过阈值时中止并抛"请求超时"，
 *   避免 entry 永久停在 streaming（思考过程无限转圈）。
 */
export async function* streamLLMChat(
  config: LLMConfig,
  messages: { role: string; content: string }[],
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const controller = new AbortController();
  let abortedByExternal = false;
  const onExternalAbort = () => {
    abortedByExternal = true;
    controller.abort();
  };
  if (signal) {
    if (signal.aborted) {
      abortedByExternal = true;
      controller.abort();
    } else {
      signal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const connectTimer = setTimeout(() => controller.abort(), STREAMING_TIMEOUT_MS);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdleWatchdog = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), STREAMING_TIMEOUT_MS);
  };
  const clearIdleWatchdog = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

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
        stream: true,
        ...buildThinkingParam(config),
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

    clearTimeout(connectTimer);

    const reader = response.body?.getReader();
    if (!reader) throw new LLMError("无法读取响应流", "network");

    const decoder = new TextDecoder();
    let buffer = "";
    armIdleWatchdog();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      armIdleWatchdog();

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
          const delta = json.choices?.[0]?.delta;
          const content = delta?.content;
          const reasoning = delta?.reasoning_content ?? delta?.reasoning;
          if (content || reasoning) yield { content, reasoning };
        } catch {
          // skip malformed SSE lines
        }
      }
    }
  } catch (err) {
    if (err instanceof LLMError) throw err;
    if ((err as Error).name === "AbortError") {
      if (abortedByExternal) return;
      throw new LLMError("请求超时", "timeout");
    }
    throw new LLMError("网络连接失败", "network");
  } finally {
    clearTimeout(connectTimer);
    clearIdleWatchdog();
    if (signal) signal.removeEventListener("abort", onExternalAbort);
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
