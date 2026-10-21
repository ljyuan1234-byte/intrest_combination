import type { HealthAnalysis, HealthMode, HealthPlan } from '@life/contracts';

export const HEALTH_AGENT_SYSTEM_PROMPT = `你是「日常助手」的健康规划模块，负责用中文帮助用户记录饮食、理解热量估算，并给出可执行的短期和长期计划。

硬性规则：
1. 你不是医生。不要诊断疾病、开药、建议停药，也不要处理紧急医疗情况。
2. 热量、蛋白质、碳水和脂肪只能使用工具返回的确定性结果，不要自行重新计算或编造数字。
3. 不编造用户没有说过的食物、份量、体重、睡眠或运动数据。信息不足时，只问一个最关键的追问。
4. 记忆片段只作为参考；如果记忆与当前数据冲突，以当前工具结果为准。
5. 减脂建议必须温和，不推荐极端节食、催吐、泻药或未经验证的补剂。
6. 回复简洁、具体、可执行；先给结论，再给 2–3 条行动建议。
7. 不使用“治愈”“保证瘦”“必须”等绝对化表达。`;

export type ComposeReplyInput = {
  message: string;
  mode: HealthMode;
  analysis: HealthAnalysis;
  plan: HealthPlan;
  memory: Array<{ content: string }>;
  loggedItems: Array<{ name: string; calories: number }>;
  followUp: string | null;
};

export function buildComposePrompt(input: ComposeReplyInput): string {
  const memoryText =
    input.memory.length > 0
      ? input.memory.map((item, index) => `[记忆 ${index + 1}] ${item.content}`).join('\n')
      : '无相关历史记忆。';

  const loggedText =
    input.loggedItems.length > 0
      ? input.loggedItems.map((item) => `${item.name}（约 ${item.calories} kcal）`).join('、')
      : '本轮没有新增可识别的食物。';

  const meals = input.plan.nextDay.meals
    .map((meal) => `${meal.slot}：${meal.suggestion}（约 ${meal.calories} kcal）`)
    .join('\n');

  return `用户本轮消息：
${input.message}

当前模式：${input.mode === 'fat_loss' ? '减脂' : '养生'}
今天已累计：${input.analysis.summary}
热量目标：${input.analysis.targetCalories} kcal；蛋白质目标：${input.analysis.proteinTargetG}g；饮水目标：${input.analysis.waterTargetMl}ml
BMI：${input.analysis.bmi ?? '未知'}；估算标记：${input.analysis.estimated ? '是' : '否'}
今日体重：${input.analysis.metrics.weightKg ?? '未记录'}kg；昨晚睡眠：${input.analysis.metrics.sleepMinutes ?? '未记录'}分钟；今日运动：${input.analysis.metrics.exerciseMinutes ?? '未记录'}分钟
本轮新增食物：${loggedText}
系统警告：${input.analysis.warnings.join('；') || '无'}

明天建议：
${meals}
活动：${input.plan.nextDay.activity}
明天重点：${input.plan.nextDay.focus}

相关长期记忆：
${memoryText}

请用中文回复用户，要求：
- 先回应用户真正问的问题；
- 如果本轮有新增食物，简要确认热量和蛋白质；
- 给出 2–3 条今天/明天可执行的建议；
- 如果信息不足，只在最后问一个最关键的问题：${input.followUp ?? '无'}；
- 不要输出 JSON，不要重复整份计划。`;
}

export function buildFallbackReply(input: ComposeReplyInput): string {
  const parts: string[] = [];

  if (input.loggedItems.length > 0) {
    const total = input.loggedItems.reduce((sum, item) => sum + item.calories, 0);
    parts.push(
      `已记下：${input.loggedItems.map((item) => `${item.name}约 ${item.calories} kcal`).join('、')}，本轮合计约 ${total} kcal。`,
    );
  }

  parts.push(input.analysis.summary);

  if (input.analysis.warnings.length > 0) {
    parts.push(`需要留意：${input.analysis.warnings[0]}`);
  }

  const nextMeals = input.plan.nextDay.meals
    .slice(0, 2)
    .map((meal) => `${meal.slot}${meal.suggestion}`)
    .join('；');
  parts.push(`明天可以先按这个节奏吃：${nextMeals}。${input.plan.nextDay.activity}`);

  if (input.followUp) {
    parts.push(`为了算得更准，想确认一下：${input.followUp}`);
  }

  return parts.join('\n\n');
}
