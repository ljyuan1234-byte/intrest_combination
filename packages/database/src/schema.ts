import { bigint, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

const createdAt = timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 320 }).unique(),
    phone: varchar('phone', { length: 20 }),
    passwordHash: text('password_hash'),
    displayName: varchar('display_name', { length: 120 }),
    createdAt,
    updatedAt,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('users_phone_unique').on(table.phone)],
);

export const loginChallenges = pgTable(
  'login_challenges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 320 }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt,
  },
  (table) => [index('login_challenges_email_idx').on(table.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 32 }).notNull(),
    pushToken: text('push_token'),
    timezone: varchar('timezone', { length: 64 }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [index('devices_user_id_idx').on(table.userId)],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('todo'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index('tasks_user_id_status_idx').on(table.userId, table.status),
    index('tasks_user_id_due_at_idx').on(table.userId, table.dueAt),
  ],
);

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    notes: text('notes'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [index('calendar_events_user_starts_at_idx').on(table.userId, table.startsAt)],
);

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => calendarEvents.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    idempotencyKey: varchar('idempotency_key', { length: 200 }),
    createdAt,
  },
  (table) => [
    index('reminders_user_scheduled_at_idx').on(table.userId, table.scheduledAt),
    uniqueIndex('reminders_user_idempotency_key_unique').on(table.userId, table.idempotencyKey),
  ],
);

export const healthProfiles = pgTable('health_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  heightCm: doublePrecision('height_cm'),
  birthYear: bigint('birth_year', { mode: 'number' }),
  sex: varchar('sex', { length: 8 }),
  weightKg: doublePrecision('weight_kg'),
  targetWeightKg: doublePrecision('target_weight_kg'),
  activityLevel: varchar('activity_level', { length: 16 }).notNull().default('medium'),
  goal: varchar('goal', { length: 300 }),
  allergies: text('allergies'),
  dietaryPreferences: text('dietary_preferences'),
  exerciseLimitations: text('exercise_limitations'),
  availableTime: varchar('available_time', { length: 300 }),
  createdAt,
  updatedAt,
});

export const healthRecords = pgTable(
  'health_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    metric: varchar('metric', { length: 32 }).notNull(),
    valueNumber: doublePrecision('value_number'),
    valueText: text('value_text'),
    unit: varchar('unit', { length: 16 }).notNull(),
    localDate: varchar('local_date', { length: 10 }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    source: varchar('source', { length: 32 }).notNull().default('manual'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt,
  },
  (table) => [
    index('health_records_user_metric_date_idx').on(table.userId, table.metric, table.localDate),
    index('health_records_user_recorded_at_idx').on(table.userId, table.recordedAt),
  ],
);

export type HealthIntakeItemRecord = {
  name: string;
  raw: string;
  quantity: number;
  unit: string;
  grams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  matched: boolean;
};

export const healthIntakeLogs = pgTable(
  'health_intake_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    localDate: varchar('local_date', { length: 10 }).notNull(),
    mode: varchar('mode', { length: 16 }).notNull().default('wellness'),
    rawText: text('raw_text').notNull(),
    waterMl: integer('water_ml').notNull().default(0),
    totalCalories: integer('total_calories').notNull().default(0),
    proteinG: doublePrecision('protein_g').notNull().default(0),
    carbsG: doublePrecision('carbs_g').notNull().default(0),
    fatG: doublePrecision('fat_g').notNull().default(0),
    items: jsonb('items').$type<HealthIntakeItemRecord[]>().notNull().default([]),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex('health_intake_logs_user_date_unique').on(table.userId, table.localDate),
    index('health_intake_logs_user_updated_at_idx').on(table.userId, table.updatedAt),
  ],
);

export const healthConversations = pgTable(
  'health_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mode: varchar('mode', { length: 16 }).notNull().default('wellness'),
    title: varchar('title', { length: 200 }).notNull().default('健康对话'),
    createdAt,
    updatedAt,
  },
  (table) => [index('health_conversations_user_updated_at_idx').on(table.userId, table.updatedAt)],
);

export const healthMessages = pgTable(
  'health_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => healthConversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
  },
  (table) => [
    index('health_messages_conversation_created_at_idx').on(table.conversationId, table.createdAt),
    index('health_messages_user_created_at_idx').on(table.userId, table.createdAt),
  ],
);

export const healthMemoryChunks = pgTable(
  'health_memory_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => healthConversations.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => healthMessages.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    keywords: text('keywords').notNull().default(''),
    embedding: jsonb('embedding').$type<number[] | null>(),
    createdAt,
  },
  (table) => [index('health_memory_chunks_user_created_at_idx').on(table.userId, table.createdAt)],
);

export const llmUsageLogs = pgTable(
  'llm_usage_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    localDate: varchar('local_date', { length: 10 }).notNull(),
    model: varchar('model', { length: 120 }).notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    createdAt,
  },
  (table) => [
    index('llm_usage_logs_user_date_idx').on(table.userId, table.localDate),
    index('llm_usage_logs_created_at_idx').on(table.createdAt),
  ],
);

export const expenseCategories = pgTable(
  'expense_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 60 }).notNull(),
    color: varchar('color', { length: 7 }).notNull().default('#5c83a6'),
    createdAt,
    updatedAt,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('expense_categories_user_name_unique').on(table.userId, table.name)],
);

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('CNY'),
    occurredOn: varchar('occurred_on', { length: 10 }).notNull(),
    categoryId: uuid('category_id').references(() => expenseCategories.id, { onDelete: 'set null' }),
    merchant: varchar('merchant', { length: 120 }),
    note: text('note'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index('expenses_user_occurred_on_idx').on(table.userId, table.occurredOn),
    index('expenses_user_category_idx').on(table.userId, table.categoryId),
  ],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 100 }).notNull(),
    key: varchar('key', { length: 200 }).notNull(),
    responseJson: jsonb('response_json').notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex('idempotency_keys_user_scope_key_unique').on(table.userId, table.scope, table.key),
    index('idempotency_keys_user_id_created_at_idx').on(table.userId, table.createdAt),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 100 }).notNull(),
    requestId: varchar('request_id', { length: 100 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
  },
  (table) => [index('audit_logs_user_id_created_at_idx').on(table.userId, table.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
