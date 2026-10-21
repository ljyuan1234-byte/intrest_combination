import type { AppConfig } from '../config.js';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type LlmConfig = Pick<AppConfig, 'LLM_BASE_URL' | 'LLM_API_KEY' | 'LLM_MODEL' | 'LLM_TIMEOUT_MS'>;

export function isLlmConfigured(config: LlmConfig): config is LlmConfig & {
  LLM_BASE_URL: string;
  LLM_API_KEY: string;
  LLM_MODEL: string;
} {
  return Boolean(config.LLM_BASE_URL && config.LLM_API_KEY && config.LLM_MODEL);
}

/**
 * 调用 OpenAI 兼容的 /chat/completions。
 * 失败时返回 null，由调用方退回到确定性模板回复，不影响记账和计划生成。
 */
export async function chatCompletion(config: LlmConfig, messages: ChatMessage[]): Promise<string | null> {
  if (!isLlmConfigured(config)) return null;

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
        max_tokens: 800,
        // 健康解释不需要深度思考，关闭 DeepSeek thinking 以降低延迟。
        ...(isDeepSeek ? { thinking: { type: 'disabled' } } : {}),
      }),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim() ? content.trim() : null;
  } catch {
    return null;
  }
}
