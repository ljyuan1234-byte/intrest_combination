import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type Database = ReturnType<typeof createDatabase>;

export type DatabaseOptions = {
  poolMax?: number;
  /**
   * 腾讯云 PostgreSQL 通常要求 SSL。传 { rejectUnauthorized: false } 可以连接
   * 没有本地 CA 的实例；生产环境如果配置了 CA，建议开启校验。
   */
  ssl?: boolean | { rejectUnauthorized?: boolean; ca?: string };
};

export function createDatabase(databaseUrl: string, options: DatabaseOptions = {}) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: options.poolMax ?? 10,
    ...(options.ssl === undefined ? {} : { ssl: options.ssl }),
  });

  return drizzle({ client: pool, schema });
}

export { schema };
