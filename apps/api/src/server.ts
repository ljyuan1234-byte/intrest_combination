import cors from '@fastify/cors';
import Fastify from 'fastify';
import { dashboardSchema } from '@life/contracts';

const app = Fastify({ logger: true });
const port = Number(process.env.API_PORT ?? 4000);

await app.register(cors, { origin: true });

app.get('/health', async () => ({ status: 'ok' }));

app.get('/api/dashboard', async (_request, reply) => {
  const dashboard = dashboardSchema.parse({
    date: new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full' }).format(),
    tasks: { total: 0, completed: 0 },
    health: {
      hasTodayEntry: false,
      suggestion: '记录今天的饮水、睡眠或锻炼后，助手会生成更贴合你的建议。',
    },
    finance: { monthTotalCents: 0, currency: 'CNY' },
    modules: [
      {
        id: 'health',
        name: '健康建议',
        description: '上传日常数据，获得饮食和锻炼建议。',
        status: 'available',
      },
      {
        id: 'finance',
        name: '手动记账',
        description: '记录消费并查看本月趋势。',
        status: 'available',
      },
      {
        id: 'ticketing',
        name: '票务助手',
        description: '后续接入官方信息查询和提醒。',
        status: 'planned',
      },
    ],
  });

  return reply.send(dashboard);
});

try {
  await app.listen({ host: '0.0.0.0', port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
