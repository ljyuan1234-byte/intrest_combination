import type {
  HealthAnalysis,
  HealthExecutionPlan,
  HealthMode,
  HealthPlan,
} from '@life/contracts';
import type { AppConfig } from '../config.js';
import { chatCompletion, isLlmConfigured } from './llm.js';
import { buildComposePrompt, buildFallbackReply, HEALTH_AGENT_SYSTEM_PROMPT } from './prompts.js';

type ComposeInput = {
  config: AppConfig;
  message: string;
  mode: HealthMode;
  analysis: HealthAnalysis;
  plan: HealthPlan;
  memory: Array<{ content: string }>;
  loggedItems: Array<{ name: string; calories: number }>;
  unknownCount: number;
};

export function classifyIntent(message: string, matchedFoodCount: number): HealthExecutionPlan['intent'] {
  if (matchedFoodCount > 0) return 'log_food';
  if (/计划|怎么吃|吃什么|安排|一周|明天|食谱|菜单/.test(message)) return 'ask_plan';
  if (/调整|改一下|太高|太低|饿|体重|睡眠|运动|加班|外食/.test(message)) return 'adjust_plan';
  return 'general';
}

export function buildExecutionPlan(input: ComposeInput): HealthExecutionPlan {
  const intent = classifyIntent(input.message, input.loggedItems.length);
  const steps =
    intent === 'log_food'
      ? ['parse_food_text', 'append_intake', 'calculate_energy', 'retrieve_memory', 'build_plan', 'compose_reply']
      : intent === 'ask_plan'
        ? ['retrieve_memory', 'calculate_energy', 'build_plan', 'compose_reply']
        : intent === 'adjust_plan'
          ? ['retrieve_memory', 'calculate_energy', 'build_plan', 'compose_reply']
          : ['retrieve_memory', 'compose_reply'];

  let followUp: string | null = null;

  if (input.unknownCount > 0) {
    followUp = '有几样食物我还没识别出来，它们大概是什么、各吃了多少？';
  } else if (intent === 'log_food' && input.analysis.estimated) {
    followUp = '如果方便，补充一下健康档案里还缺的身高、出生年份或性别，热量目标会更准。';
  } else if (intent === 'general' && !input.analysis.bmi) {
    followUp = '你愿意先补充身高和体重吗？这样我能把目标热量算得更贴近你。';
  }

  return { intent, steps, followUp };
}

export async function composeChatReply(input: ComposeInput): Promise<{ reply: string; execution: HealthExecutionPlan }> {
  const execution = buildExecutionPlan(input);

  const promptInput = {
    message: input.message,
    mode: input.mode,
    analysis: input.analysis,
    plan: input.plan,
    memory: input.memory,
    loggedItems: input.loggedItems,
    followUp: execution.followUp,
  };

  if (isLlmConfigured(input.config)) {
    const reply = await chatCompletion(input.config, [
      { role: 'system', content: HEALTH_AGENT_SYSTEM_PROMPT },
      { role: 'user', content: buildComposePrompt(promptInput) },
    ]);

    if (reply) return { reply, execution };
  }

  return { reply: buildFallbackReply(promptInput), execution };
}
