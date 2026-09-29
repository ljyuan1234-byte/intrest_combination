# 票务 Runner 规范

目标：12306 Web/Android、大麦 Web/Android；其他平台逐个评估。

## 架构

Ticketing Mini App -> Ticketing API -> Orchestrator -> 用户设备 Local Runner -> 平台页面/App。云端只保存配置、状态、候选摘要、通知和审批，不保存登录态，不远程控制设备。

## 适配器

```ts
interface TicketingAdapter {
  platform: 'railway-12306' | 'damai' | string;
  surface: 'web' | 'android';
  start(criteria: SearchCriteria): Promise<void>;
  readCandidates(): Promise<TicketCandidate[]>;
  selectCandidate(id: string): Promise<void>;
  fillAllowedFields(input: AllowedTicketInput): Promise<void>;
  getState(): Promise<TicketPageState>;
  stop(): Promise<void>;
}
```

分别实现 `Railway12306WebAdapter`、`Railway12306AndroidAdapter`、`DamaiWebAdapter`、`DamaiAndroidAdapter`，不共用页面脚本。

## 状态

`created`、`waiting_for_user_start`、`running`、`searching`、`candidate_found`、`filling`、`awaiting_user_confirmation`、`captcha_required`、`login_required`、`payment_required`、`completed`、`stopped`、`expired`、`failed`。

## 协议

Runner 注册获得短期凭证；心跳只上报设备、版本、任务和状态；云端只下发用户确认的任务和字段白名单；上报候选、状态和错误摘要；云端或本地都可停止，本地停止优先；断线暂停，不盲目重试。

验证码、登录失效、订单提交、支付、页面结构未知或异常跳转时立即停止交用户处理。

## 禁止

不读取 Cookie、Token、密码库、系统凭据或其他应用通知凭据；不访问隐藏接口或签名参数；不绕过验证码、风控或限流；不代替用户支付。实现前须完成 12306/大麦条款、自动化许可、Android 权限和分发评估。
