import type {
  HealthAnalysis,
  HealthIntakeLog,
  HealthMode,
  HealthPlan,
  HealthPlanDay,
  HealthPlanMeal,
} from '@life/contracts';

const DISCLAIMER =
  '以上为基于常见食物成分表和通用公式的日常估算，不构成医疗诊断、处方、停药或营养治疗建议。慢性病、孕期、哺乳期、进食障碍或正在用药时，请先咨询医生或注册营养师。';

function meals(mode: HealthMode, variant: number): HealthPlanMeal[] {
  const wellness = variant % 2 === 0
    ? {
        breakfast: '燕麦 40g + 牛奶 250ml + 鸡蛋 1 个 + 苹果 1 个',
        lunch: '糙米饭 150g + 清蒸鱼 120g + 西兰花 150g + 橄榄油 5g',
        dinner: '红薯 150g + 豆腐 100g + 青菜 200g + 虾 80g',
        snack: '无糖酸奶 150g + 坚果 15g + 蓝莓 100g',
      }
    : {
        breakfast: '全麦面包 2 片 + 鸡蛋 2 个 + 无糖豆浆 250ml',
        lunch: '鸡胸肉 120g + 米饭 150g + 青菜 200g + 橄榄油 5g',
        dinner: '玉米 150g + 牛肉 80g + 番茄 150g + 橄榄油 5g',
        snack: '香蕉 1 根 + 牛奶 200ml',
      };

  const fatLoss = variant % 2 === 0
    ? {
        breakfast: '鸡蛋 2 个 + 无糖豆浆 250ml + 燕麦 30g',
        lunch: '鸡胸肉 150g + 糙米饭 100g + 西兰花 200g',
        dinner: '鱼 120g + 豆腐 100g + 青菜 250g',
        snack: '无糖酸奶 150g + 蓝莓 100g',
      }
    : {
        breakfast: '全麦面包 1 片 + 鸡蛋 2 个 + 番茄 1 个',
        lunch: '虾 150g + 玉米 120g + 青菜 250g',
        dinner: '鸡腿肉 100g + 红薯 120g + 西兰花 200g',
        snack: '蛋白粉 1 勺 + 牛奶 200ml',
      };

  const picked = mode === 'fat_loss' ? fatLoss : wellness;

  return [
    { slot: '早餐', suggestion: picked.breakfast, calories: mode === 'fat_loss' ? 340 : 470 },
    { slot: '午餐', suggestion: picked.lunch, calories: mode === 'fat_loss' ? 430 : 430 },
    { slot: '晚餐', suggestion: picked.dinner, calories: mode === 'fat_loss' ? 240 : 340 },
    { slot: '加餐', suggestion: picked.snack, calories: mode === 'fat_loss' ? 160 : 250 },
  ];
}

function focusForDay(mode: HealthMode, index: number): string {
  const wellness = ['稳定三餐', '蛋白质优先', '蔬菜与纤维', '户外活动', '清淡烹饪', '备餐与采购', '复盘与调整'];
  const fatLoss = ['稳定三餐', '提高蛋白质', '力量训练', '增加步数', '外食策略', '清淡日', '复盘与调整'];
  return (mode === 'fat_loss' ? fatLoss : wellness)[index] ?? '稳定执行';
}

function activityForDay(mode: HealthMode, index: number): string {
  if (mode === 'fat_loss') {
    return index === 2 || index === 5
      ? '力量训练 30 分钟（深蹲、推、拉、核心各 2–3 组），结束后快走 15 分钟。'
      : '快走 6000–8000 步；每坐 1 小时起身活动 3 分钟。';
  }

  return index === 3
    ? '户外快走、骑车或游泳 30–45 分钟，以能正常说话为宜。'
    : '快走 30 分钟；每坐 1 小时起身活动 3 分钟。';
}

function nextDayFocus(analysis: HealthAnalysis, intake: HealthIntakeLog | null): string {
  if (analysis.metrics.sleepMinutes !== null && analysis.metrics.sleepMinutes < 360) {
    return '昨晚睡眠不足，明天优先补觉；训练改为轻松散步，不安排高强度。';
  }
  if (analysis.metrics.exerciseMinutes === 0) {
    return '今天没有运动记录，明天补一次 20–30 分钟快走即可，不用一次练太狠。';
  }
  if (!intake) return '先完成记录，再按目标份量安排三餐。';
  if (analysis.mode === 'fat_loss' && analysis.calorieBalance > 250) {
    return '今天摄入偏高，明天恢复稳定三餐，减少零食和含糖饮料，不跳过早餐。';
  }
  if (intake.proteinG < analysis.proteinTargetG * 0.8) {
    return '明天优先补足蛋白质：每餐安排一个掌心大小的鱼、虾、蛋、肉或豆制品。';
  }
  if (intake.waterMl < analysis.waterTargetMl * 0.6) {
    return '明天把饮水分散到上午、下午和晚间，避免口渴才喝。';
  }
  return '明天保持今天的三餐节奏，按目标份量微调主食和蛋白质。';
}

export function buildHealthPlan(
  mode: HealthMode,
  analysis: HealthAnalysis,
  intake: HealthIntakeLog | null,
  date: string,
): HealthPlan {
  const poorSleep = analysis.metrics.sleepMinutes !== null && analysis.metrics.sleepMinutes < 360;
  const highExercise = analysis.metrics.exerciseMinutes !== null && analysis.metrics.exerciseMinutes > 90;

  const nextActivity = poorSleep
    ? '轻松散步 20–30 分钟，不做高强度训练；今晚提前 30 分钟入睡。'
    : highExercise
      ? '恢复日：散步 20 分钟 + 拉伸 10 分钟，补足蛋白质和水分。'
      : mode === 'fat_loss'
        ? '力量训练 30 分钟 + 快走 6000 步；若今天摄入偏高，再加 15 分钟轻松步行。'
        : '快走 30 分钟；睡前留出 30 分钟不用屏幕。';

  const nextDay: HealthPlanDay = {
    day: '明天',
    focus: nextDayFocus(analysis, intake),
    calorieTarget: analysis.targetCalories,
    waterMl: analysis.waterTargetMl,
    meals: meals(mode, 0),
    activity: nextActivity,
  };

  const week: HealthPlanDay[] = Array.from({ length: 7 }, (_, index) => ({
    day: `第 ${index + 1} 天`,
    focus: focusForDay(mode, index),
    calorieTarget: analysis.targetCalories,
    waterMl: analysis.waterTargetMl,
    meals: meals(mode, index),
    activity: activityForDay(mode, index),
  }));

  const longTerm = mode === 'fat_loss'
    ? {
        goal: '12 周温和减脂：以每周 0.3–0.5 kg 为目标，优先保住肌肉和精力，不追求快速掉秤。',
        milestones: [
          {
            period: '第 1–4 周',
            target: '稳定三餐和记录习惯，体重下降 0.5–1.5 kg。',
            actions: ['每餐先吃蔬菜和蛋白质', '主食控制在拳头大小', '每周 2 次力量训练', '每天 6000–8000 步'],
          },
          {
            period: '第 5–8 周',
            target: '在维持蛋白质的前提下，根据体重趋势微调热量。',
            actions: ['每周固定同一时间称重 2–3 次', '外食优先选清蒸、炖煮、少酱汁', '睡眠不足时不做极端节食'],
          },
          {
            period: '第 9–12 周',
            target: '形成可长期维持的饮食结构，进入体重维持期。',
            actions: ['逐步把热量恢复到维持水平', '保留力量训练', '复盘最容易失控的场景并准备替代方案'],
          },
        ],
        habits: [
          '每餐至少一种优质蛋白（鱼、虾、蛋、瘦肉、豆制品）',
          '每天 500g 左右蔬菜，深色蔬菜占一半',
          '主食优先全谷物、薯类、玉米',
          '含糖饮料每周不超过 1 次',
          '每天 7–8 小时睡眠',
          '每周至少 2 次力量训练',
        ],
        cautions: [
          '不要长期低于 1200 kcal（女性）或 1500 kcal（男性）。',
          '体重每周下降超过 1 kg 时，优先增加食物而不是继续压低热量。',
          '出现头晕、闭经、暴食或明显情绪问题时，停止减脂并就医。',
        ],
      }
    : {
        goal: '12 周养生计划：建立稳定的饮食、睡眠和活动节奏，提升精力，而不是追求快速体重变化。',
        milestones: [
          {
            period: '第 1–4 周',
            target: '固定三餐时间，做到每天记录饮食和饮水。',
            actions: ['早餐加入蛋白质', '每天 1500–2000ml 水', '每天快走 20–30 分钟', '固定入睡时间'],
          },
          {
            period: '第 5–8 周',
            target: '增加食物多样性，改善蔬菜、全谷物和优质脂肪比例。',
            actions: ['每周尝试 2 种新蔬菜', '每周 2 次鱼或豆制品', '减少油炸和重口味外卖'],
          },
          {
            period: '第 9–12 周',
            target: '形成可持续的日常节奏，并能根据状态灵活调整。',
            actions: ['保留每周复盘', '疲劳时降低运动强度而不是放弃', '建立备餐和采购清单'],
          },
        ],
        habits: [
          '三餐规律，不长期跳过早餐',
          '每天 300–500g 蔬菜、200–350g 水果',
          '主食粗细搭配',
          '每天 1500–2000ml 水',
          '每周 150 分钟中等强度活动',
          '睡前 1 小时减少屏幕和咖啡因',
        ],
        cautions: [
          '热量和营养值为估算，不替代医学检查。',
          '有慢性病、孕期、哺乳期或进食障碍史时，先咨询专业人员。',
          '不要用单一食物或极端断食替代均衡饮食。',
        ],
      };

  return {
    mode,
    basedOnDate: date,
    nextDay,
    week,
    longTerm,
    disclaimer: DISCLAIMER,
  };
}
