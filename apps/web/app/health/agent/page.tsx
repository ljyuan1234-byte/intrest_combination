'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { HealthAgentResponse, HealthMode } from '@life/contracts';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function today() {
  return new Intl.DateTimeFormat('sv-SE').format(new Date());
}

function modeLabel(mode: HealthMode) {
  return mode === 'fat_loss' ? '减脂模式' : '养生模式';
}

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

export default function HealthAgentPage() {
  const [mode, setMode] = useState<HealthMode>('wellness');
  const [date, setDate] = useState(today);
  const [text, setText] = useState('');
  const [waterMl, setWaterMl] = useState('0');
  const [result, setResult] = useState<HealthAgentResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);

    try {
      const data = await request<HealthAgentResponse>(
        `/api/v1/health/agent?date=${encodeURIComponent(date)}&mode=${mode}`,
      );
      setResult(data);
      if (data.intake) {
        setMode(data.intake.mode);
      }
    } catch (requestError) {
      if (requestError instanceof Error && requestError.message !== '需要登录。') {
        setError(requestError.message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // 只在切换日期时重新加载；模式由用户点击后再提交切换。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!text.trim() && Number(waterMl) <= 0) {
      setError('请至少填写吃了什么或喝了多少水。');
      return;
    }

    setIsSaving(true);
    try {
      const data = await request<HealthAgentResponse>('/api/v1/health/agent/intake', {
        method: 'POST',
        body: JSON.stringify({
          localDate: date,
          mode,
          text,
          waterMl: Number(waterMl) || 0,
        }),
      });
      setResult(data);
      setText('');
      setWaterMl('0');
      setMessage(`已累加到 ${date} 的记录，并按${modeLabel(data.analysis.mode)}重新生成计划。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法生成计划。');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="agent-shell">
      <header className="tasks-header">
        <div>
          <p className="eyebrow">HEALTH AGENT</p>
          <h1>健康规划 Agent</h1>
          <p className="lede">输入今天吃了什么、喝了多少水，估算热量并生成明天、7 天和长期计划。</p>
        </div>
        <div className="header-actions">
          <a className="text-link" href="/health/chat">对话模式</a>
          <a className="text-link" href="/health">健康记录</a>
          <a className="text-link" href="/">返回首页</a>
        </div>
      </header>

      <section className="agent-mode-tabs" aria-label="选择健康模式">
        <button className={mode === 'wellness' ? 'active' : ''} onClick={() => setMode('wellness')} type="button">
          养生模式
          <span>均衡、规律、提升精力</span>
        </button>
        <button className={mode === 'fat_loss' ? 'active' : ''} onClick={() => setMode('fat_loss')} type="button">
          减脂模式
          <span>温和热量缺口、保肌肉</span>
        </button>
      </section>

      <section className="agent-input-card">
        <form className="agent-form" onSubmit={analyze}>
          <label htmlFor="agent-date">日期</label>
          <input id="agent-date" onChange={(event) => setDate(event.target.value)} type="date" value={date} />

          <label htmlFor="agent-text">今天吃了什么</label>
          <textarea
            id="agent-text"
            maxLength={4000}
            onChange={(event) => setText(event.target.value)}
            placeholder="例如：早餐两个鸡蛋、一杯牛奶；午餐一碗米饭、150g 鸡胸肉、一份西兰花；晚餐一碗粥、一份青菜。"
            rows={6}
            value={text}
          />

          <label htmlFor="agent-water">本次饮水（ml）</label>
          <input
            id="agent-water"
            inputMode="numeric"
            max={10000}
            min={0}
            onChange={(event) => setWaterMl(event.target.value)}
            type="number"
            value={waterMl}
          />

          <button className="primary-button" disabled={isSaving} type="submit">
            {isSaving ? '正在分析…' : '分析今天并生成计划'}
          </button>
        </form>
          <p className="agent-hint">
            每次提交都会累加到当天，不会覆盖之前的记录。食物识别基于内置食物表，份量写法越具体越准确；未识别食物会提示，不会自动猜测热量。
          </p>
      </section>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {message ? <p className="auth-message">{message}</p> : null}
      {isLoading ? <p className="lede">正在加载健康数据…</p> : null}

      {result ? (
        <>
          <section className="agent-summary-grid">
            <article className="agent-stat">
              <span>今日估算摄入</span>
              <strong>{result.intake?.totalCalories ?? 0}</strong>
              <small>kcal</small>
            </article>
            <article className="agent-stat">
              <span>{modeLabel(result.analysis.mode)}目标</span>
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
              <span>今日运动</span>
              <strong>{result.analysis.metrics.exerciseMinutes ?? '—'}</strong>
              <small>分钟</small>
            </article>
            <article className="agent-stat">
              <span>昨晚睡眠</span>
              <strong>{result.analysis.metrics.sleepMinutes ?? '—'}</strong>
              <small>分钟</small>
            </article>
            <article className="agent-stat">
              <span>BMI</span>
              <strong>{result.analysis.bmi ?? '—'}</strong>
              <small>{result.analysis.estimated ? '档案不完整，估算' : '按当前档案'}</small>
            </article>
          </section>

          <section className="agent-analysis-card">
            <div className="panel-heading">
              <h2>今日分析</h2>
              <span className="agent-badge">{result.analysis.estimated ? '估算值' : '按档案计算'}</span>
            </div>
            <p>{result.analysis.summary}</p>
            <p className="agent-subtle">
              BMR {result.analysis.bmr} kcal · TDEE {result.analysis.tdee} kcal · 基础目标 {result.analysis.targetCalories} kcal
            </p>
            {result.analysis.warnings.length > 0 ? (
              <ul className="agent-warnings">
                {result.analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            ) : null}
          </section>

          <section className="agent-plan-card">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">NEXT DAY</p>
                <h2>明天</h2>
              </div>
              <span>{result.plan.nextDay.calorieTarget} kcal · {result.plan.nextDay.waterMl}ml 水</span>
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
          </section>

          <section className="agent-plan-card">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">7-DAY PLAN</p>
                <h2>未来一周</h2>
              </div>
              <span>按每天 {result.analysis.targetCalories} kcal</span>
            </div>
            <div className="agent-week-grid">
              {result.plan.week.map((day) => (
                <article className="agent-day-card" key={day.day}>
                  <div className="agent-day-head">
                    <b>{day.day}</b>
                    <span>{day.focus}</span>
                  </div>
                  <p>{day.meals.map((meal) => `${meal.slot}：${meal.suggestion}`).join('；')}</p>
                  <small>{day.activity}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="agent-plan-card">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">LONG TERM</p>
                <h2>长期计划</h2>
              </div>
            </div>
            <p className="agent-focus">{result.plan.longTerm.goal}</p>
            <div className="agent-milestones">
              {result.plan.longTerm.milestones.map((milestone) => (
                <article key={milestone.period}>
                  <b>{milestone.period}</b>
                  <p>{milestone.target}</p>
                  <ul>
                    {milestone.actions.map((action) => <li key={action}>{action}</li>)}
                  </ul>
                </article>
              ))}
            </div>
            <div className="agent-two-col">
              <div>
                <h3>建议习惯</h3>
                <ul>{result.plan.longTerm.habits.map((habit) => <li key={habit}>{habit}</li>)}</ul>
              </div>
              <div>
                <h3>注意事项</h3>
                <ul>{result.plan.longTerm.cautions.map((caution) => <li key={caution}>{caution}</li>)}</ul>
              </div>
            </div>
            <p className="agent-disclaimer">{result.plan.disclaimer}</p>
          </section>
        </>
      ) : null}
    </main>
  );
}
