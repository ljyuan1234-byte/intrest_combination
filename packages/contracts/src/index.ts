import { z } from 'zod';

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  displayName: z.string().max(120).nullable(),
});

export const registerSchema = z.object({
  identifier: z.string().trim().min(3).max(320),
  password: z.string().min(8, '密码至少 8 位。').max(128),
  displayName: z.string().trim().min(1).max(120).nullable().optional(),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(128),
});

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
  sex: z.enum(['male', 'female', 'other']).nullable(),
  weightKg: z.number().positive().nullable(),
  targetWeightKg: z.number().positive().nullable(),
  activityLevel: z.enum(['low', 'medium', 'high']),
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
  sex: z.enum(['male', 'female', 'other']).nullable().optional(),
  weightKg: z.number().positive().max(400).nullable().optional(),
  targetWeightKg: z.number().positive().max(400).nullable().optional(),
  activityLevel: z.enum(['low', 'medium', 'high']).optional(),
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

export const healthModeSchema = z.enum(['wellness', 'fat_loss']);

export const healthIntakeItemSchema = z.object({
  name: z.string(),
  raw: z.string(),
  quantity: z.number().nonnegative(),
  unit: z.string(),
  grams: z.number().nonnegative(),
  calories: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  matched: z.boolean(),
});

export const healthIntakeLogSchema = z.object({
  id: z.string().uuid(),
  localDate: z.string().date(),
  mode: healthModeSchema,
  rawText: z.string(),
  waterMl: z.number().int().nonnegative(),
  totalCalories: z.number().int().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  items: z.array(healthIntakeItemSchema),
  updatedAt: z.string().datetime(),
});

export const saveHealthIntakeSchema = z
  .object({
    localDate: z.string().date(),
    mode: healthModeSchema.default('wellness'),
    text: z.string().trim().max(4000).default(''),
    waterMl: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .refine((value) => value.text.length > 0 || value.waterMl > 0, {
    message: '请至少填写食物或饮水量。',
  });

export const healthPlanMealSchema = z.object({
  slot: z.string(),
  suggestion: z.string(),
  calories: z.number().int().nonnegative(),
});

export const healthPlanDaySchema = z.object({
  day: z.string(),
  focus: z.string(),
  calorieTarget: z.number().int().nonnegative(),
  waterMl: z.number().int().nonnegative(),
  meals: z.array(healthPlanMealSchema),
  activity: z.string(),
});

export const healthPlanSchema = z.object({
  mode: healthModeSchema,
  basedOnDate: z.string().date(),
  nextDay: healthPlanDaySchema,
  week: z.array(healthPlanDaySchema).length(7),
  longTerm: z.object({
    goal: z.string(),
    milestones: z.array(
      z.object({
        period: z.string(),
        target: z.string(),
        actions: z.array(z.string()),
      }),
    ),
    habits: z.array(z.string()),
    cautions: z.array(z.string()),
  }),
  disclaimer: z.string(),
});

export const healthAnalysisSchema = z.object({
  date: z.string().date(),
  mode: healthModeSchema,
  bmr: z.number().nonnegative(),
  tdee: z.number().nonnegative(),
  bmi: z.number().positive().nullable(),
  targetCalories: z.number().int().nonnegative(),
  proteinTargetG: z.number().nonnegative(),
  waterTargetMl: z.number().int().nonnegative(),
  calorieBalance: z.number().int(),
  metrics: z.object({
    weightKg: z.number().positive().nullable(),
    sleepMinutes: z.number().int().nonnegative().nullable(),
    exerciseMinutes: z.number().int().nonnegative().nullable(),
  }),
  estimated: z.boolean(),
  warnings: z.array(z.string()),
  summary: z.string(),
});

export const healthAgentResponseSchema = z.object({
  intake: healthIntakeLogSchema.nullable(),
  analysis: healthAnalysisSchema,
  plan: healthPlanSchema,
});

export const healthChatMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'tool', 'system']),
  content: z.string(),
  createdAt: z.string().datetime(),
});

export const healthConversationSchema = z.object({
  id: z.string().uuid(),
  mode: healthModeSchema,
  title: z.string(),
  updatedAt: z.string().datetime(),
});

export const healthChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  mode: healthModeSchema.default('wellness'),
  date: z.string().date().optional(),
  conversationId: z.string().uuid().optional(),
});

export const healthExecutionPlanSchema = z.object({
  intent: z.enum(['log_food', 'ask_plan', 'adjust_plan', 'general']),
  steps: z.array(z.string()),
  followUp: z.string().nullable(),
});

export const healthChatResponseSchema = healthAgentResponseSchema.extend({
  conversationId: z.string().uuid(),
  reply: z.string(),
  messages: z.array(healthChatMessageSchema),
  execution: healthExecutionPlanSchema,
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

export type AuthUser = z.infer<typeof authUserSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type Task = z.infer<typeof taskSchema>;
export type CreateTask = z.infer<typeof createTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type Reminder = z.infer<typeof reminderSchema>;
export type HealthProfile = z.infer<typeof healthProfileSchema>;
export type HealthRecord = z.infer<typeof healthRecordSchema>;
export type HealthAdvice = z.infer<typeof healthAdviceSchema>;
export type HealthMode = z.infer<typeof healthModeSchema>;
export type HealthIntakeItem = z.infer<typeof healthIntakeItemSchema>;
export type HealthIntakeLog = z.infer<typeof healthIntakeLogSchema>;
export type SaveHealthIntake = z.infer<typeof saveHealthIntakeSchema>;
export type HealthAnalysis = z.infer<typeof healthAnalysisSchema>;
export type HealthPlanMeal = z.infer<typeof healthPlanMealSchema>;
export type HealthPlanDay = z.infer<typeof healthPlanDaySchema>;
export type HealthPlan = z.infer<typeof healthPlanSchema>;
export type HealthAgentResponse = z.infer<typeof healthAgentResponseSchema>;
export type HealthChatMessage = z.infer<typeof healthChatMessageSchema>;
export type HealthConversation = z.infer<typeof healthConversationSchema>;
export type HealthChatRequest = z.infer<typeof healthChatRequestSchema>;
export type HealthExecutionPlan = z.infer<typeof healthExecutionPlanSchema>;
export type HealthChatResponse = z.infer<typeof healthChatResponseSchema>;
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type FinanceSummary = z.infer<typeof financeSummarySchema>;
