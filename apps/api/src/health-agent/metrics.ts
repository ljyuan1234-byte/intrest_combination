export type ParsedDailyMetrics = {
  weightKg: number | null;
  sleepMinutes: number | null;
  steps: number | null;
  exerciseMinutes: number | null;
  waterMl: number | null;
};

function toNumber(value: string): number {
  return Number(value.replace(',', '.'));
}

/** 从聊天文本中提取体重、睡眠、步数、运动分钟和饮水。只提取明确写出的数字。 */
export function parseDailyMetrics(text: string): ParsedDailyMetrics {
  const result: ParsedDailyMetrics = {
    weightKg: null,
    sleepMinutes: null,
    steps: null,
    exerciseMinutes: null,
    waterMl: null,
  };

  const weight = text.match(/(?:体重|称重|重)\s*[^\d]{0,6}(\d+(?:[.,]\d+)?)\s*(kg|公斤|斤)/i);
  if (weight) {
    const value = toNumber(weight[1]!);
    result.weightKg = weight[2] === '斤' ? Math.round((value / 2) * 10) / 10 : value;
  }

  const sleep = text.match(/睡(?:眠|了|觉)?\s*[^\d]{0,6}(\d+(?:[.,]\d+)?)\s*个?\s*(半)?\s*(?:小时|h)/i);
  if (sleep) {
    result.sleepMinutes = Math.round((toNumber(sleep[1]!) + (sleep[2] ? 0.5 : 0)) * 60);
  }

  const steps = text.match(/(\d{3,6})\s*步/);
  if (steps) result.steps = Number(steps[1]);

  const exercise = text.match(/(?:运动|跑步|锻炼|骑车|游泳|健身|训练)[^\d]{0,6}(\d+)\s*分钟/);
  if (exercise) result.exerciseMinutes = Number(exercise[1]);

  const water = text.match(/(?:喝了|饮水|喝水|补水)[^\d]{0,6}(\d+)\s*(ml|毫升)/i);
  if (water) result.waterMl = Number(water[1]);

  return result;
}
