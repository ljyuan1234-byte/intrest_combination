import type { AppConfig } from '../config.js';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type LlmConfig = Pick<
  AppConfig,
  | 'LLM_BASE_URL'
  | 'LLM_API_KEY'
  | 'LLM_MODEL'
  | 'LLM_TIMEOUT_MS'
  | 'LLM_MAX_OUTPUT_TOKENS'
  | 'LLM_MAX_INPUT_CHARS'
>;

export type LlmUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type LlmResponse = {
  content: string;
  usage: LlmUsage;
};

export function isLlmConfigured(config: LlmConfig): config is LlmConfig & {
  LLM_BASE_URL: string;
  LLM_API_KEY: string;
  LLM_MODEL: string;
} {
  return Boolean(config.LLM_BASE_URL && config.LLM_API_KEY && config.LLM_MODEL);
}

/**
 * 调用 OpenAI 兼容的 /chat/completions。
 * 失败、输入过长或输出为空时返回 null，由调用方退回到确定性模板回复。
 */
export async function chatCompletion(config: LlmConfig, messages: ChatMessage[]): Promise<LlmResponse | null> {
  if (!isLlmConfigured(config)) return null;

  const inputChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  if (inputChars > config.LLM_MAX_INPUT_CHARS) return null;

  const url = `${config.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const isDeepSeek = /(^|\.)deepseek\.com$/i.test(new URL(config.LLM_BASE_URL).hostname);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.LLM_API_KEY}`,
      },
      signal: AbortSignal.timeout(config.LLM_TIMEOUT_MS),
      body: JSON.stringify({
        model: config.LLM_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: config.LLM_MAX_OUTPUT_TOKENS,
        // 健康解释不需要深度思考，关闭 DeepSeek thinking 以降低延迟和消耗。
        ...(isDeepSeek ? { thinking: { type: 'disabled' } } : {}),
      }),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return null;

    const inputTokens = Math.max(0, payload.usage?.prompt_tokens ?? 0);
    const outputTokens = Math.max(0, payload.usage?.completion_tokens ?? 0);
    const totalTokens = Math.max(0, payload.usage?.total_tokens ?? inputTokens + outputTokens);

    return {
      content: content.trim(),
      usage: { inputTokens, outputTokens, totalTokens },
    };
  } catch {
    return null;
  }
}
