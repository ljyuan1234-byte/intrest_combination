# 健康 Agent：对话、RAG、计划执行与 Prompt

状态：已实现规则引擎 + 可选大模型解释层。当前不依赖任何模型也能运行；配置 OpenAI 兼容接口后，模型负责追问和解释，热量仍由确定性工具计算。

## 1. 整体流程

```text
用户自然语言
   │
   ▼
规则解析：食物 / 份量 / 体重 / 睡眠 / 运动 / 饮水
   │
   ├─ 食物 → 累加到当天 intake
   ├─ 指标 → 写入 health_records
   │
   ▼
确定性工具：热量、蛋白质、BMR、TDEE、BMI、目标热量
   │
   ▼
检索长期记忆（对话切片）
   │
   ▼
Plan-and-Execute：意图分类 + 工具步骤
   │
   ├─ 有 LLM：模型基于工具结果写追问/解释
   └─ 无 LLM：确定性模板回复
   │
   ▼
保存对话消息 + 记忆切片
```

## 2. 对话数据模型

| 表 | 用途 |
|---|---|
| `health_conversations` | 一次健康对话，绑定用户和模式 |
| `health_messages` | 用户/助手消息，`metadata` 记录执行计划 |
| `health_memory_chunks` | 对话切片，供 RAG 检索；预留 `embedding` |

迁移：`0008_phase_4_health_conversations`、`0009_phase_4_llm_usage`。

## 3. RAG：词法 + 可选向量混合

### 3.1 切片

1. 每条消息按句号/问号等切成不超过 280 字的片段；
2. 对片段做中文单字 + 双字 + ASCII 词分词；
3. 写入 `health_memory_chunks`，同时保存 `keywords`；
4. 配置 embedding 服务时，同时保存 `embedding` 向量。

### 3.2 检索

- 没有 embedding：使用纯词法分数：
  - 词重叠（余弦式归一化）占 80%；
  - 30 天衰减的近期权重占 20%。
- 配置 embedding：对 query 调用 `/embeddings`，然后：
  - 向量余弦相似度占 65%；
  - 词法分数占 35%；
  - 旧切片没有向量时自动退回词法。
- 取 Top 5 注入 Prompt。

### 3.3 为什么 DeepSeek Key 不能直接做向量

DeepSeek 官方 API 当前提供 Chat Completions、Responses、FIM 等模型接口，**没有公开的 `/embeddings` 接口**。因此：

- DeepSeek Key 用于模型分析、追问、解释；
- 向量化需要单独配置 `EMBEDDING_*` 服务；
- 没有 embedding 服务时，RAG 仍可用词法模式运行。

Embedding 供应商示例（Qwen / 阿里云百炼，OpenAI 兼容）：

```dotenv
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-v4
EMBEDDING_DIMENSIONS=1024
EMBEDDING_BATCH_SIZE=10
```

- 中国区 Key 使用 `https://dashscope.aliyuncs.com/compatible-mode/v1`；
- 国际区 Key 使用 `https://maas.qwencloudapi.com/compatible-mode/v1`；
- `text-embedding-v4` 支持 2048/1536/1024/768/512/256/128/64 维；
- `text-embedding-v3` 支持 1024/768/512 维；
- 单批最多 10 条，代码已按 `EMBEDDING_BATCH_SIZE` 自动分批。

也可以接 Jina、OpenAI、本地 BGE/Ollama 的 OpenAI 兼容接口。

### 3.4 局限

- 同义表达在纯词法模式下召回弱；
- 长对话中代词和省略难处理；
- 向量模式需要额外成本和网络延迟；
- 旧切片未回填向量时仍靠词法，不会报错。

## 4. Plan-and-Execute

`apps/api/src/health-agent/chat.ts` 先分类意图：

| 意图 | 触发 | 工具步骤 |
|---|---|---|
| `log_food` | 文本中识别到食物 | parse_food → append_intake → calculate → retrieve_memory → build_plan |
| `ask_plan` | “怎么吃/计划/一周/明天” | retrieve_memory → calculate → build_plan |
| `adjust_plan` | “太高/太低/饿/体重/睡眠/运动” | retrieve_memory → calculate → build_plan |
| `general` | 其他 | retrieve_memory → reply |

执行结果会写入助手消息的 `metadata.execution`，前端展示“本轮执行：记录饮食 / 计划步骤”。

## 5. Prompt 工程

核心 System Prompt 在 `apps/api/src/health-agent/prompts.ts`，硬性规则：

1. 不是医生，不诊断、不开药、不建议停药；
2. 热量/蛋白质/碳水/脂肪只能引用工具结果，禁止自行计算；
3. 不编造用户没说的食物、份量、体重、睡眠或运动；
4. 记忆只作参考，冲突时以当前工具结果为准；
5. 减脂必须温和，不推荐极端节食/催吐/泻药/补剂；
6. 先结论，再 2–3 条行动；不确定时只问一个最关键问题。

Compose Prompt 注入：

- 用户本轮消息；
- 今日累计摄入、目标、蛋白质、饮水、BMI；
- 体重、睡眠、运动；
- 本轮新增食物；
- 系统 warnings；
- 明天餐单和活动；
- Top 5 记忆片段；
- 可选追问。

模型输出限制为自然语言，不输出 JSON，不重复整份计划。

## 6. 配置大模型

可选，OpenAI 兼容接口：

```dotenv
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=sk-...
LLM_MODEL=deepseek-flash
LLM_TIMEOUT_MS=30000
```

DeepSeek 当前模型名为 `deepseek-flash` 或 `deepseek-v4-pro`。代码在识别到 `deepseek.com` 时会发送 `thinking: { type: "disabled" }`，避免健康解释请求默认进入深度思考、增加延迟。

未配置时自动使用确定性回复，不影响记录和计划。

> 模型不参与热量计算，也不直接写数据库。所有写入由 API 按工具结果执行。

### 6.1 Token 与费用限制

默认配置：

```dotenv
LLM_MODE=smart
LLM_MAX_OUTPUT_TOKENS=400
LLM_MAX_INPUT_CHARS=8000
LLM_DAILY_REQUEST_LIMIT=30
LLM_DAILY_TOKEN_BUDGET=20000
```

- `LLM_MODE=smart`：单纯记录饮食不调用模型，只返回确定性模板；解释、计划、调整类问题才调用；
- `LLM_MAX_OUTPUT_TOKENS`：单次回答最多 400 token，不是 800；
- `LLM_MAX_INPUT_CHARS`：Prompt 超过 8000 字符直接退回模板，避免超长上下文；
- `LLM_DAILY_REQUEST_LIMIT` / `LLM_DAILY_TOKEN_BUDGET`：按用户、按天统计，超限后只用确定性回复；
- 每次模型调用的输入/输出 token 写入 `llm_usage_logs`；
- `GET /api/v1/health/llm-usage?date=YYYY-MM-DD` 可查看当天用量和剩余额度。

`LLM_MODE=off` 可以完全关闭模型解释，`always` 仅建议在明确监控成本时使用。

> 密钥只放 `.env` 或服务器 `deploy/.env.production`，不要写进 `.env.example`、代码或 Git。若曾提交过真实 Key，应立即在供应商控制台吊销并重新生成，因为 Git 历史仍可能保留旧值。

## 7. 指标提取

`apps/api/src/health-agent/metrics.ts` 从聊天中提取：

- 体重：`体重70公斤`、`70kg`、`140斤`（斤自动除以 2）；
- 睡眠：`睡了5个半小时` → 330 分钟；
- 步数：`走了7000步`；
- 运动：`运动30分钟`；
- 饮水：`喝了1500ml水`。

提取结果写入 `health_records`，并参与：

- BMR/TDEE 体重回退；
- 睡眠不足/运动过量的 warning；
- 明天计划：睡眠不足 → 轻松散步；运动过量 → 恢复日；无运动 → 20–30 分钟快走。

## 8. 多次累加

同一天多次发送饮食会累加，而不是覆盖：

- 热量、蛋白质、碳水、脂肪、饮水逐次相加；
- `raw_text` 追加；
- `items` 合并；
- 当前 API 是 `POST /api/v1/health/agent/intake`；
- 结构化的 `/health/agent` 页面和 `/health/chat` 都走同一累加逻辑。

## 9. 食物库

`apps/api/src/health-agent/food-database.ts` 已扩展到常见外卖、食堂和家常菜：

- 主食、蛋白、蔬菜、水果、饮品；
- 外卖：汉堡、薯条、炸鸡、披萨、麻辣烫、米线、螺蛳粉、黄焖鸡、兰州拉面；
- 食堂/家常：番茄炒蛋、青椒肉丝、红烧肉、麻婆豆腐、地三鲜、炒土豆丝、紫菜蛋花汤；
- 早餐：小笼包、生煎、煎饼果子、肉夹馍、手抓饼、馄饨。

新增食物时只写近似每 100g 营养值和常见份量，不要伪造精确数据。

## 10. Web Push（下一阶段）

当前尚未接入推送。计划：

1. `health_push_subscriptions` 表保存 endpoint、p256dh、auth；
2. `GET /api/v1/health/push/public-key` 返回 VAPID 公钥；
3. 前端 service worker 注册 `push` 事件；
4. Worker 每分钟检查饮水/加餐提醒，通过 Web Push 发送；
5. 通知只写“该喝水了/该加餐了”，不写健康或财务敏感内容；
6. 支持静默时段、每日上限和退订。

需要 `web-push` 依赖和 VAPID 密钥，建议单独一轮实现并做真实设备验证，避免把“能订阅”误认为“能送达”。

## 11. 文件地图

| 文件 | 职责 |
|---|---|
| `apps/api/src/health-agent/parser.ts` | 食物文本解析 |
| `apps/api/src/health-agent/food-database.ts` | 食物营养库 |
| `apps/api/src/health-agent/metrics.ts` | 体重/睡眠/步数/运动/饮水提取 |
| `apps/api/src/health-agent/calories.ts` | BMR/TDEE/BMI/目标 |
| `apps/api/src/health-agent/planner.ts` | 次日/7 天/长期计划 |
| `apps/api/src/health-agent/memory.ts` | 切片、分词、词法/向量混合检索 |
| `apps/api/src/health-agent/embedding.ts` | OpenAI 兼容 embedding 调用与余弦相似度 |
| `apps/api/src/health-agent/prompts.ts` | System/Compose Prompt |
| `apps/api/src/health-agent/llm.ts` | OpenAI 兼容调用 |
| `apps/api/src/health-agent/chat.ts` | 意图分类与 Plan-and-Execute |
| `apps/web/app/health/chat/page.tsx` | 对话页面 |
| `apps/web/app/health/agent/page.tsx` | 结构化输入与计划面板 |
