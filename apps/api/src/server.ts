import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { and, eq, isNull, sql } from 'drizzle-orm';
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
  healthProfileSchema,
  healthRecordSchema,
  reminderSchema,
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
  healthProfiles,
  healthRecords,
  idempotencyKeys,
  reminders,
  sessions,
  tasks,
  users,
} from '@life/database/schema';
import { z } from 'zod';
import {
  consumeLoginChallenge,
  createLoginChallenge,
  createSession,
  getCurrentUser,
  revokeCurrentSession,
  writeAuditLog,
} from './auth.js';
import { readConfig } from './config.js';

const config = readConfig();
const db = createDatabase(config.DATABASE_URL);
const app = Fastify({
  logger: {
    redact: ['req.headers.cookie', 'req.headers.authorization'],
  },
});

const emailSchema = z.object({
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
});

const verifySchema = z.object({
  token: z.string().min(32).max(256),
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
  return healthProfileSchema.parse({
    heightCm: profile.heightCm,
    birthYear: profile.birthYear,
    goal: profile.goal,
    allergies: profile.allergies,
    dietaryPreferences: profile.dietaryPreferences,
    exerciseLimitations: profile.exerciseLimitations,
    availableTime: profile.availableTime,
    updatedAt: profile.updatedAt.toISOString(),
  });
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

await app.register(cors, {
  origin: config.APP_ORIGIN,
  credentials: true,
});
await app.register(cookie);

app.addHook('onRequest', async (request, reply) => {
  reply.header('x-request-id', request.id);
});

app.get('/health', async () => ({ status: 'ok' }));

app.post('/api/v1/auth/login', async (request, reply) => {
  const parsed = emailSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '请提供有效邮箱地址。');
  }

  if (config.NODE_ENV === 'production' && !config.AUTH_DEV_MODE) {
    return sendError(reply, request.id, 503, 'DEPENDENCY_UNAVAILABLE', '邮件投递服务尚未配置。');
  }

  const challenge = await createLoginChallenge(db, request, parsed.data.email);

  if (config.AUTH_DEV_MODE) {
    request.log.info(
      { authEvent: 'development_login_challenge', email: parsed.data.email, token: challenge.token },
      'Development-only login challenge created',
    );
  }

  return sendData(reply, request.id, {
    message: '登录链接已生成，请查看已配置的邮箱投递渠道。',
    expiresAt: challenge.expiresAt.toISOString(),
  });
});

app.post('/api/v1/auth/verify', async (request, reply) => {
  const parsed = verifySchema.safeParse(request.body);
  if (!parsed.success) {
    return sendError(reply, request.id, 400, 'VALIDATION_ERROR', '登录凭证无效。');
  }

  const user = await consumeLoginChallenge(db, request, parsed.data.token);
  if (!user) {
    return sendError(reply, request.id, 401, 'UNAUTHENTICATED', '登录凭证无效或已过期。');
  }

  await createSession(db, reply, config, user);
  await writeAuditLog(db, request, 'auth.login_succeeded', user.id);
  return sendData(reply, request.id, { user });
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
