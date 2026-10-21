import { cosineSimilarity } from './embedding.js';

export type MemoryChunk = {
  id: string;
  content: string;
  conversationId: string;
  createdAt: Date;
  embedding?: number[] | null;
};

const STOP_WORDS = new Set(['今天', '明天', '然后', '可以', '什么', '怎么', '一个', '这个', '那个', '就是', '还是', '已经']);

/**
 * 轻量中文检索分词：ASCII 词 + 中文单字 + 中文双字。
 * 目的是在个人规模下做可解释的 RAG，不依赖外部 embedding 服务。
 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const latin = lower.match(/[a-z0-9]{2,}/g) ?? [];
  const cjk = lower.match(/[\u4e00-\u9fff]/g) ?? [];
  const bigrams: string[] = [];
  for (let i = 0; i < cjk.length - 1; i += 1) {
    bigrams.push(`${cjk[i]}${cjk[i + 1]}`);
  }

  return [...new Set([...latin, ...cjk, ...bigrams])].filter((token) => !STOP_WORDS.has(token));
}

/** 把长消息切成适合检索的小片段；保留句子边界。 */
export function chunkText(text: string, maxLength = 280): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const sentences = normalized.split(/(?<=[。！？；.!?;])/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > maxLength && current) {
      chunks.push(current.trim());
      current = '';
    }
    current += sentence;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function scoreMemory(query: string, content: string, createdAt: Date): number {
  const queryTokens = new Set(tokenize(query));
  const contentTokens = new Set(tokenize(content));
  if (queryTokens.size === 0 || contentTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) overlap += 1;
  }

  const lexical = overlap / Math.sqrt(queryTokens.size * contentTokens.size);
  const ageDays = Math.max(0, (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const recency = 1 / (1 + ageDays / 30);

  return lexical * 0.8 + recency * 0.2;
}

export function retrieveMemory(query: string, chunks: MemoryChunk[], limit = 5): MemoryChunk[] {
  return retrieveMemoryHybrid(query, chunks, limit, null);
}

/**
 * 混合检索：有 query embedding 时使用向量相似度 + 词法分数；否则纯词法。
 * 尚未生成 embedding 的旧切片仍然可以通过词法命中。
 */
export function retrieveMemoryHybrid(
  query: string,
  chunks: MemoryChunk[],
  limit = 5,
  queryEmbedding: number[] | null = null,
): MemoryChunk[] {
  return chunks
    .map((chunk) => {
      const lexical = scoreMemory(query, chunk.content, chunk.createdAt);
      let score = lexical;

      if (queryEmbedding && chunk.embedding && chunk.embedding.length === queryEmbedding.length) {
        const vector = Math.max(0, cosineSimilarity(queryEmbedding, chunk.embedding));
        score = lexical * 0.35 + vector * 0.65;
      }

      return { chunk, score };
    })
    .filter((item) => item.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk);
}
