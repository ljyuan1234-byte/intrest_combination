'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { CalendarEvent, Reminder } from '@life/contracts';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function toDateTimeLocal(value: Date) {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(() => toDateTimeLocal(new Date()));
  const [endsAt, setEndsAt] = useState('');
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderAt, setReminderAt] = useState(() => toDateTimeLocal(new Date()));
  const [eventId, setEventId] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function request(path: string, options?: RequestInit) {
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
    return payload.data;
  }

  async function load() {
    setError(null);
    try {
      const [eventData, reminderData] = await Promise.all([
        request('/api/v1/calendar/events'),
        request('/api/v1/reminders'),
      ]);
      setEvents(eventData.events);
      setReminders(reminderData.reminders);
    } catch (requestError) {
      if (requestError instanceof Error && requestError.message !== '需要登录。') setError(requestError.message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const data = await request('/api/v1/calendar/events', {
        method: 'POST',
        body: JSON.stringify({
          title,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        }),
      });
      setEvents((current) => [...current, data.event].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setTitle('');
      setEndsAt('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法创建日程。');
    }
  }

  async function createReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const data = await request('/api/v1/reminders', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          title: reminderTitle,
          eventId: eventId || null,
          scheduledAt: new Date(reminderAt).toISOString(),
        }),
      });
      setReminders((current) => [...current, data.reminder].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
      setReminderTitle('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法创建提醒。');
    }
  }

  async function deleteResource(path: string, kind: 'event' | 'reminder', id: string) {
    try {
      await request(path, { method: 'DELETE' });
      if (kind === 'event') {
        setEvents((current) => current.filter((item) => item.id !== id));
        setReminders((current) => current.filter((item) => item.eventId !== id));
      } else {
        setReminders((current) => current.filter((item) => item.id !== id));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法取消项目。');
    }
  }

  return (
    <main className="calendar-shell">
      <header className="tasks-header">
        <div>
          <p className="eyebrow">PLANNING</p>
          <h1>日程与提醒</h1>
          <p className="lede">手动安排时间，并为重要事项保留提醒记录。</p>
        </div>
        <a className="text-link" href="/">返回首页</a>
      </header>

      <section className="calendar-grid">
        <article className="task-create-card">
          <h2>新增日程</h2>
          <form className="calendar-form" onSubmit={createEvent}>
            <label htmlFor="event-title">标题</label>
            <input id="event-title" maxLength={200} onChange={(event) => setTitle(event.target.value)} required value={title} />
            <label htmlFor="event-start">开始时间</label>
            <input id="event-start" onChange={(event) => setStartsAt(event.target.value)} required type="datetime-local" value={startsAt} />
            <label htmlFor="event-end">结束时间（可选）</label>
            <input id="event-end" onChange={(event) => setEndsAt(event.target.value)} type="datetime-local" value={endsAt} />
            <button className="primary-button" type="submit">保存日程</button>
          </form>
        </article>

        <article className="task-create-card">
          <h2>新增提醒</h2>
          <form className="calendar-form" onSubmit={createReminder}>
            <label htmlFor="reminder-title">提醒内容</label>
            <input id="reminder-title" maxLength={200} onChange={(event) => setReminderTitle(event.target.value)} required value={reminderTitle} />
            <label htmlFor="reminder-event">关联日程（可选）</label>
            <select id="reminder-event" onChange={(event) => setEventId(event.target.value)} value={eventId}>
              <option value="">独立提醒</option>
              {events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <label htmlFor="reminder-at">提醒时间</label>
            <input id="reminder-at" onChange={(event) => setReminderAt(event.target.value)} required type="datetime-local" value={reminderAt} />
            <button className="primary-button" type="submit">保存提醒</button>
          </form>
        </article>
      </section>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <section className="calendar-list">
        <div className="panel-heading"><h2>日程</h2><span>{events.length} 个</span></div>
        {events.length === 0 ? <p className="lede">还没有日程安排。</p> : events.map((item) => (
          <article className="calendar-row" key={item.id}>
            <div><strong>{item.title}</strong><p>{formatDateTime(item.startsAt)}{item.endsAt ? ` — ${formatDateTime(item.endsAt)}` : ''}</p></div>
            <button className="text-button task-delete" onClick={() => void deleteResource(`/api/v1/calendar/events/${item.id}`, 'event', item.id)} type="button">删除</button>
          </article>
        ))}
      </section>

      <section className="calendar-list">
        <div className="panel-heading"><h2>待执行提醒</h2><span>{reminders.length} 个</span></div>
        {reminders.length === 0 ? <p className="lede">还没有待执行提醒。</p> : reminders.map((item) => (
          <article className="calendar-row" key={item.id}>
            <div><strong>{item.title}</strong><p>{formatDateTime(item.scheduledAt)}</p></div>
            <button className="text-button task-delete" onClick={() => void deleteResource(`/api/v1/reminders/${item.id}`, 'reminder', item.id)} type="button">取消</button>
          </article>
        ))}
      </section>
    </main>
  );
}
