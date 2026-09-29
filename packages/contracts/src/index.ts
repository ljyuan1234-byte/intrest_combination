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

export type Dashboard = z.infer<typeof dashboardSchema>;
