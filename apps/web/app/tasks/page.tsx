'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Task } from '@life/contracts';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function formatDueAt(value: string | null) {
  if (!value) return '未设置截止时间';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function request(path: string, options?: RequestInit) {
    const response = await fetch(`${apiUrl}${path}`, {
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(options?.headers ?? {}),
      },
      ...options,
    });

    if (response.status === 401) {
      window.location.assign('/login');
      throw new Error('需要登录。');
    }

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? '请求失败。');
    return payload.data;
  }

  async function loadTasks() {
    setIsLoading(true);
    setError(null);

    try {
      const data = await request('/api/v1/tasks');
      setTasks(data.tasks);
    } catch (requestError) {
      if (requestError instanceof Error && requestError.message !== '需要登录。') {
        setError(requestError.message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, []);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const data = await request('/api/v1/tasks', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          title,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });
      setTasks((current) => [...current, data.task]);
      setTitle('');
      setDueAt('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法创建待办。');
    } finally {
      setIsSaving(false);
    }
  }

  async function updateTask(task: Task, status: Task['status']) {
    setError(null);

    try {
      const data = await request(`/api/v1/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setTasks((current) => current.map((item) => (item.id === task.id ? data.task : item)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法更新待办。');
    }
  }

  async function deleteTask(task: Task) {
    setError(null);

    try {
      await request(`/api/v1/tasks/${task.id}`, { method: 'DELETE' });
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法删除待办。');
    }
  }

  return (
    <main className="tasks-shell">
      <header className="tasks-header">
        <div>
          <p className="eyebrow">PLANNING</p>
          <h1>待办事项</h1>
          <p className="lede">创建、完成和整理今天要做的事。</p>
        </div>
        <a className="text-link" href="/">返回首页</a>
      </header>

      <section className="task-create-card">
        <form className="task-create-form" onSubmit={createTask}>
          <label htmlFor="task-title">新待办</label>
          <input
            id="task-title"
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：完成每周运动计划"
            required
            value={title}
          />
          <label htmlFor="task-due-at">截止时间（可选）</label>
          <input id="task-due-at" onChange={(event) => setDueAt(event.target.value)} type="datetime-local" value={dueAt} />
          <button className="primary-button" disabled={isSaving} type="submit">
            {isSaving ? '保存中…' : '添加待办'}
          </button>
        </form>
      </section>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {isLoading ? <p className="lede">正在加载待办…</p> : null}

      {!isLoading && tasks.length === 0 ? (
        <section className="task-empty">
          <h2>今天还没有待办</h2>
          <p>从一件明确的小事开始，记录后可以随时完成、恢复或删除。</p>
        </section>
      ) : null}

      <section className="task-list">
        {tasks.map((task) => (
          <article className={`task-row ${task.status}`} key={task.id}>
            <button
              aria-label={task.status === 'done' ? '恢复待办' : '完成待办'}
              className="task-check"
              onClick={() => void updateTask(task, task.status === 'done' ? 'todo' : 'done')}
              type="button"
            >
              {task.status === 'done' ? '✓' : ''}
            </button>
            <div className="task-content">
              <h2>{task.title}</h2>
              <p>{task.status === 'cancelled' ? '已取消' : formatDueAt(task.dueAt)}</p>
            </div>
            {task.status !== 'cancelled' ? (
              <button className="text-button" onClick={() => void updateTask(task, 'cancelled')} type="button">
                取消
              </button>
            ) : null}
            <button className="text-button task-delete" onClick={() => void deleteTask(task)} type="button">
              删除
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}
