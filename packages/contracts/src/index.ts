import { z } from 'zod';

export const dashboardSchema = z.object({
  date: z.string(),
  tasks: z.object({
    total: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
  }),
  health: z.object({
    hasTodayEntry: z.boolean(),
    suggestion: z.string(),
  }),
  finance: z.object({
    monthTotalCents: z.number().int().nonnegative(),
    currency: z.string(),
  }),
  modules: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      status: z.enum(['available', 'planned']),
    }),
  ),
});

export const taskStatusSchema = z.enum(['todo', 'done', 'cancelled']);

export const taskSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  dueAt: z.string().datetime().nullable(),
  status: taskStatusSchema,
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  dueAt: z.string().datetime().nullable().optional(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    status: taskStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少提供一个待更新字段。');

export const calendarEventSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const calendarEventInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const createCalendarEventSchema = calendarEventInputSchema.refine(
  (value) => !value.endsAt || new Date(value.endsAt) >= new Date(value.startsAt),
  { message: '结束时间不能早于开始时间。' },
);

export const updateCalendarEventSchema = calendarEventInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个待更新字段。')
  .refine(
    (value) => !value.startsAt || !value.endsAt || new Date(value.endsAt) >= new Date(value.startsAt),
    { message: '结束时间不能早于开始时间。' },
  );

export const reminderSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid().nullable(),
  title: z.string(),
  scheduledAt: z.string().datetime(),
  status: z.enum(['pending', 'cancelled']),
  createdAt: z.string().datetime(),
});

export const createReminderSchema = z.object({
  eventId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  scheduledAt: z.string().datetime(),
});

export const healthProfileSchema = z.object({
  heightCm: z.number().positive().nullable(),
  birthYear: z.number().int().min(1900).max(2100).nullable(),
  goal: z.string().nullable(),
  allergies: z.string().nullable(),
  dietaryPreferences: z.string().nullable(),
  exerciseLimitations: z.string().nullable(),
  availableTime: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

export const updateHealthProfileSchema = z.object({
  heightCm: z.number().positive().max(300).nullable().optional(),
  birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
  goal: z.string().trim().max(300).nullable().optional(),
  allergies: z.string().trim().max(500).nullable().optional(),
  dietaryPreferences: z.string().trim().max(500).nullable().optional(),
  exerciseLimitations: z.string().trim().max(500).nullable().optional(),
  availableTime: z.string().trim().max(300).nullable().optional(),
});

export const healthMetricSchema = z.enum(['steps', 'sleep', 'water', 'weight', 'exercise', 'diet_note']);

export const healthRecordSchema = z.object({
  id: z.string().uuid(),
  metric: healthMetricSchema,
  valueNumber: z.number().nonnegative().nullable(),
  valueText: z.string().nullable(),
  unit: z.string(),
  localDate: z.string().date(),
  recordedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export const createHealthRecordSchema = z.discriminatedUnion('metric', [
  z.object({
    metric: z.enum(['steps', 'sleep', 'water', 'weight', 'exercise']),
    valueNumber: z.number().finite().nonnegative(),
    unit: z.string().trim().min(1).max(16),
    localDate: z.string().date(),
  }),
  z.object({
    metric: z.literal('diet_note'),
    valueText: z.string().trim().min(1).max(1000),
    unit: z.literal('text').default('text'),
    localDate: z.string().date(),
  }),
]);

export const healthAdviceSchema = z.object({
  hasTodayEntry: z.boolean(),
  suggestion: z.string(),
  dataRange: z.string(),
  generatedAt: z.string().datetime(),
  disclaimer: z.string(),
});

export const expenseCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  createdAt: z.string().datetime(),
});

export const expenseSchema = z.object({
  id: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3),
  occurredOn: z.string().date(),
  categoryId: z.string().uuid().nullable(),
  merchant: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#5c83a6'),
});

export const createExpenseSchema = z.object({
  amountMinor: z.number().int().positive().max(100_000_000),
  currency: z.string().trim().length(3).default('CNY').transform((value) => value.toUpperCase()),
  occurredOn: z.string().date(),
  categoryId: z.string().uuid().nullable().optional(),
  merchant: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const updateExpenseSchema = createExpenseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个待更新字段。');

export const financeSummarySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  totalMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  byCategory: z.array(
    z.object({
      categoryId: z.string().uuid().nullable(),
      categoryName: z.string(),
      totalMinor: z.number().int().nonnegative(),
    }),
  ),
});

export type Dashboard = z.infer<typeof dashboardSchema>;
export type Task = z.infer<typeof taskSchema>;
export type CreateTask = z.infer<typeof createTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type Reminder = z.infer<typeof reminderSchema>;
export type HealthProfile = z.infer<typeof healthProfileSchema>;
export type HealthRecord = z.infer<typeof healthRecordSchema>;
export type HealthAdvice = z.infer<typeof healthAdviceSchema>;
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type FinanceSummary = z.infer<typeof financeSummarySchema>;
