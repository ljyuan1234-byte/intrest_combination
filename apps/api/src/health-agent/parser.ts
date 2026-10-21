import { FOOD_ALIAS_INDEX, type FoodEntry } from './food-database.js';

export type ParsedFoodItem = {
  name: string;
  raw: string;
  quantity: number;
  unit: string;
  grams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  matched: boolean;
};

export type ParsedIntake = {
  items: ParsedFoodItem[];
  totals: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  unknownCount: number;
};

const CN_DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  半: 0.5,
};

const UNIT_PATTERN = '毫升|ml|ML|克|g|G|斤|两|个|只|碗|杯|片|份|根|勺|瓶|罐|盒|把|包|块';
const NUMBER_PATTERN = '\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十半]+';

const MEAL_LABELS = /^(早餐|午餐|晚餐|加餐|夜宵|早上|中午|晚上|今天|早饭|午饭|晚饭)[:：\s]*/;
const EATING_VERBS = /^(我|今天)?(吃了点|喝了一|吃了|喝了|来了|点了)/;

function parseChineseNumber(token: string): number {
  if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token);
  if (token === '半') return 0.5;

  if (token.includes('十')) {
    const [left, right] = token.split('十');
    const tens = left ? (CN_DIGITS[left] ?? 1) : 1;
    const ones = right ? (CN_DIGITS[right] ?? 0) : 0;
    return tens * 10 + ones;
  }

  return CN_DIGITS[token] ?? 1;
}

function cleanSegment(segment: string): string {
  return segment
    .trim()
    .replace(MEAL_LABELS, '')
    .replace(EATING_VERBS, '')
    .replace(/^[：:、，,\s]+/, '')
    .replace(/[。.!！?？]+$/g, '')
    .trim();
}

function splitSegments(text: string): string[] {
  return text
    .replace(/[；;、\n\r]+/g, '，')
    .replace(/以及|还有|外加|加上/g, '，')
    .split(/[，,]/)
    .flatMap((part) => part.split(/和|加|配|跟/))
    .map(cleanSegment)
    .filter(Boolean);
}

function findFood(segment: string): { food: FoodEntry; alias: string } | null {
  for (const entry of FOOD_ALIAS_INDEX) {
    if (segment.includes(entry.alias)) {
      return { food: entry.food, alias: entry.alias };
    }
  }
  return null;
}

function isNonFoodSegment(segment: string): boolean {
  return /(睡|睡眠|小时|步|运动|跑步|锻炼|健身|体重|公斤|斤|饮水|喝水|补水|毫升|ml)/i.test(segment);
}

function quantityFor(segment: string, food: FoodEntry): { quantity: number; unit: string; grams: number } {
  const withUnit = segment.match(new RegExp(`(${NUMBER_PATTERN})\\s*(${UNIT_PATTERN})`));

  if (withUnit) {
    const quantity = Math.max(0, parseChineseNumber(withUnit[1]!));
    const unit = withUnit[2]!;
    const unitGrams =
      unit === '克' || unit === 'g' || unit === 'G'
        ? 1
        : unit === '毫升' || unit === 'ml' || unit === 'ML'
          ? 1
          : unit === '斤'
            ? 500
            : unit === '两'
              ? 50
              : (food.unitGrams?.[unit] ?? food.servingGrams);

    return { quantity, unit, grams: Math.round(quantity * unitGrams) };
  }

  const bareNumber = segment.match(new RegExp(NUMBER_PATTERN));
  if (bareNumber) {
    const quantity = Math.max(0, parseChineseNumber(bareNumber[0]));
    // 纯数字大于 30 时按克处理，否则按默认份数处理。
    if (quantity > 30) {
      return { quantity, unit: '克', grams: Math.round(quantity) };
    }
    return {
      quantity,
      unit: food.defaultUnit,
      grams: Math.round(quantity * food.servingGrams),
    };
  }

  return { quantity: 1, unit: food.defaultUnit, grams: food.servingGrams };
}

function nutritionFor(food: FoodEntry, grams: number) {
  const factor = grams / 100;
  return {
    calories: Math.round(food.caloriesPer100g * factor),
    proteinG: Math.round(food.proteinPer100g * factor * 10) / 10,
    carbsG: Math.round(food.carbsPer100g * factor * 10) / 10,
    fatG: Math.round(food.fatPer100g * factor * 10) / 10,
  };
}

/**
 * 解析用户输入的中文饮食描述。
 *
 * 这是一个可解释的规则解析器：先按标点/连接词拆成食物片段，再用食物别名匹配，
 * 最后按“数字 + 单位”换算克数。它不会猜测未收录的食物，而是返回 matched=false，
 * 由 UI 明确提示用户补录或估算。
 */
export function parseFoodText(text: string): ParsedIntake {
  const items: ParsedFoodItem[] = [];

  for (const segment of splitSegments(text)) {
    const matched = findFood(segment);

    if (!matched) {
      if (isNonFoodSegment(segment)) continue;

      items.push({
        name: segment.slice(0, 60),
        raw: segment,
        quantity: 1,
        unit: '份',
        grams: 0,
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        matched: false,
      });
      continue;
    }

    const { quantity, unit, grams } = quantityFor(segment, matched.food);
    const nutrition = nutritionFor(matched.food, grams);

    items.push({
      name: matched.food.name,
      raw: segment,
      quantity,
      unit,
      grams,
      ...nutrition,
      matched: true,
    });
  }

  const totals = items.reduce(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      proteinG: Math.round((sum.proteinG + item.proteinG) * 10) / 10,
      carbsG: Math.round((sum.carbsG + item.carbsG) * 10) / 10,
      fatG: Math.round((sum.fatG + item.fatG) * 10) / 10,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  return {
    items,
    totals,
    unknownCount: items.filter((item) => !item.matched).length,
  };
}
