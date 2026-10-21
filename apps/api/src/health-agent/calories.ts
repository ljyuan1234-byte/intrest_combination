import type { HealthAnalysis, HealthIntakeLog, HealthMode, HealthProfile } from '@life/contracts';

type DailyMetrics = {
  weightKg: number | null;
  sleepMinutes: number | null;
  exerciseMinutes: number | null;
};

type EnergyInput = {
  profile: HealthProfile | null;
  latestWeightKg: number | null;
  intake: HealthIntakeLog | null;
  metrics: DailyMetrics;
  mode: HealthMode;
  date: string;
};

const ACTIVITY_FACTORS = {
  low: 1.2,
  medium: 1.45,
  high: 1.7,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildHealthAnalysis({
  profile,
  latestWeightKg,
  intake,
  metrics,
  mode,
  date,
}: EnergyInput): HealthAnalysis {
  const missing: string[] = [];

  const heightCm = profile?.heightCm ?? null;
  if (!heightCm) missing.push('身高');

  const weightKg = metrics.weightKg ?? latestWeightKg ?? profile?.weightKg ?? null;
  if (!weightKg) missing.push('体重');

  const birthYear = profile?.birthYear ?? null;
  if (!birthYear) missing.push('出生年份');

  const sex = profile?.sex ?? null;
  if (!sex) missing.push('性别');

  const activityLevel = profile?.activityLevel ?? 'medium';
  const age = birthYear ? clamp(new Date().getFullYear() - birthYear, 14, 90) : 30;

  // 缺少档案时使用保守的通用值，并在 warnings 中明确标注为估算。
  const estimatedWeight = weightKg ?? 65;
  const estimatedHeight = heightCm ?? 170;
  const base = 10 * estimatedWeight + 6.25 * estimatedHeight - 5 * age;
  const bmr = Math.round(sex === 'male' ? base + 5 : sex === 'female' ? base - 161 : base - 78);
  const tdee = Math.round(bmr * ACTIVITY_FACTORS[activityLevel]);

  const bmi =
    heightCm && weightKg
      ? Math.round((weightKg / Math.pow(heightCm / 100, 2)) * 10) / 10
      : null;

  const warnings: string[] = [];
  if (missing.length > 0) {
    warnings.push(`健康档案缺少${missing.join('、')}，热量目标是估算值；补齐后会更准确。`);
  }

  const floorCalories = sex === 'female' ? 1200 : sex === 'male' ? 1500 : 1350;
  let targetCalories = tdee;

  if (mode === 'fat_loss') {
    if (bmi !== null && bmi < 18.5) {
      warnings.push('当前 BMI 偏低，减脂模式不建议继续降低热量；本次按维持热量给出计划。');
      targetCalories = tdee;
    } else {
      targetCalories = Math.max(floorCalories, Math.round(tdee * 0.8));
    }
  }

  const proteinTargetG = Math.round(
    clamp(estimatedWeight * (mode === 'fat_loss' ? 1.4 : 1.1), 50, 200),
  );
  const waterTargetMl = Math.round(clamp(estimatedWeight * 35, 1500, 3000));

  const intakeCalories = intake?.totalCalories ?? 0;
  const calorieBalance = intake ? intakeCalories - targetCalories : 0;

  if (!intake) {
    warnings.push('今天还没有饮食记录，先填写吃了什么、喝了多少水。');
  } else {
    if (intake.totalCalories < floorCalories) {
      warnings.push(`今日摄入低于 ${floorCalories} kcal 的安全下限，不建议长期这样吃。`);
    }
    if (intake.totalCalories > tdee + 500) {
      warnings.push('今日摄入明显高于日常消耗，明天优先恢复正常三餐，不建议用极端节食补偿。');
    }
    if (intake.waterMl < waterTargetMl * 0.6) {
      warnings.push('今日饮水量偏少，明天分次补水，不要一次猛喝。');
    }
    if (intake.items.some((item) => !item.matched)) {
      warnings.push('有食物没有被识别，热量合计可能偏低；可以换一种写法或补充份量。');
    }
  }

  if (mode === 'fat_loss' && bmi !== null && bmi >= 24) {
    warnings.push('减脂速度建议控制在每周 0.3–0.5 kg，避免快速反弹。');
  }

  if (metrics.sleepMinutes !== null && metrics.sleepMinutes < 360) {
    warnings.push('昨晚睡眠不足 6 小时，明天优先补觉，训练强度不要硬顶。');
  }
  if (metrics.exerciseMinutes === 0) {
    warnings.push('今天还没有运动记录，明天从 20–30 分钟快走开始即可。');
  }
  if (metrics.exerciseMinutes !== null && metrics.exerciseMinutes > 90) {
    warnings.push('今天运动量较大，明天安排恢复日，注意补水和蛋白质。');
  }

  const summary = !intake
    ? `当前${mode === 'fat_loss' ? '减脂' : '养生'}目标约 ${targetCalories} kcal/天。填写今天的饮食后，会按实际摄入调整明天和本周计划。`
    : `今天已估算摄入 ${intake.totalCalories} kcal，目标 ${targetCalories} kcal，${
        calorieBalance > 0 ? `超出 ${calorieBalance}` : `剩余 ${Math.abs(calorieBalance)}`
      } kcal；蛋白质 ${intake.proteinG}g / 目标 ${proteinTargetG}g，饮水 ${intake.waterMl}ml。`;

  return {
    date,
    mode,
    bmr,
    tdee,
    bmi,
    targetCalories,
    proteinTargetG,
    waterTargetMl,
    calorieBalance,
    metrics,
    estimated: missing.length > 0,
    warnings,
    summary,
  };
}
