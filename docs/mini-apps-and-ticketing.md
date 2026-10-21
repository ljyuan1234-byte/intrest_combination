# Mini App 与票务能力演进

版本：V0.2  
原则：小应用可以扩展体验，但不能绕开主系统的身份、数据和权限边界。

## 1. Mini App 形态

首期采用内置 Mini App 注册表和统一容器，不支持下载任意代码。

Manifest 至少包含：

```ts
type MiniAppManifest = {
  id: string;
  name: string;
  version: string;
  route: string;
  permissions: string[];
  dataScopes: string[];
  status: 'available' | 'planned' | 'disabled';
};
```

每个 Mini App 必须有：

- 独立路由和页面入口。
- 明确的数据范围和权限。
- 独立设置。
- 版本号和启停状态。
- Agent 工具白名单。
- 错误边界和资源限制。

## 2. 首期 Mini App

### Entertainment

包含星座、天干地支、五行八卦和历法查询。文案统一使用“娱乐/传统文化”定位，不输出确定性承诺。

### Ticketing Placeholder

首期只包含：

- 票务入口卡片。
- 出发地、目的地、日期和偏好设置草稿。
- 功能状态说明。
- 后续提醒配置占位。

首期不接入真实票务账号，不执行购票。后续目标平台包括：

- 铁路票：12306 网页。
- 演出票：大麦等演出平台的网页。

铁路和演出票务必须分别实现适配器。不同平台的页面结构、登录方式、订单规则和服务条款不能假设相同。

## 3. 票务子系统架构

票务页面操作必须在用户自己的浏览器中执行。云端不保存页面登录态，也不直接远程控制用户设备。

```text
Web 控制台
        |
        | 任务配置、状态同步、用户确认
        v
云端 Ticketing API + Orchestrator
        ^
        | 用户设备主动建立的短期任务连接
        |
本地 Ticketing Runner
  - Browser Adapter
  - 页面状态识别
  - 本地停止按钮
        |
        v
12306 / 大麦等用户已打开并授权的页面
```

### 3.1 云端职责

- 保存票务搜索条件、偏好和任务状态。
- 下发经过用户确认的任务配置。
- 接收本地 Runner 上报的状态、候选票和错误。
- 发送提醒和审批请求。
- 保存不含凭据和敏感页面原文的审计摘要。

### 3.2 本地 Runner 职责

- 在用户主动启动任务后运行。
- 读取当前浏览器页面中可见的票务信息。
- 进行筛选、页面跳转和允许的表单辅助填写。
- 检测验证码、人机验证、登录失效和页面结构变化。
- 遇到高风险状态立即暂停并要求用户接管。
- 提供本地全局停止按钮和任务超时保护。

网页端可以采用浏览器扩展或本地辅助程序。具体实现必须逐个平台确认服务条款和自动化许可。

### 3.3 平台适配器

不能让 Agent 直接调用任意网页或任意点击工具。每个平台单独实现适配器：

```ts
interface TicketingAdapter {
  platform: 'railway-12306' | 'damai' | string;
  surface: 'web';
  start(criteria: SearchCriteria): Promise<void>;
  readCandidates(): Promise<TicketCandidate[]>;
  selectCandidate(candidateId: string): Promise<void>;
  fillAllowedFields(input: AllowedTicketInput): Promise<void>;
  getState(): Promise<TicketPageState>;
  stop(): Promise<void>;
}
```

推荐适配器矩阵：

| 平台 | 网页适配器 | 备注 |
|---|---|---|
| 12306 | `Railway12306WebAdapter` | 铁路票独立实现，不能复用演出规则 |
| 大麦 | `DamaiWebAdapter` | 演出票订单、座位和购票规则独立处理 |
| 其他演出平台 | 独立适配器 | 逐个平台评估，不做通用抓取器 |

## 4. 票务能力分阶段路线

### T0：占位

- 建立 `TicketTask`、`TicketPreference`、`ConnectorState` 概念。
- 不存第三方密码和支付信息。

### T1：公开信息

- 只读取官方公开信息或获得明确授权的数据源。
- 查询和提醒有频率限制。
- 展示来源、抓取时间和数据不确定性。

### T2：用户设备页面辅助

- 用户主动启动具体平台任务。
- 读取当前用户已打开页面或 App 中可见的车次、余票、场次、价格和座位信息。
- 按用户预设条件筛选和跳转。
- 允许填写非敏感搜索条件；乘车人、观演人等信息必须由用户预授权并可随时撤销。
- 页面结构、登录失效、异常提示或数据不完整时立即停止。

### T3：人工确认流程

- 到达验证码、人机验证、订单提交、抢票确认或支付页面时暂停。
- 展示平台、日期、车次/场次、座位/席位、乘车人/观演人和价格。
- 用户在官方页面完成验证码、订单提交和支付。
- 任务完成、失败或停止后写入审计摘要。

### T4：官方授权连接器

- 仅接入官方开放 API 或服务条款明确允许的集成方式。
- 使用 OAuth/短期 Token，支持撤销和失效处理。
- 每个连接器独立权限和审计。

### T5：更高程度自动化评估

只有同时满足以下条件才允许评估：

- 有官方授权接口。
- 服务条款明确允许。
- 不绕过验证码、风控或登录保护。
- 不代管支付密钥。
- 有限频、停止开关、审计、回滚和用户授权。

只有满足以上条件，才可以讨论更高程度的自动化；不能因为页面操作“看起来像人工”就默认获得授权。

## 4. 禁止设计

- 读取或复制浏览器 Cookie、Token、密码库或系统凭据。
- 绕过验证码、人机验证或风控。
- 批量占票、攻击接口或规避限流。
- 代替用户完成支付。
- 把票务工具注册为通用 Agent 的任意 HTTP 工具。

## 5. 统一任务状态

票务任务至少包含以下状态：

```text
created
waiting_for_user_start
running
searching
candidate_found
filling
awaiting_user_confirmation
captcha_required
login_required
payment_required
completed
stopped
expired
failed
```

状态由本地 Runner 和云端 Orchestrator 共同维护，但最终是否允许执行高风险动作必须由服务端 Policy 和用户确认共同决定。

## 6. 票务专项验收条件

- 任务只能由当前用户主动创建和启动。
- Runner 断开、页面结构未知、登录失效或出现验证码时，任务进入暂停/失败，不进行盲目重试。
- 不读取或复制浏览器 Cookie、Token、密码库、系统凭据或其他应用的通知凭据。
- 不提取隐藏接口、签名参数或绕过官方页面流程。
- 订单提交、验证码、人机验证和支付必须由用户完成，除非未来存在明确官方授权且通过单独评审。
- 任务有超时、频率限制、停止按钮和完整审计摘要。
- 12306、大麦和其他平台分别进行兼容性、服务条款和权限评估。
