import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

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
] as const;

const pool = new Pool({ connectionString: databaseUrl });

try {
  await pool.query('BEGIN');
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
