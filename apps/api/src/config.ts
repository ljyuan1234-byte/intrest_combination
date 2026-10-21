import { z } from 'zod';

const environmentSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),

  /**
   * 腾讯云 PostgreSQL 使用 SSL 时设置为 true。
   * 连接串也可以直接带 ?sslmode=require；两者同时存在时以这里为准。
   */
  DATABASE_URL: z.string().url(),
  DATABASE_SSL: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  /** 腾讯云 PostgreSQL CA 证书的本地路径；配置后可保持证书校验开启。 */
  DATABASE_SSL_CA: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(50).default(10),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must contain at least 32 characters.'),

  /** 可选：OpenAI 兼容的对话模型，用于追问、解释和计划文案。 */
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().min(1).optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(30_000),

  /**
   * 可选：OpenAI 兼容的 embedding 服务。
   * DeepSeek 官方 API 目前不提供 embedding，因此这里需要单独的供应商。
   */
  EMBEDDING_BASE_URL: z.string().url().optional(),
  EMBEDDING_API_KEY: z.string().min(1).optional(),
  EMBEDDING_MODEL: z.string().min(1).optional(),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().optional(),
  /** Qwen text-embedding-v3/v4 单次最多 10 条输入。 */
  EMBEDDING_BATCH_SIZE: z.coerce.number().int().positive().max(64).default(10),
  EMBEDDING_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(30_000),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function readConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse(environment);
}
