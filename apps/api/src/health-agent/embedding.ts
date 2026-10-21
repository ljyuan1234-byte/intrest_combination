import type { AppConfig } from '../config.js';

type EmbeddingConfig = Pick<
  AppConfig,
  | 'EMBEDDING_BASE_URL'
  | 'EMBEDDING_API_KEY'
  | 'EMBEDDING_MODEL'
  | 'EMBEDDING_DIMENSIONS'
  | 'EMBEDDING_BATCH_SIZE'
  | 'EMBEDDING_TIMEOUT_MS'
>;

type ConfiguredEmbedding = EmbeddingConfig & {
  EMBEDDING_BASE_URL: string;
  EMBEDDING_API_KEY: string;
  EMBEDDING_MODEL: string;
};

export function isEmbeddingConfigured(config: EmbeddingConfig): config is ConfiguredEmbedding {
  return Boolean(config.EMBEDDING_BASE_URL && config.EMBEDDING_API_KEY && config.EMBEDDING_MODEL);
}

async function embedBatch(config: ConfiguredEmbedding, texts: string[]): Promise<number[][] | null> {
  const url = `${config.EMBEDDING_BASE_URL.replace(/\/$/, '')}/embeddings`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.EMBEDDING_API_KEY}`,
      },
      signal: AbortSignal.timeout(config.EMBEDDING_TIMEOUT_MS),
      body: JSON.stringify({
        model: config.EMBEDDING_MODEL,
        input: texts,
        encoding_format: 'float',
        ...(config.EMBEDDING_DIMENSIONS ? { dimensions: config.EMBEDDING_DIMENSIONS } : {}),
      }),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
    };

    if (!Array.isArray(payload.data) || payload.data.length !== texts.length) return null;

    const vectors = [...payload.data]
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((item) => item.embedding);

    if (vectors.some((vector) => !Array.isArray(vector) || vector.length === 0)) return null;
    return vectors as number[][];
  } catch {
    return null;
  }
}

/**
 * 调用 OpenAI 兼容的 /embeddings，并按批处理。
 * Qwen text-embedding-v3/v4 单次最多 10 条，因此默认 batch=10。
 * 任一批失败时返回 null，RAG 自动退回词法检索。
 */
export async function embedTexts(config: EmbeddingConfig, texts: string[]): Promise<number[][] | null> {
  if (!isEmbeddingConfigured(config) || texts.length === 0) return null;

  const batchSize = Math.max(1, config.EMBEDDING_BATCH_SIZE || 10);
  const allVectors: number[][] = [];

  for (let offset = 0; offset < texts.length; offset += batchSize) {
    const batch = texts.slice(offset, offset + batchSize);
    const vectors = await embedBatch(config, batch);
    if (!vectors) return null;
    allVectors.push(...vectors);
  }

  return allVectors;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
