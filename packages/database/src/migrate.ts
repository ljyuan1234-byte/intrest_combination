import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const sslEnabled = process.env.DATABASE_SSL === 'true';
const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
const sslCa = process.env.DATABASE_SSL_CA ? await readFile(process.env.DATABASE_SSL_CA, 'utf8') : undefined;

const migrations = [
  {
    id: '0000_phase_1_identity',
    sqlUrl: new URL('../drizzle/0000_phase_1_identity.sql', import.meta.url),
  },
  {
    id: '0001_phase_2_tasks',
    sqlUrl: new URL('../drizzle/0001_phase_2_tasks.sql', import.meta.url),
  },
  {
    id: '0002_phase_2_finance',
    sqlUrl: new URL('../drizzle/0002_phase_2_finance.sql', import.meta.url),
  },
  {
    id: '0003_phase_2_health',
    sqlUrl: new URL('../drizzle/0003_phase_2_health.sql', import.meta.url),
  },
  {
    id: '0004_phase_2_calendar',
    sqlUrl: new URL('../drizzle/0004_phase_2_calendar.sql', import.meta.url),
  },
  {
    id: '0005_phase_2_health_profile',
    sqlUrl: new URL('../drizzle/0005_phase_2_health_profile.sql', import.meta.url),
  },
  {
    id: '0006_phase_3_health_agent',
    sqlUrl: new URL('../drizzle/0006_phase_3_health_agent.sql', import.meta.url),
  },
  {
    id: '0007_phase_4_password_auth',
    sqlUrl: new URL('../drizzle/0007_phase_4_password_auth.sql', import.meta.url),
  },
  {
    id: '0008_phase_4_health_conversations',
    sqlUrl: new URL('../drizzle/0008_phase_4_health_conversations.sql', import.meta.url),
  },
] as const;

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  ...(sslEnabled ? { ssl: { rejectUnauthorized, ...(sslCa ? { ca: sslCa } : {}) } } : {}),
});

try {
  await pool.query('BEGIN');
  // 防止多个实例同时执行迁移。事务结束时会自动释放。
  await pool.query('SELECT pg_advisory_xact_lock(847291365)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "__life_migrations" (
      "id" varchar(128) PRIMARY KEY,
      "applied_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);

  for (const migration of migrations) {
    const existing = await pool.query<{ id: string }>('SELECT id FROM "__life_migrations" WHERE id = $1', [migration.id]);

    if (existing.rowCount !== 0) {
      console.info(`Migration ${migration.id} was already applied.`);
      continue;
    }

    const sql = await readFile(migration.sqlUrl, 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO "__life_migrations" ("id") VALUES ($1)', [migration.id]);
    console.info(`Migration ${migration.id} applied.`);
  }

  await pool.query('COMMIT');
} catch (error) {
  await pool.query('ROLLBACK');
  throw error;
} finally {
  await pool.end();
}
