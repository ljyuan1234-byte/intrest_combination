'use client';

import { useEffect, useState } from 'react';
import type { Dashboard } from '@life/contracts';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function HomePage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch(`${apiUrl}/api/v1/dashboard`, {
      cache: 'no-store',
      credentials: 'include',
    })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign('/login');
          return null;
        }

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error?.message ?? '无法连接助手服务');
        }

        return payload.data as Dashboard;
      })
      .then((data) => {
        if (active && data) setDashboard(data);
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : '无法连接助手服务');
      });

    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">SERVICE UNAVAILABLE</p>
          <h1>暂时无法加载助手</h1>
          <p className="auth-error">{error}</p>
          <a className="primary-button" href="/login">返回登录</a>
        </section>
      </main>
    );
  }

  if (!dashboard) {
    return (
      <main className="auth-shell">
        <p className="lede">正在加载你的今日概览…</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">PERSONAL OPERATING SYSTEM</p>
          <h1>把今天过得更清楚。</h1>
          <p className="lede">一个围绕日程、健康和消费记录构建的个人云端助手。</p>
        </div>
        <div className="hero-actions">
          <a className="text-link" href="/tasks">管理待办</a>
          <a className="text-link" href="/calendar">日程提醒</a>
          <a className="text-link" href="/health">健康记录</a>
          <a className="text-link" href="/health/agent">健康 Agent</a>
          <a className="text-link" href="/finance">手动记账</a>
          <a className="text-link" href="/settings/data">数据账户</a>
          <div className="date-chip">{dashboard.date}</div>
        </div>
      </section>

      <section className="overview-grid">
        <article className="overview-card accent-blue">
          <span>待办进度</span>
          <strong>{dashboard.tasks.completed}/{dashboard.tasks.total}</strong>
          <small>今天完成的事项</small>
        </article>
        <article className="overview-card accent-green">
          <span>健康记录</span>
          <strong>{dashboard.health.hasTodayEntry ? '已记录' : '待记录'}</strong>
          <small>饮水、睡眠或锻炼</small>
        </article>
        <article className="overview-card accent-orange">
          <span>本月消费</span>
          <strong>¥{(dashboard.finance.monthTotalCents / 100).toFixed(2)}</strong>
          <small>手动记账累计</small>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel advice-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">TODAY’S SIGNAL</p>
              <h2>今天的建议</h2>
            </div>
            <span className="status-dot">● 在线</span>
          </div>
          <p className="advice">{dashboard.health.suggestion}</p>
          <a className="primary-button" href="/health">记录一条数据</a>
        </article>

        <article className="panel modules-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">MODULES</p>
              <h2>你的工具箱</h2>
            </div>
            <button className="text-button" type="button" onClick={() => window.location.assign('/settings/data')}>管理</button>
          </div>
          <div className="module-list">
            {dashboard.modules.map((module) => (
              <div className="module-row" key={module.id}>
                <div className="module-icon">{module.id === 'health' ? 'H' : module.id === 'finance' ? '¥' : 'T'}</div>
                <div>
                  <h3>{module.name}</h3>
                  <p>{module.description}</p>
                </div>
                <span className={`module-status ${module.status}`}>{module.status === 'available' ? '可用' : '计划中'}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
