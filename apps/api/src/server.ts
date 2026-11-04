import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { readFileSync } from 'node:fs';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import Fastify from 'fastify';
import {
  createCalendarEventSchema,
  createExpenseCategorySchema,
  createExpenseSchema,
  createHealthRecordSchema,
  createReminderSchema,
  createTaskSchema,
  calendarEventSchema,
  dashboardSchema,
  expenseCategorySchema,
  expenseSchema,
  financeSummarySchema,
  healthAdviceSchema,
  healthAgentResponseSchema,
  healthChatRequestSchema,
  healthChatResponseSchema,
  healthConversationSchema,
  healthIntakeLogSchema,
  healthModeSchema,
  healthProfileSchema,
  healthRecordSchema,
  loginSchema,
  registerSchema,
  reminderSchema,
  saveHealthIntakeSchema,
  taskSchema,
  updateCalendarEventSchema,
  updateExpenseSchema,
  updateHealthProfileSchema,
  updateTaskSchema,
} from '@life/contracts';
import { createDatabase } from '@life/database';
import {
  auditLogs,
  calendarEvents,
  devices,
  expenseCategories,
  expenses,
  healthIntakeLogs,
  healthMemoryChunks,
  healthMessages,
  healthConversations,
  healthProfiles,
  healthRecords,
  idempotencyKeys,
  llmUsageLogs,
  reminders,
  sessions,
  tasks,
  users,
} from '@life/database/schema';
import { z } from 'zod';
import {
  createSession,
  getClientIp,
  getCurrentUser,
  revokeCurrentSession,
  writeAuditLog,
} from './auth.js';
import { readConfig } from './config.js';
import { composeChatReply } from './health-agent/chat.js';
import { embedTexts, isEmbeddingConfigured } from './health-agent/embedding.js';
import { parseFoodText, runHealthAgent } from './health-agent/index.js';
import { chunkText, retrieveMemoryHybrid, tokenize } from './health-agent/memory.js';
import { parseDailyMetrics } from './health-agent/metrics.js';
import { parseIdentity } from './identity.js';
import { clearLoginFailures, isLoginBlocked, recordLoginFailure } from './login-rate-limit.js';
import { hashPassword, verifyPassword } from './password.js';

const config = readConfig();
const databaseSsl = config.DATABASE_SSL
  ? {
      rejectUnauthorized: config.DATABASE_SSL_REJECT_UNAUTHORIZED,
      ...(config.DATABASE_SSL_CA ? { ca: readFileSync(config.DATABASE_SSL_CA, 'utf8') } : {}),
    }
  : undefined;

const db = createDatabase(config.DATABASE_URL, {
  poolMax: config.DATABASE_POOL_MAX,
  ssl: databaseSsl,
});
const app = Fastify({
  logger: {
    redact: ['req.headers.cookie', 'req.headers.authorization'],
  },
});

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(120).nullable(),
});

const taskParamsSchema = z.object({
  id: z.string().uuid(),
});

const deleteAccountSchema = z.object({
  confirmation: z.literal('DELETE'),
});

function serializeTask(task: typeof tasks.$inferSelect) {
  return taskSchema.parse({
    id: task.id,
    title: task.title,
    status: task.status,
    dueAt: task.dueAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  });
}

function serializeHealthProfile(profile: typeof healthProfiles.$inferSelect) {
  const sex = profile.sex === 'male' || profile.sex === 'female' || profile.sex === 'other' ? profile.sex : null;
  const activityLevel =
    profile.activityLevel === 'low' || profile.activityLevel === 'high' ? profile.activityLevel : 'medium';

  return healthProfileSchema.parse({
    heightCm: profile.heightCm,
    birthYear: profile.birthYear,
    sex,
    weightKg: profile.weightKg,
    targetWeightKg: profile.targetWeightKg,
    activityLevel,
    goal: profile.goal,
    allergies: profile.allergies,
    dietaryPreferences: profile.dietaryPreferences,
    exerciseLimitations: profile.exerciseLimitations,
    availableTime: profile.availableTime,
    updatedAt: profile.updatedAt.toISOString(),
  });
}

function serializeHealthIntake(log: typeof healthIntakeLogs.$inferSelect) {
  return healthIntakeLogSchema.parse({
    id: log.id,
    localDate: log.localDate,
    mode: log.mode === 'fat_loss' ? 'fat_loss' : 'wellness',
    rawText: log.rawText,
    waterMl: log.waterMl,
    totalCalories: log.totalCalories,
    proteinG: log.proteinG,
    carbsG: log.carbsG,
    fatG: log.fatG,
    items: log.items,
    updatedAt: log.updatedAt.toISOString(),
  });
}

function todayInShanghai(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

async function buildHealthAgentResponse(
  userId: string,
  date: string,
  requestedMode: 'wellness' | 'fat_loss',
) {
  const [[profileRow], [weightRow], [intakeRow], dailyMetricRows] = await Promise.all([
    db.select().from(healthProfiles).where(eq(healthProfiles.userId, userId)).limit(1),
    db
      .select({ valueNumber: healthRecords.valueNumber })
      .from(healthRecords)
      .where(
        and(
          eq(healthRecords.userId, userId),
          eq(healthRecords.metric, 'weight'),
          isNull(healthRecords.deletedAt),
        ),
      )
      .orderBy(desc(healthRecords.recordedAt))
      .limit(1),
    db
      .select()
      .from(healthIntakeLogs)
      .where(and(eq(healthIntakeLogs.userId, userId), eq(healthIntakeLogs.localDate, date)))
      .limit(1),
    db
      .select({
        metric: healthRecords.metric,
        valueNumber: healthRecords.valueNumber,
      })
      .from(healthRecords)
      .where(
        and(
          eq(healthRecords.userId, userId),
          eq(healthRecords.localDate, date),
          inArray(healthRecords.metric, ['weight', 'sleep', 'exercise']),
          isNull(healthRecords.deletedAt),
        ),
      )
      .orderBy(desc(healthRecords.recordedAt)),
  ]);

  const latestMetric = (metric: string) =>
    dailyMetricRows.find((row) => row.metric === metric)?.valueNumber ?? null;

  const intake = intakeRow ? serializeHealthIntake(intakeRow) : null;
  const mode = intake?.mode ?? requestedMode;
  const { analysis, plan } = runHealthAgent({
    profile: profileRow ? serializeHealthProfile(profileRow) : null,
    latestWeightKg: weightRow?.valueNumber ?? null,
    intake,
    metrics: {
      weightKg: latestMetric('weight'),
      sleepMinutes: latestMetric('sleep'),
      exerciseMinutes: latestMetric('exercise'),
    },
    mode,
    date,
  });

  return healthAgentResponseSchema.parse({ intake, analysis, plan });
}

async function appendHealthIntake(
  userId: string,
  input: { localDate: string; mode: 'wellness' | 'fat_loss'; text: string; waterMl: number },
) {
  const food = parseFoodText(input.text);
  const now = new Date();
  const [existing] = await db
    .select()
    .from(healthIntakeLogs)
    .where(and(eq(healthIntakeLogs.userId, userId), eq(healthIntakeLogs.localDate, input.localDate)))
    .limit(1);

  if (existing) {
    const separator = existing.rawText && input.text ? '\n' : '';
    await db
      .update(healthIntakeLogs)
      .set({
        mode: input.mode,
        rawText: `${existing.rawText}${separator}${input.text}`.trim(),
        waterMl: existing.waterMl + input.waterMl,
        totalCalories: existing.totalCalories + food.totals.calories,
        proteinG: Math.round((existing.proteinG + food.totals.proteinG) * 10) / 10,
        carbsG: Math.round((existing.carbsG + food.totals.carbsG) * 10) / 10,
        fatG: Math.round((existing.fatG + food.totals.fatG) * 10) / 10,
        items: [...existing.items, ...food.items],
        updatedAt: now,
      })
      .where(eq(healthIntakeLogs.id, existing.id));
  } else {
    await db.insert(healthIntakeLogs).values({
      userId,
      localDate: input.localDate,
      mode: input.mode,
      rawText: input.text,
      waterMl: input.waterMl,
      totalCalories: food.totals.calories,
      proteinG: food.totals.proteinG,
      carbsG: food.totals.carbsG,
      fatG: food.totals.fatG,
      items: food.items,
      updatedAt: now,
    });
  }

  return food;
}

function serializeChatMessage(message: typeof healthMessages.$inferSelect) {
  const role =
    message.role === 'user' || message.role === 'assistant' || message.role === 'tool' || message.role === 'system'
      ? message.role
      : 'assistant';

  return {
    id: message.id,
    role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

function serializeConversation(conversation: typeof healthConversations.$inferSelect) {
  return healthConversationSchema.parse({
    id: conversation.id,
    mode: conversation.mode === 'fat_loss' ? 'fat_loss' : 'wellness',
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
  });
}

async function getOrCreateConversation(
  userId: string,
  conversationId: string | undefined,
  mode: 'wellness' | 'fat_loss',
  firstMessage: string,
) {
  if (conversationId) {
    const [existing] = await db
      .select()
      .from(healthConversations)
      .where(and(eq(healthConversations.id, conversationId), eq(healthConversations.userId, userId)))
      .limit(1);
    return existing ?? null;
  }

  const [created] = await db
    .insert(healthConversations)
    .values({
      userId,
      mode,
      title: firstMessage.slice(0, 40) || '健康对话',
    })
    .returning();

  return created;
}

async function saveMemoryChunks(
  userId: string,
  conversationId: string,
  messageId: string,
  content: string,
) {
  const chunks = chunkText(content);
  const embeddings = await embedTexts(config, chunks);

  for (const [index, chunk] of chunks.entries()) {
    await db.insert(healthMemoryChunks).values({
      userId,
      conversationId,
      messageId,
      content: chunk,
      keywords: tokenize(chunk).join(' '),
      embedding: embeddings?.[index] ?? null,
    });
  }
}

function serializeHealthRecord(record: typeof healthRecords.$inferSelect) {
  return healthRecordSchema.parse({
    id: record.id,
    metric: record.metric,
    valueNumber: record.valueNumber,
    valueText: record.valueText,
    unit: record.unit,
    localDate: record.localDate,
    recordedAt: record.recordedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  });
}

function serializeCalendarEvent(event: typeof calendarEvents.$inferSelect) {
  return calendarEventSchema.parse({
    id: event.id,
    title: event.title,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    notes: event.notes,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  });
}

function serializeReminder(reminder: typeof reminders.$inferSelect) {
  return reminderSchema.parse({
    id: reminder.id,
    eventId: reminder.eventId,
    title: reminder.title,
    scheduledAt: reminder.scheduledAt.toISOString(),
    status: reminder.status,
    createdAt: reminder.createdAt.toISOString(),
  });
}

async function hasOwnedEvent(userId: string, eventId: string | null | undefined) {
  if (!eventId) return true;

  const [event] = await db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.id, eventId),
        eq(calendarEvents.userId, userId),
        isNull(calendarEvents.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(event);
}

function serializeExpenseCategory(category: typeof expenseCategories.$inferSelect) {
  return expenseCategorySchema.parse({
    id: category.id,
    name: category.name,
    color: category.color,
    createdAt: category.createdAt.toISOString(),
  });
}

function serializeExpense(expense: typeof expenses.$inferSelect) {
  return expenseSchema.parse({
    id: expense.id,
    amountMinor: expense.amountMinor,
    currency: expense.currency,
    occurredOn: expense.occurredOn,
    categoryId: expense.categoryId,
    merchant: expense.merchant,
    note: expense.note,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  });
}

async function hasOwnedCategory(userId: string, categoryId: string | null | undefined) {
  if (!categoryId) return true;

  const [category] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(
      and(
        eq(expenseCategories.id, categoryId),
        eq(expenseCategories.userId, userId),
        isNull(expenseCategories.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(category);
}

function sendData<T>(reply: { send: (payload: unknown) => unknown }, requestId: string, data: T) {
  return reply.send({ data, requestId });
}

function sendError(
  reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } },
  requestId: string,
  statusCode: number,
  code: string,
  message: string,
) {
  return reply.code(statusCode).send({ error: { code, message }, requestId });
}

type UserRow = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
};

function publicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}

await app.register(cors, {
  origin: config.APP_ORIGIN,
  credentials: true,
});
await app.register(cookie);

app.addHook('onRequest', async (request, reply) => {
  reply.header('x-request-id', request.id);
});

app.get('/health', async (request, reply) => {
  try {
    await db.execute(sql`select 1`);
    return { status: 'ok', database: 'ok' };
  } catch (error) {
    request.log.error({ err: error }, 'Database health check failed');
    return reply.code(503).send({ status: 'degraded', database: 'down' });
  }
});

app.post('/api/v1/auth/register', async (request, reply) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '注册信息无效。');
  }

  const identity = parseIdentity(parsed.data.identifier);
  if (!identity) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '请输入有效的邮箱或手机号。');
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const [user] = await db
      .insert(users)
      .values({
        email: identity.kind === 'email' ? identity.email : null,
        phone: identity.kind === 'phone' ? identity.phone : null,
        passwordHash,
        displayName: parsed.data.displayName ?? null,
      })
      .returning();

    await createSession(db, reply, config, user);
    await writeAuditLog(db, request, 'auth.registered', user.id, { method: identity.kind });

    return reply.code(201).send({ data: { user: publicUser(user) }, requestId: request.id });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return sendError(reply, request.id, 409, 'CONFLICT', '该邮箱或手机号已注册。');
    }
    throw error;
  }
});

app.post('/api/v1/auth/login', async (request, reply) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '请输入账号和密码。');
  }

  const identity = parseIdentity(parsed.data.identifier);
  if (!identity) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '请输入有效的邮箱或手机号。');
  }

  const rateLimitKey = `${getClientIp(request) ?? 'unknown'}:${identity.value}`;
  if (isLoginBlocked(rateLimitKey)) {
    await writeAuditLog(db, request, 'auth.login_rate_limited');
    return sendError(reply, request.id, 429, 'RATE_LIMITED', '尝试次数过多，请 15 分钟后再试。');
  }

  const [user] = await db
    .select()
    .from(users)
    .where(identity.kind === 'email' ? eq(users.email, identity.email) : eq(users.phone, identity.phone))
    .limit(1);

  const passwordValid = Boolean(
    user && !user.deletedAt && (await verifyPassword(parsed.data.password, user.passwordHash)),
  );

  if (!passwordValid) {
    recordLoginFailure(rateLimitKey);
    await writeAuditLog(db, request, 'auth.login_failed', user?.id);
    return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '邮箱/手机号或密码错误。');
  }

  clearLoginFailures(rateLimitKey);
  await createSession(db, reply, config, user);
  await writeAuditLog(db, request, 'auth.login_succeeded', user.id);
  return sendData(reply, request.id, { user: publicUser(user) });
});

app.post('/api/v1/auth/logout', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  await revokeCurrentSession(db, request, reply, config);

  if (user) {
    await writeAuditLog(db, request, 'auth.logout', user.id);
  }

  return sendData(reply, request.id, { loggedOut: true });
});

app.get('/api/v1/me', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) {
    return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');
  }

  return sendData(reply, request.id, { user });
});

app.patch('/api/v1/me', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) {
    return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');
  }

  const parsed = profileSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '个人资料格式无效。');
  }

  await db.update(users).set({ displayName: parsed.data.displayName, updatedAt: new Date() }).where(eq(users.id, user.id));

  await writeAuditLog(db, request, 'user.profile_updated', user.id);
  return sendData(reply, request.id, {
    user: { ...user, displayName: parsed.data.displayName },
  });
});

app.get('/api/v1/me/devices', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) {
    return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');
  }

  const userDevices = await db
    .select({
      id: devices.id,
      platform: devices.platform,
      timezone: devices.timezone,
      createdAt: devices.createdAt,
      revokedAt: devices.revokedAt,
    })
    .from(devices)
    .where(eq(devices.userId, user.id));

  return sendData(reply, request.id, { devices: userDevices });
});

app.delete('/api/v1/me/devices/:id', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) {
    return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');
  }

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '设备标识无效。');
  }

  const result = await db
    .update(devices)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(devices.id, params.data.id), eq(devices.userId, user.id)))
    .returning({ id: devices.id });

  if (result.length === 0) {
    return sendError(reply, request.id, 404, 'NOT_FOUND', '未找到此设备。');
  }

  await writeAuditLog(db, request, 'device.revoked', user.id, { deviceId: params.data.id });
  return sendData(reply, request.id, { revoked: true });
});

app.get('/api/v1/me/export', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const [userProfile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const [userTasks, userEvents, userReminders, userHealthProfile, userHealthRecords, userCategories, userExpenses] = await Promise.all([
    db.select().from(tasks).where(and(eq(tasks.userId, user.id), isNull(tasks.deletedAt))),
    db.select().from(calendarEvents).where(and(eq(calendarEvents.userId, user.id), isNull(calendarEvents.deletedAt))),
    db.select().from(reminders).where(eq(reminders.userId, user.id)),
    db.select().from(healthProfiles).where(eq(healthProfiles.userId, user.id)).limit(1),
    db.select().from(healthRecords).where(and(eq(healthRecords.userId, user.id), isNull(healthRecords.deletedAt))),
    db.select().from(expenseCategories).where(and(eq(expenseCategories.userId, user.id), isNull(expenseCategories.deletedAt))),
    db.select().from(expenses).where(and(eq(expenses.userId, user.id), isNull(expenses.deletedAt))),
  ]);

  await writeAuditLog(db, request, 'data.exported', user.id);

  return sendData(reply, request.id, {
    exportedAt: new Date().toISOString(),
    user: userProfile
      ? {
          id: userProfile.id,
          email: userProfile.email,
          phone: userProfile.phone,
          displayName: userProfile.displayName,
          createdAt: userProfile.createdAt.toISOString(),
        }
      : null,
    tasks: userTasks.map(serializeTask),
    calendarEvents: userEvents.map(serializeCalendarEvent),
    reminders: userReminders.map(serializeReminder),
    healthProfile: userHealthProfile[0] ? serializeHealthProfile(userHealthProfile[0]) : null,
    healthRecords: userHealthRecords.map(serializeHealthRecord),
    expenseCategories: userCategories.map(serializeExpenseCategory),
    expenses: userExpenses.map(serializeExpense),
  });
});

app.post('/api/v1/me/delete-account', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = deleteAccountSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '请输入 DELETE 以确认删除账户。');
  }

  const now = new Date();
  await db.update(users).set({ deletedAt: now, updatedAt: now }).where(eq(users.id, user.id));
  await db.update(sessions).set({ revokedAt: now, updatedAt: now }).where(eq(sessions.userId, user.id));
  await writeAuditLog(db, request, 'account.deleted', user.id);
  await revokeCurrentSession(db, request, reply, config);

  return sendData(reply, request.id, { deleted: true });
});

app.get('/api/v1/tasks', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, user.id), isNull(tasks.deletedAt)))
    .orderBy(tasks.status, tasks.dueAt, tasks.createdAt);

  return sendData(reply, request.id, { tasks: rows.map(serializeTask) });
});

app.post('/api/v1/tasks', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = createTaskSchema.safeParse(request.body);
  if (!parsed.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '待办内容无效。');

  const idempotencyKey = request.headers['idempotency-key'];
  const key = Array.isArray(idempotencyKey) ? idempotencyKey[0] : idempotencyKey;

  if (key && (key.length > 200 || key.length === 0)) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '幂等键无效。');
  }

  if (key) {
    const [existing] = await db
      .select({ responseJson: idempotencyKeys.responseJson })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.userId, user.id),
          eq(idempotencyKeys.scope, 'tasks.create'),
          eq(idempotencyKeys.key, key),
        ),
      )
      .limit(1);

    if (existing) return sendData(reply, request.id, existing.responseJson);
  }

  const [task] = await db
    .insert(tasks)
    .values({
      userId: user.id,
      title: parsed.data.title,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    })
    .returning();

  const response = { task: serializeTask(task) };

  if (key) {
    await db.insert(idempotencyKeys).values({
      userId: user.id,
      scope: 'tasks.create',
      key,
      responseJson: response,
    });
  }

  await writeAuditLog(db, request, 'task.created', user.id, { taskId: task.id });
  return reply.code(201).send({ data: response, requestId: request.id });
});

app.patch('/api/v1/tasks/:id', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const params = taskParamsSchema.safeParse(request.params);
  const parsed = updateTaskSchema.safeParse(request.body);
  if (!params.success || !parsed.success) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '待办更新内容无效。');
  }

  const now = new Date();
  const changes = parsed.data;
  const nextStatus = changes.status;
  const [task] = await db
    .update(tasks)
    .set({
      title: changes.title,
      dueAt: changes.dueAt === undefined ? undefined : changes.dueAt ? new Date(changes.dueAt) : null,
      status: nextStatus,
      completedAt: nextStatus === 'done' ? now : nextStatus ? null : undefined,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, params.data.id), eq(tasks.userId, user.id), isNull(tasks.deletedAt)))
    .returning();

  if (!task) return sendError(reply, request.id, 404, 'NOT_FOUND', '未找到此待办。');

  await writeAuditLog(db, request, 'task.updated', user.id, { taskId: task.id });
  return sendData(reply, request.id, { task: serializeTask(task) });
});

app.delete('/api/v1/tasks/:id', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const params = taskParamsSchema.safeParse(request.params);
  if (!params.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '待办标识无效。');

  const [task] = await db
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, params.data.id), eq(tasks.userId, user.id), isNull(tasks.deletedAt)))
    .returning({ id: tasks.id });

  if (!task) return sendError(reply, request.id, 404, 'NOT_FOUND', '未找到此待办。');

  await writeAuditLog(db, request, 'task.deleted', user.id, { taskId: task.id });
  return sendData(reply, request.id, { deleted: true });
});

app.get('/api/v1/calendar/events', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const events = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.userId, user.id), isNull(calendarEvents.deletedAt)))
    .orderBy(calendarEvents.startsAt);

  return sendData(reply, request.id, { events: events.map(serializeCalendarEvent) });
});

app.post('/api/v1/calendar/events', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = createCalendarEventSchema.safeParse(request.body);
  if (!parsed.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '日程内容无效。');

  const [event] = await db
    .insert(calendarEvents)
    .values({
      userId: user.id,
      title: parsed.data.title,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
      notes: parsed.data.notes ?? null,
    })
    .returning();

  await writeAuditLog(db, request, 'calendar.event_created', user.id, { eventId: event.id });
  return reply.code(201).send({ data: { event: serializeCalendarEvent(event) }, requestId: request.id });
});

app.patch('/api/v1/calendar/events/:id', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const params = taskParamsSchema.safeParse(request.params);
  const parsed = updateCalendarEventSchema.safeParse(request.body);
  if (!params.success || !parsed.success) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '日程更新内容无效。');
  }

  const [current] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, params.data.id), eq(calendarEvents.userId, user.id), isNull(calendarEvents.deletedAt)))
    .limit(1);

  if (!current) return sendError(reply, request.id, 404, 'NOT_FOUND', '未找到此日程。');

  const nextStartsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : current.startsAt;
  const nextEndsAt = parsed.data.endsAt === undefined ? current.endsAt : parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  if (nextEndsAt && nextEndsAt < nextStartsAt) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '结束时间不能早于开始时间。');
  }

  const [event] = await db
    .update(calendarEvents)
    .set({
      title: parsed.data.title,
      startsAt: nextStartsAt,
      endsAt: nextEndsAt,
      notes: parsed.data.notes,
      updatedAt: new Date(),
    })
    .where(eq(calendarEvents.id, current.id))
    .returning();

  await writeAuditLog(db, request, 'calendar.event_updated', user.id, { eventId: event.id });
  return sendData(reply, request.id, { event: serializeCalendarEvent(event) });
});

app.delete('/api/v1/calendar/events/:id', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const params = taskParamsSchema.safeParse(request.params);
  if (!params.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '日程标识无效。');

  const [event] = await db
    .update(calendarEvents)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(calendarEvents.id, params.data.id), eq(calendarEvents.userId, user.id), isNull(calendarEvents.deletedAt)))
    .returning({ id: calendarEvents.id });

  if (!event) return sendError(reply, request.id, 404, 'NOT_FOUND', '未找到此日程。');

  await db.update(reminders).set({ status: 'cancelled' }).where(eq(reminders.eventId, event.id));
  await writeAuditLog(db, request, 'calendar.event_deleted', user.id, { eventId: event.id });
  return sendData(reply, request.id, { deleted: true });
});

app.get('/api/v1/reminders', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const rows = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.userId, user.id), eq(reminders.status, 'pending')))
    .orderBy(reminders.scheduledAt);

  return sendData(reply, request.id, { reminders: rows.map(serializeReminder) });
});

app.post('/api/v1/reminders', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = createReminderSchema.safeParse(request.body);
  if (!parsed.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '提醒内容无效。');
  if (!(await hasOwnedEvent(user.id, parsed.data.eventId))) {
    return sendError(reply, request.id, 404, 'NOT_FOUND', '未找到关联日程。');
  }

  const header = request.headers['idempotency-key'];
  const key = Array.isArray(header) ? header[0] : header;
  if (key && (key.length === 0 || key.length > 200)) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '幂等键无效。');
  }

  if (key) {
    const [existing] = await db
      .select()
      .from(reminders)
      .where(and(eq(reminders.idempotencyKey, key), eq(reminders.userId, user.id)))
      .limit(1);

    if (existing) return sendData(reply, request.id, { reminder: serializeReminder(existing) });
  }

  const [reminder] = await db
    .insert(reminders)
    .values({
      userId: user.id,
      eventId: parsed.data.eventId ?? null,
      title: parsed.data.title,
      scheduledAt: new Date(parsed.data.scheduledAt),
      idempotencyKey: key,
    })
    .returning();

  await writeAuditLog(db, request, 'reminder.created', user.id, { reminderId: reminder.id });
  return reply.code(201).send({ data: { reminder: serializeReminder(reminder) }, requestId: request.id });
});

app.delete('/api/v1/reminders/:id', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const params = taskParamsSchema.safeParse(request.params);
  if (!params.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '提醒标识无效。');

  const [reminder] = await db
    .update(reminders)
    .set({ status: 'cancelled' })
    .where(and(eq(reminders.id, params.data.id), eq(reminders.userId, user.id), eq(reminders.status, 'pending')))
    .returning({ id: reminders.id });

  if (!reminder) return sendError(reply, request.id, 404, 'NOT_FOUND', '未找到此提醒。');

  await writeAuditLog(db, request, 'reminder.cancelled', user.id, { reminderId: reminder.id });
  return sendData(reply, request.id, { cancelled: true });
});

app.get('/api/v1/health/profile', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const [profile] = await db.select().from(healthProfiles).where(eq(healthProfiles.userId, user.id)).limit(1);
  return sendData(reply, request.id, {
    profile: profile ? serializeHealthProfile(profile) : null,
  });
});

app.put('/api/v1/health/profile', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = updateHealthProfileSchema.safeParse(request.body);
  if (!parsed.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '健康档案内容无效。');

  const now = new Date();
  const [profile] = await db
    .insert(healthProfiles)
    .values({
      userId: user.id,
      heightCm: parsed.data.heightCm ?? null,
      birthYear: parsed.data.birthYear ?? null,
      sex: parsed.data.sex ?? null,
      weightKg: parsed.data.weightKg ?? null,
      targetWeightKg: parsed.data.targetWeightKg ?? null,
      activityLevel: parsed.data.activityLevel ?? 'medium',
      goal: parsed.data.goal ?? null,
      allergies: parsed.data.allergies ?? null,
      dietaryPreferences: parsed.data.dietaryPreferences ?? null,
      exerciseLimitations: parsed.data.exerciseLimitations ?? null,
      availableTime: parsed.data.availableTime ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: healthProfiles.userId,
      set: {
        heightCm: parsed.data.heightCm,
        birthYear: parsed.data.birthYear,
        sex: parsed.data.sex,
        weightKg: parsed.data.weightKg,
        targetWeightKg: parsed.data.targetWeightKg,
        activityLevel: parsed.data.activityLevel,
        goal: parsed.data.goal,
        allergies: parsed.data.allergies,
        dietaryPreferences: parsed.data.dietaryPreferences,
        exerciseLimitations: parsed.data.exerciseLimitations,
        availableTime: parsed.data.availableTime,
        updatedAt: now,
      },
    })
    .returning();

  await writeAuditLog(db, request, 'health.profile_updated', user.id);
  return sendData(reply, request.id, { profile: serializeHealthProfile(profile) });
});

app.get('/api/v1/health/records', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const records = await db
    .select()
    .from(healthRecords)
    .where(and(eq(healthRecords.userId, user.id), isNull(healthRecords.deletedAt)))
    .orderBy(sql`${healthRecords.localDate} desc`, sql`${healthRecords.recordedAt} desc`);

  return sendData(reply, request.id, { records: records.map(serializeHealthRecord) });
});

app.post('/api/v1/health/records', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = createHealthRecordSchema.safeParse(request.body);
  if (!parsed.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '健康记录无效。');

  const record = parsed.data;
  const expectedUnits: Record<string, string> = {
    steps: 'count',
    sleep: 'min',
    water: 'ml',
    weight: 'kg',
    exercise: 'min',
    diet_note: 'text',
  };

  if (record.unit !== expectedUnits[record.metric]) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '指标单位不匹配。');
  }

  const [created] = await db
    .insert(healthRecords)
    .values({
      userId: user.id,
      metric: record.metric,
      valueNumber: 'valueNumber' in record ? record.valueNumber : null,
      valueText: 'valueText' in record ? record.valueText : null,
      unit: record.unit,
      localDate: record.localDate,
      recordedAt: new Date(),
    })
    .returning();

  await writeAuditLog(db, request, 'health.record_created', user.id, { recordId: created.id, metric: created.metric });
  return reply.code(201).send({ data: { record: serializeHealthRecord(created) }, requestId: request.id });
});

app.delete('/api/v1/health/records/:id', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const params = taskParamsSchema.safeParse(request.params);
  if (!params.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '健康记录标识无效。');

  const [record] = await db
    .update(healthRecords)
    .set({ deletedAt: new Date() })
    .where(and(eq(healthRecords.id, params.data.id), eq(healthRecords.userId, user.id), isNull(healthRecords.deletedAt)))
    .returning({ id: healthRecords.id });

  if (!record) return sendError(reply, request.id, 404, 'NOT_FOUND', '未找到此健康记录。');

  await writeAuditLog(db, request, 'health.record_deleted', user.id, { recordId: record.id });
  return sendData(reply, request.id, { deleted: true });
});

app.get('/api/v1/health/advice', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
  const [[todayRecord], [healthProfile]] = await Promise.all([
    db
      .select({ id: healthRecords.id })
      .from(healthRecords)
      .where(and(eq(healthRecords.userId, user.id), eq(healthRecords.localDate, today), isNull(healthRecords.deletedAt)))
      .limit(1),
    db.select().from(healthProfiles).where(eq(healthProfiles.userId, user.id)).limit(1),
  ]);

  const limitationNote = healthProfile?.exerciseLimitations
    ? '已注意到你填写了运动限制；请以自身感受和专业人员建议为准。'
    : '';
  const goalNote = healthProfile?.goal ? `你的已记录目标是“${healthProfile.goal}”。` : '';
  const suggestion = todayRecord
    ? `你今天已经完成健康记录。保持规律饮水、休息和适量活动。${goalNote} ${limitationNote}`.trim()
    : `记录今天的饮水、睡眠或锻炼后，助手会生成更贴合你的建议。${goalNote} ${limitationNote}`.trim();

  const advice = healthAdviceSchema.parse({
    hasTodayEntry: Boolean(todayRecord),
    suggestion,
    dataRange: todayRecord
      ? `基于 ${today} 的手动记录${healthProfile ? '及你主动保存的健康档案' : ''}。`
      : `当前没有可用于建议的今日健康记录${healthProfile ? '；已参考你主动保存的健康档案' : ''}。`,
    generatedAt: new Date().toISOString(),
    disclaimer: '本建议仅用于日常生活方式参考，不构成医疗诊断、处方、停药或紧急情况判断。',
  });

  return sendData(reply, request.id, advice);
});

app.get('/api/v1/health/agent', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = z
    .object({
      date: z.string().date().optional(),
      mode: healthModeSchema.optional(),
    })
    .safeParse(request.query);

  if (!parsed.success) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '日期或模式无效。');
  }

  const date = parsed.data.date ?? todayInShanghai();
  const response = await buildHealthAgentResponse(user.id, date, parsed.data.mode ?? 'wellness');
  return sendData(reply, request.id, response);
});

app.put('/api/v1/health/agent/intake', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = saveHealthIntakeSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '饮食记录无效。');
  }

  const food = parseFoodText(parsed.data.text);
  const now = new Date();

  const [log] = await db
    .insert(healthIntakeLogs)
    .values({
      userId: user.id,
      localDate: parsed.data.localDate,
      mode: parsed.data.mode,
      rawText: parsed.data.text,
      waterMl: parsed.data.waterMl,
      totalCalories: food.totals.calories,
      proteinG: food.totals.proteinG,
      carbsG: food.totals.carbsG,
      fatG: food.totals.fatG,
      items: food.items,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [healthIntakeLogs.userId, healthIntakeLogs.localDate],
      set: {
        mode: parsed.data.mode,
        rawText: parsed.data.text,
        waterMl: parsed.data.waterMl,
        totalCalories: food.totals.calories,
        proteinG: food.totals.proteinG,
        carbsG: food.totals.carbsG,
        fatG: food.totals.fatG,
        items: food.items,
        updatedAt: now,
      },
    })
    .returning();

  await writeAuditLog(db, request, 'health.agent_intake_saved', user.id, {
    date: parsed.data.localDate,
    mode: parsed.data.mode,
    calories: food.totals.calories,
  });

  const response = await buildHealthAgentResponse(user.id, parsed.data.localDate, parsed.data.mode);
  return sendData(reply, request.id, response);
});

app.post('/api/v1/health/agent/intake', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = saveHealthIntakeSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '饮食记录无效。');
  }

  const food = await appendHealthIntake(user.id, {
    localDate: parsed.data.localDate,
    mode: parsed.data.mode,
    text: parsed.data.text,
    waterMl: parsed.data.waterMl,
  });

  await writeAuditLog(db, request, 'health.agent_intake_appended', user.id, {
    date: parsed.data.localDate,
    mode: parsed.data.mode,
    calories: food.totals.calories,
  });

  const response = await buildHealthAgentResponse(user.id, parsed.data.localDate, parsed.data.mode);
  return sendData(reply, request.id, response);
});

app.get('/api/v1/health/llm-usage', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = z.object({ date: z.string().date().optional() }).safeParse(request.query);
  if (!parsed.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '日期无效。');

  const date = parsed.data.date ?? todayInShanghai();
  const [row] = await db
    .select({
      requests: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${llmUsageLogs.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${llmUsageLogs.outputTokens}), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(${llmUsageLogs.totalTokens}), 0)::int`,
    })
    .from(llmUsageLogs)
    .where(and(eq(llmUsageLogs.userId, user.id), eq(llmUsageLogs.localDate, date)));

  const requests = Number(row?.requests ?? 0);
  const totalTokens = Number(row?.totalTokens ?? 0);

  return sendData(reply, request.id, {
    date,
    model: config.LLM_MODEL ?? null,
    mode: config.LLM_MODE,
    requests,
    inputTokens: Number(row?.inputTokens ?? 0),
    outputTokens: Number(row?.outputTokens ?? 0),
    totalTokens,
    limits: {
      dailyRequests: config.LLM_DAILY_REQUEST_LIMIT,
      dailyTokens: config.LLM_DAILY_TOKEN_BUDGET,
      maxOutputTokens: config.LLM_MAX_OUTPUT_TOKENS,
      maxInputChars: config.LLM_MAX_INPUT_CHARS,
    },
    remaining: {
      requests: Math.max(0, config.LLM_DAILY_REQUEST_LIMIT - requests),
      tokens: Math.max(0, config.LLM_DAILY_TOKEN_BUDGET - totalTokens),
    },
  });
});

app.get('/api/v1/health/chat', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = z
    .object({ conversationId: z.string().uuid().optional() })
    .safeParse(request.query);
  if (!parsed.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '会话标识无效。');

  const [conversation] = parsed.data.conversationId
    ? await db
        .select()
        .from(healthConversations)
        .where(
          and(
            eq(healthConversations.id, parsed.data.conversationId),
            eq(healthConversations.userId, user.id),
          ),
        )
        .limit(1)
    : await db
        .select()
        .from(healthConversations)
        .where(eq(healthConversations.userId, user.id))
        .orderBy(desc(healthConversations.updatedAt))
        .limit(1);

  if (!conversation) {
    return sendData(reply, request.id, { conversation: null, messages: [] });
  }

  const messages = await db
    .select()
    .from(healthMessages)
    .where(eq(healthMessages.conversationId, conversation.id))
    .orderBy(healthMessages.createdAt)
    .limit(100);

  return sendData(reply, request.id, {
    conversation: serializeConversation(conversation),
    messages: messages.map(serializeChatMessage),
  });
});

app.post('/api/v1/health/chat', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = healthChatRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '消息无效。');
  }

  const date = parsed.data.date ?? todayInShanghai();
  const conversation = await getOrCreateConversation(
    user.id,
    parsed.data.conversationId,
    parsed.data.mode,
    parsed.data.message,
  );

  if (!conversation) {
    return sendError(reply, request.id, 404, 'NOT_FOUND', '未找到此会话。');
  }

  const [userMessage] = await db
    .insert(healthMessages)
    .values({
      conversationId: conversation.id,
      userId: user.id,
      role: 'user',
      content: parsed.data.message,
    })
    .returning();

  const food = parseFoodText(parsed.data.message);
  const matchedItems = food.items.filter((item) => item.matched);
  const dailyMetrics = parseDailyMetrics(parsed.data.message);

  const metricRecords = [
    { metric: 'weight', valueNumber: dailyMetrics.weightKg, unit: 'kg' },
    { metric: 'sleep', valueNumber: dailyMetrics.sleepMinutes, unit: 'min' },
    { metric: 'steps', valueNumber: dailyMetrics.steps, unit: 'count' },
    { metric: 'exercise', valueNumber: dailyMetrics.exerciseMinutes, unit: 'min' },
  ].filter((item) => item.valueNumber !== null);

  if (metricRecords.length > 0) {
    await db.insert(healthRecords).values(
      metricRecords.map((item) => ({
        userId: user.id,
        metric: item.metric,
        valueNumber: item.valueNumber,
        unit: item.unit,
        localDate: date,
        recordedAt: new Date(),
        source: 'chat',
      })),
    );
  }

  if (matchedItems.length > 0) {
    await appendHealthIntake(user.id, {
      localDate: date,
      mode: parsed.data.mode,
      text: parsed.data.message,
      waterMl: 0,
    });
  }

  if (dailyMetrics.waterMl) {
    await appendHealthIntake(user.id, {
      localDate: date,
      mode: parsed.data.mode,
      text: '',
      waterMl: dailyMetrics.waterMl,
    });
  }

  const state = await buildHealthAgentResponse(user.id, date, parsed.data.mode);

  const memoryRows = await db
    .select({
      id: healthMemoryChunks.id,
      content: healthMemoryChunks.content,
      conversationId: healthMemoryChunks.conversationId,
      createdAt: healthMemoryChunks.createdAt,
      embedding: healthMemoryChunks.embedding,
    })
    .from(healthMemoryChunks)
    .where(eq(healthMemoryChunks.userId, user.id))
    .orderBy(desc(healthMemoryChunks.createdAt))
    .limit(300);

  const queryEmbedding = isEmbeddingConfigured(config)
    ? ((await embedTexts(config, [parsed.data.message]))?.[0] ?? null)
    : null;

  if (isEmbeddingConfigured(config) && !queryEmbedding) {
    request.log.warn(
      { embeddingModel: config.EMBEDDING_MODEL },
      'Embedding request failed; falling back to lexical retrieval',
    );
  }

  const memory = retrieveMemoryHybrid(parsed.data.message, memoryRows, 5, queryEmbedding);

  const [llmToday] = await db
    .select({
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${llmUsageLogs.totalTokens}), 0)::int`,
    })
    .from(llmUsageLogs)
    .where(and(eq(llmUsageLogs.userId, user.id), eq(llmUsageLogs.localDate, date)));

  const llmTokensToday = Number(llmToday?.tokens ?? 0);
  const llmRequestsToday = Number(llmToday?.requests ?? 0);
  const allowLlm =
    llmTokensToday < config.LLM_DAILY_TOKEN_BUDGET && llmRequestsToday < config.LLM_DAILY_REQUEST_LIMIT;

  const { reply: assistantReply, execution, usage: llmUsage } = await composeChatReply({
    config,
    message: parsed.data.message,
    mode: state.analysis.mode,
    analysis: state.analysis,
    plan: state.plan,
    memory,
    loggedItems: matchedItems.map((item) => ({ name: item.name, calories: item.calories })),
    unknownCount: food.unknownCount,
    allowLlm,
  });

  if (llmUsage) {
    await db.insert(llmUsageLogs).values({
      userId: user.id,
      localDate: date,
      model: config.LLM_MODEL ?? 'unknown',
      inputTokens: llmUsage.inputTokens,
      outputTokens: llmUsage.outputTokens,
      totalTokens: llmUsage.totalTokens,
    });
  }

  const [assistantMessage] = await db
    .insert(healthMessages)
    .values({
      conversationId: conversation.id,
      userId: user.id,
      role: 'assistant',
      content: assistantReply,
      metadata: { execution },
    })
    .returning();

  await saveMemoryChunks(user.id, conversation.id, userMessage.id, parsed.data.message);
  await saveMemoryChunks(user.id, conversation.id, assistantMessage.id, assistantReply);

  await db
    .update(healthConversations)
    .set({ mode: parsed.data.mode, updatedAt: new Date() })
    .where(eq(healthConversations.id, conversation.id));

  const messages = await db
    .select()
    .from(healthMessages)
    .where(eq(healthMessages.conversationId, conversation.id))
    .orderBy(healthMessages.createdAt)
    .limit(100);

  const response = healthChatResponseSchema.parse({
    ...state,
    conversationId: conversation.id,
    reply: assistantReply,
    messages: messages.map(serializeChatMessage),
    execution,
  });

  await writeAuditLog(db, request, 'health.chat_message', user.id, {
    conversationId: conversation.id,
    intent: execution.intent,
  });

  return sendData(reply, request.id, response);
});

app.get('/api/v1/finance/categories', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const categories = await db
    .select()
    .from(expenseCategories)
    .where(and(eq(expenseCategories.userId, user.id), isNull(expenseCategories.deletedAt)))
    .orderBy(expenseCategories.name);

  return sendData(reply, request.id, { categories: categories.map(serializeExpenseCategory) });
});

app.post('/api/v1/finance/categories', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = createExpenseCategorySchema.safeParse(request.body);
  if (!parsed.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '消费分类无效。');

  const [category] = await db
    .insert(expenseCategories)
    .values({ userId: user.id, name: parsed.data.name, color: parsed.data.color })
    .onConflictDoNothing()
    .returning();

  if (!category) return sendError(reply, request.id, 409, 'CONFLICT', '已存在同名消费分类。');

  await writeAuditLog(db, request, 'finance.category_created', user.id, { categoryId: category.id });
  return reply.code(201).send({ data: { category: serializeExpenseCategory(category) }, requestId: request.id });
});

app.get('/api/v1/finance/expenses', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const rows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.userId, user.id), isNull(expenses.deletedAt)))
    .orderBy(sql`${expenses.occurredOn} desc`, sql`${expenses.createdAt} desc`);

  return sendData(reply, request.id, { expenses: rows.map(serializeExpense) });
});

app.post('/api/v1/finance/expenses', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = createExpenseSchema.safeParse(request.body);
  if (!parsed.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '消费记录无效。');
  if (!(await hasOwnedCategory(user.id, parsed.data.categoryId))) {
    return sendError(reply, request.id, 404, 'NOT_FOUND', '未找到此消费分类。');
  }

  const idempotencyHeader = request.headers['idempotency-key'];
  const key = Array.isArray(idempotencyHeader) ? idempotencyHeader[0] : idempotencyHeader;
  if (key && (key.length === 0 || key.length > 200)) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '幂等键无效。');
  }

  if (key) {
    const [existing] = await db
      .select({ responseJson: idempotencyKeys.responseJson })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.userId, user.id),
          eq(idempotencyKeys.scope, 'finance.expenses.create'),
          eq(idempotencyKeys.key, key),
        ),
      )
      .limit(1);

    if (existing) return sendData(reply, request.id, existing.responseJson);
  }

  const [expense] = await db
    .insert(expenses)
    .values({
      userId: user.id,
      amountMinor: parsed.data.amountMinor,
      currency: parsed.data.currency,
      occurredOn: parsed.data.occurredOn,
      categoryId: parsed.data.categoryId ?? null,
      merchant: parsed.data.merchant ?? null,
      note: parsed.data.note ?? null,
    })
    .returning();

  const response = { expense: serializeExpense(expense) };
  if (key) {
    await db.insert(idempotencyKeys).values({
      userId: user.id,
      scope: 'finance.expenses.create',
      key,
      responseJson: response,
    });
  }

  await writeAuditLog(db, request, 'finance.expense_created', user.id, { expenseId: expense.id });
  return reply.code(201).send({ data: response, requestId: request.id });
});

app.patch('/api/v1/finance/expenses/:id', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const params = taskParamsSchema.safeParse(request.params);
  const parsed = updateExpenseSchema.safeParse(request.body);
  if (!params.success || !parsed.success) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '消费记录更新无效。');
  }
  if (parsed.data.categoryId !== undefined && !(await hasOwnedCategory(user.id, parsed.data.categoryId))) {
    return sendError(reply, request.id, 404, 'NOT_FOUND', '未找到此消费分类。');
  }

  const [expense] = await db
    .update(expenses)
    .set({
      amountMinor: parsed.data.amountMinor,
      currency: parsed.data.currency,
      occurredOn: parsed.data.occurredOn,
      categoryId: parsed.data.categoryId,
      merchant: parsed.data.merchant,
      note: parsed.data.note,
      updatedAt: new Date(),
    })
    .where(and(eq(expenses.id, params.data.id), eq(expenses.userId, user.id), isNull(expenses.deletedAt)))
    .returning();

  if (!expense) return sendError(reply, request.id, 404, 'NOT_FOUND', '未找到此消费记录。');

  await writeAuditLog(db, request, 'finance.expense_updated', user.id, { expenseId: expense.id });
  return sendData(reply, request.id, { expense: serializeExpense(expense) });
});

app.delete('/api/v1/finance/expenses/:id', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const params = taskParamsSchema.safeParse(request.params);
  if (!params.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '消费记录标识无效。');

  const [expense] = await db
    .update(expenses)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(expenses.id, params.data.id), eq(expenses.userId, user.id), isNull(expenses.deletedAt)))
    .returning({ id: expenses.id });

  if (!expense) return sendError(reply, request.id, 404, 'NOT_FOUND', '未找到此消费记录。');

  await writeAuditLog(db, request, 'finance.expense_deleted', user.id, { expenseId: expense.id });
  return sendData(reply, request.id, { deleted: true });
});

app.get('/api/v1/finance/summary', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const parsed = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).safeParse(request.query);
  if (!parsed.success) return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '月份必须为 YYYY-MM。');

  const month = parsed.data.month;
  const rows = await db
    .select({
      categoryId: expenses.categoryId,
      categoryName: sql<string>`coalesce(${expenseCategories.name}, '未分类')`,
      totalMinor: sql<number>`sum(${expenses.amountMinor})`,
      currency: expenses.currency,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(and(eq(expenses.userId, user.id), isNull(expenses.deletedAt), sql`${expenses.occurredOn} like ${`${month}%`}`))
    .groupBy(expenses.categoryId, expenseCategories.name, expenses.currency);

  const currency = rows[0]?.currency ?? 'CNY';
  const totalMinor = rows.reduce((sum, row) => sum + Number(row.totalMinor), 0);
  const summary = financeSummarySchema.parse({
    month,
    totalMinor,
    currency,
    byCategory: rows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      totalMinor: Number(row.totalMinor),
    })),
  });

  return sendData(reply, request.id, summary);
});

app.get('/api/v1/dashboard', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) {
    return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');
  }

  const [taskSummary] = await db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'done')`,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, user.id), isNull(tasks.deletedAt)));

  const currentMonth = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
  const [todayHealthRecord] = await db
    .select({ id: healthRecords.id })
    .from(healthRecords)
    .where(
      and(
        eq(healthRecords.userId, user.id),
        eq(healthRecords.localDate, today),
        isNull(healthRecords.deletedAt),
      ),
    )
    .limit(1);

  const [financeSummary] = await db
    .select({
      totalMinor: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)`,
      currency: expenses.currency,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, user.id),
        isNull(expenses.deletedAt),
        sql`${expenses.occurredOn} like ${`${currentMonth}%`}`,
      ),
    )
    .groupBy(expenses.currency)
    .limit(1);

  const dashboard = dashboardSchema.parse({
    date: new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full' }).format(),
    tasks: { total: Number(taskSummary?.total ?? 0), completed: Number(taskSummary?.completed ?? 0) },
    health: {
      hasTodayEntry: Boolean(todayHealthRecord),
      suggestion: todayHealthRecord
        ? '你今天已经记录健康数据。保持规律饮水、休息和适量活动；如感到不适，请咨询专业医疗人员。'
        : '记录今天的饮水、睡眠或锻炼后，助手会生成更贴合你的建议。',
    },
    finance: {
      monthTotalCents: Number(financeSummary?.totalMinor ?? 0),
      currency: financeSummary?.currency ?? 'CNY',
    },
    modules: [
      { id: 'health', name: '健康建议', description: '上传日常数据，获得饮食和锻炼建议。', status: 'available' },
      { id: 'finance', name: '手动记账', description: '记录消费并查看本月趋势。', status: 'available' },
      { id: 'ticketing', name: '票务助手', description: '后续接入官方信息查询和提醒。', status: 'planned' },
    ],
  });

  return sendData(reply, request.id, dashboard);
});

app.get('/api/dashboard', async (_request, reply) => {
  return reply.code(308).header('location', '/api/v1/dashboard').send();
});

app.get('/api/v1/audit-log-count', async (request, reply) => {
  const user = await getCurrentUser(db, request);
  if (!user) return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '需要登录。');

  const logs = await db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.userId, user.id));
  return sendData(reply, request.id, { count: logs.length });
});

try {
  await app.listen({ host: '0.0.0.0', port: config.API_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

async function shutdown(signal: string) {
  app.log.info({ signal }, 'Shutting down API');
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
