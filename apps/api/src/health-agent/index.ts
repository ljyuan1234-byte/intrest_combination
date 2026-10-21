import type { HealthAnalysis, HealthIntakeLog, HealthMode, HealthPlan, HealthProfile } from '@life/contracts';
import { buildHealthAnalysis } from './calories.js';
import { parseFoodText } from './parser.js';
import { buildHealthPlan } from './planner.js';

export { parseFoodText } from './parser.js';
export { buildHealthAnalysis } from './calories.js';
export { buildHealthPlan } from './planner.js';

export type HealthAgentInput = {
  profile: HealthProfile | null;
  latestWeightKg: number | null;
  intake: HealthIntakeLog | null;
  metrics: {
    weightKg: number | null;
    sleepMinutes: number | null;
    exerciseMinutes: number | null;
  };
  mode: HealthMode;
  date: string;
};

export type HealthAgentOutput = {
  analysis: HealthAnalysis;
  plan: HealthPlan;
};

/**
 * 健康 Agent 的规则引擎入口。
 *
 * 目前完全可解释、离线运行：解析饮食 -> 估算热量/营养素 -> 计算目标 -> 生成计划。
 * 后续可以在保留这些工具的前提下，把“生成计划”替换为大模型调用；
 * 但食物解析、热量计算和医学安全边界仍应由确定性代码负责。
 */
export function runHealthAgent(input: HealthAgentInput): HealthAgentOutput {
  const analysis = buildHealthAnalysis(input);
  const plan = buildHealthPlan(input.mode, analysis, input.intake, input.date);
  return { analysis, plan };
}
