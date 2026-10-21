# 健康规划 Agent

状态：已实现规则引擎版本。入口是 Web 的 `/health/agent`，数据表为 `health_intake_logs`，迁移为 `0006_phase_3_health_agent`。

## 1. 产品流程

```text
用户输入当天饮食 + 饮水
        │
        ▼
规则解析器：识别食物、份量、克数
        │
        ▼
热量/蛋白质/碳水/脂肪估算
        │
        ▼
结合健康档案计算 BMR、TDEE、BMI、目标热量
        │
        ▼
生成：今日分析 + 明天计划 + 未来 7 天计划 + 12 周长期计划
```

目前是**确定性规则引擎**，不依赖外部大模型：

- 食物解析、份量换算、热量计算、目标计算都可解释、可测试；
- 没有 API Key 也能运行；
- 后续可以把“生成计划文案”替换成模型，但安全边界仍由代码控制。

## 2. 两种模式

### 养生模式 `wellness`

- 目标热量按 TDEE 维持；
- 强调三餐规律、蔬菜水果、全谷物、优质蛋白、饮水和睡眠；
- 每周 150 分钟中等强度活动；
- 长期目标是 12 周建立稳定习惯，不追求快速掉秤。

### 减脂模式 `fat_loss`

- 目标热量约为 TDEE 的 80%，并设置安全下限：
  - 女性不低于 1200 kcal；
  - 男性不低于 1500 kcal；
  - 未填写性别时不低于 1350 kcal；
- BMI < 18.5 时自动回到维持热量，不继续制造缺口；
- 蛋白质目标约 1.4 g/kg 体重；
- 建议每周下降 0.3–0.5 kg，优先保住肌肉；
- 长期目标是 12 周温和减脂并进入维持期。

## 3. 计算方式

基础代谢使用 Mifflin–St Jeor 近似公式：

```text
男性：10 × 体重kg + 6.25 × 身高cm − 5 × 年龄 + 5
女性：10 × 体重kg + 6.25 × 身高cm − 5 × 年龄 − 161
其他：上述两者的中间值
```

活动系数：

```text
低活动  1.20
中活动  1.45
高活动  1.70
```

当档案缺少身高、体重、出生年份或性别时，使用保守默认值并在 API 的 `analysis.warnings` 中明确标注“估算值”。

## 4. 食物解析

实现位置：`apps/api/src/health-agent/`。

| 文件 | 职责 |
|---|---|
| `food-database.ts` | 常见中式食物、外卖、食堂和家常菜的营养值与份量换算 |
| `parser.ts` | 拆分饮食文本、匹配食物别名、解析数量与单位 |
| `metrics.ts` | 从聊天中提取体重、睡眠、步数、运动和饮水 |
| `calories.ts` | BMR、TDEE、BMI、目标热量、安全警示 |
| `planner.ts` | 次日、7 天、长期计划，结合睡眠/运动调整 |
| `memory.ts` | 对话切片、分词与 RAG 检索 |
| `prompts.ts` / `llm.ts` / `chat.ts` | Prompt、可选大模型与 Plan-and-Execute |
| `index.ts` | 规则引擎编排入口 |

支持的写法示例：

```text
早餐两个鸡蛋、一杯牛奶；
午餐一碗米饭、150g 鸡胸肉、一份西兰花；
晚餐一碗粥、一份青菜；喝了一杯奶茶
```

支持的单位：

```text
克/g、毫升/ml、斤、两、个、只、碗、杯、片、份、根、勺、瓶、罐、盒、把、包、块
```

未收录的食物会返回 `matched: false`，热量按 0 计，并在分析警告中提示，不会自动猜测。

## 5. 数据模型

`health_intake_logs`：

- `user_id`、`local_date` 唯一；
- `mode`：`wellness` / `fat_loss`；
- `raw_text`：用户原始输入；
- `water_ml`；
- `total_calories`、`protein_g`、`carbs_g`、`fat_g`；
- `items`：解析后的食物数组（jsonb）；
- `created_at`、`updated_at`。

`health_profiles` 新增：

- `sex`：`male` / `female` / `other`；
- `weight_kg`；
- `target_weight_kg`；
- `activity_level`：`low` / `medium` / `high`。

## 6. API

### 追加当天饮食并生成计划

```http
POST /api/v1/health/agent/intake
Content-Type: application/json

{
  "localDate": "2026-10-19",
  "mode": "fat_loss",
  "text": "早餐两个鸡蛋、一杯牛奶；午餐一碗米饭、150g鸡胸肉",
  "waterMl": 1200
}
```

同一天多次提交会**累加**热量、蛋白质、碳水、脂肪、饮水和食物条目，不会覆盖之前的记录。

### 对话输入

```http
POST /api/v1/health/chat
Content-Type: application/json

{
  "message": "午餐吃了黄焖鸡米饭，昨晚睡了5个半小时，今天走了7000步",
  "mode": "fat_loss",
  "date": "2026-10-19"
}
```

对话会：

- 解析食物并累加到当天；
- 提取体重、睡眠、步数、运动、饮水并写入健康记录；
- 检索历史对话切片；
- 执行 Plan-and-Execute；
- 返回回复、分析、计划和执行步骤。

Web 页面：`/health/chat`。

### 查询当天分析和计划

```http
GET /api/v1/health/agent?date=2026-10-19&mode=wellness
```

返回：

```json
{
  "intake": { "...": "..." },
  "analysis": {
    "bmr": 1588,
    "tdee": 2302,
    "bmi": 24.2,
    "targetCalories": 1842,
    "proteinTargetG": 98,
    "waterTargetMl": 2450,
    "calorieBalance": -622,
    "estimated": false,
    "warnings": ["..."],
    "summary": "..."
  },
  "plan": {
    "nextDay": { "...": "..." },
    "week": ["7 天"],
    "longTerm": { "...": "..." },
    "disclaimer": "..."
  }
}
```

## 7. 安全边界

- 所有页面和 API 都带非医疗免责声明；
- 不做疾病诊断、处方、停药或紧急情况判断；
- 不推荐极端节食、催吐、泻药或未经验证的补剂；
- 减脂模式设置热量下限，BMI 偏低时不继续制造缺口；
- 有慢性病、孕期、哺乳期、进食障碍或用药情况时，提示咨询医生/注册营养师；
- 食物热量是估算值，不替代食品标签、实验室检测或专业评估。

## 8. 后续接入大模型

建议把模型限制在“表达层”，不要让模型直接算热量：

```text
模型输出结构化意图
  -> 工具 parse_food_text（确定性）
  -> 工具 calculate_energy（确定性）
  -> 工具 build_plan（确定性）
  -> 模型只负责把结果写成自然语言/调整措辞
```

工具白名单：

- `parse_food_text`
- `calculate_energy`
- `build_plan`
- `get_health_profile`

禁止：

- 让模型直接给出药物、剂量、诊断；
- 让模型修改数据库；
- 让模型访问任意 HTTP 或执行 Shell；
- 在没有数据时编造摄入量。

## 9. 当前限制

- 食物库为常见食物近似值，不覆盖品牌食品、连锁餐饮和复杂菜品；
- 没有拍照识别、条码扫描或包装营养标签解析；
- 没有接入体重/体脂秤数据；
- 计划是模板化建议，不是个性化医疗营养处方；
- 7 天计划目前使用固定模板轮换，后续可根据每天实际记录动态调整。
