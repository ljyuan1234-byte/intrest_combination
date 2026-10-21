'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { HealthChatMessage, HealthChatResponse, HealthMode } from '@life/contracts';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type History = {
  conversation: { id: string; mode: HealthMode; title: string } | null;
  messages: HealthChatMessage[];
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });

  if (response.status === 401) {
    window.location.assign('/login');
    throw new Error('需要登录。');
  }

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? '请求失败。');
  return payload.data as T;
}

const intentLabels: Record<string, string> = {
  log_food: '记录饮食',
  ask_plan: '生成计划',
  adjust_plan: '调整计划',
  general: '一般咨询',
};

export default function HealthChatPage() {
  const [mode, setMode] = useState<HealthMode>('wellness');
  const [messages, setMessages] = useState<HealthChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<HealthChatResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    request<History>('/api/v1/health/chat')
      .then((history) => {
        if (!active) return;
        if (history.conversation) {
          setMode(history.conversation.mode);
        }
        setMessages(history.messages);
      })
      .catch((requestError) => {
        if (active && requestError instanceof Error && requestError.message !== '需要登录。') {
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) return;

    setError(null);
    setIsSending(true);
    const message = input.trim();
    setInput('');

    try {
      const data = await request<HealthChatResponse>('/api/v1/health/chat', {
        method: 'POST',
        body: JSON.stringify({ message, mode }),
      });
      setMessages(data.messages);
      setResult(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '发送失败。');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="chat-shell">
      <header className="tasks-header">
        <div>
          <p className="eyebrow">HEALTH CONVERSATION</p>
          <h1>健康对话</h1>
          <p className="lede">直接说今天吃了什么、睡得怎么样，Agent 会追问、解释并更新计划。</p>
        </div>
        <div className="header-actions">
          <a className="text-link" href="/health/agent">计划面板</a>
          <a className="text-link" href="/health">健康记录</a>
          <a className="text-link" href="/">返回首页</a>
        </div>
      </header>

      <section className="chat-mode-tabs" aria-label="选择健康模式">
        <button className={mode === 'wellness' ? 'active' : ''} onClick={() => setMode('wellness')} type="button">
          养生模式
        </button>
        <button className={mode === 'fat_loss' ? 'active' : ''} onClick={() => setMode('fat_loss')} type="button">
          减脂模式
        </button>
      </section>

      <section className="chat-card">
        <div className="chat-messages">
          {messages.length === 0 && !isLoading ? (
            <div className="chat-empty">
              <p className="eyebrow">START HERE</p>
              <h2>今天过得怎么样？</h2>
              <p>可以这样说：“早餐两个鸡蛋一杯牛奶，午餐食堂套餐，昨晚睡了 6 小时，今天走了 7000 步。”</p>
            </div>
          ) : null}

          {messages.map((message) => (
            <article className={`chat-bubble ${message.role === 'user' ? 'user' : 'assistant'}`} key={message.id}>
              <span className="chat-role">{message.role === 'user' ? '你' : '健康 Agent'}</span>
              <p>{message.content}</p>
            </article>
          ))}

          {isSending ? <p className="chat-thinking">正在分析并更新计划…</p> : null}
          {isLoading ? <p className="chat-thinking">正在加载历史对话…</p> : null}
        </div>

        <form className="chat-form" onSubmit={send}>
          <textarea
            maxLength={2000}
            onChange={(event) => setInput(event.target.value)}
            placeholder="例如：今天午餐吃了黄焖鸡米饭，昨晚只睡了 5 个半小时，下午特别困。"
            rows={3}
            value={input}
          />
          <div className="chat-form-footer">
            <span>热量由确定性食物库计算；有模型配置时，模型只负责追问和解释。</span>
            <button className="primary-button" disabled={isSending || !input.trim()} type="submit">
              {isSending ? '发送中…' : '发送'}
            </button>
          </div>
        </form>
      </section>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {result ? (
        <>
          <section className="chat-result-head">
            <div>
              <p className="eyebrow">AGENT RESULT</p>
              <h2>本轮执行：{intentLabels[result.execution.intent] ?? result.execution.intent}</h2>
              <p className="agent-subtle">
                工具步骤：{result.execution.steps.join(' → ')}
                {result.execution.followUp ? ` · 追问：${result.execution.followUp}` : ''}
              </p>
            </div>
            <span className="agent-badge">{result.analysis.estimated ? '估算值' : '按档案计算'}</span>
          </section>

          <section className="agent-summary-grid">
            <article className="agent-stat">
              <span>今日累计摄入</span>
              <strong>{result.intake?.totalCalories ?? 0}</strong>
              <small>kcal</small>
            </article>
            <article className="agent-stat">
              <span>目标</span>
              <strong>{result.analysis.targetCalories}</strong>
              <small>kcal / 天</small>
            </article>
            <article className="agent-stat">
              <span>热量差额</span>
              <strong>{result.intake ? (result.analysis.calorieBalance > 0 ? '+' : '') + result.analysis.calorieBalance : '—'}</strong>
              <small>摄入 - 目标</small>
            </article>
            <article className="agent-stat">
              <span>蛋白质</span>
              <strong>{result.intake?.proteinG ?? 0}</strong>
              <small>目标 {result.analysis.proteinTargetG}g</small>
            </article>
            <article className="agent-stat">
              <span>饮水</span>
              <strong>{result.intake?.waterMl ?? 0}</strong>
              <small>目标 {result.analysis.waterTargetMl}ml</small>
            </article>
            <article className="agent-stat">
              <span>睡眠 / 运动</span>
              <strong>{result.analysis.metrics.sleepMinutes ?? '—'} / {result.analysis.metrics.exerciseMinutes ?? '—'}</strong>
              <small>分钟</small>
            </article>
          </section>

          <section className="agent-plan-card">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">NEXT DAY</p>
                <h2>明天怎么吃</h2>
              </div>
              <span>{result.plan.nextDay.calorieTarget} kcal</span>
            </div>
            <p className="agent-focus">{result.plan.nextDay.focus}</p>
            <div className="agent-meal-list">
              {result.plan.nextDay.meals.map((meal) => (
                <div className="agent-meal-row" key={meal.slot}>
                  <b>{meal.slot}</b>
                  <span>{meal.suggestion}</span>
                  <em>{meal.calories} kcal</em>
                </div>
              ))}
            </div>
            <p className="agent-activity">{result.plan.nextDay.activity}</p>
            <p className="agent-disclaimer">{result.plan.disclaimer}</p>
          </section>
        </>
      ) : null}
    </main>
  );
}
