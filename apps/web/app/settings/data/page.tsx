'use client';

import { useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function DataSettingsPage() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

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

  async function exportData() {
    setError(null);
    setMessage(null);

    try {
      const data = await request('/api/v1/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `life-assistant-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage('数据导出已准备完成并开始下载。');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法导出数据。');
    }
  }

  async function deleteAccount() {
    if (confirmation !== 'DELETE') {
      setError('请输入 DELETE 以确认删除账户。');
      return;
    }

    setError(null);
    setMessage(null);
    setIsDeleting(true);

    try {
      await request('/api/v1/me/delete-account', {
        method: 'POST',
        body: JSON.stringify({ confirmation }),
      });
      window.location.assign('/login');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法删除账户。');
      setIsDeleting(false);
    }
  }

  return (
    <main className="data-shell">
      <header className="tasks-header">
        <div>
          <p className="eyebrow">DATA GOVERNANCE</p>
          <h1>数据与账户</h1>
          <p className="lede">下载你的个人数据，或永久停用当前账户。</p>
        </div>
        <a className="text-link" href="/">返回首页</a>
      </header>

      <section className="data-grid">
        <article className="task-create-card">
          <h2>导出个人数据</h2>
          <p className="data-copy">导出包括当前账户资料、待办、日程、提醒、健康记录、消费分类和消费记录，不包含会话凭证或密码。</p>
          <button className="primary-button" onClick={() => void exportData()} type="button">下载 JSON 导出文件</button>
        </article>

        <article className="danger-card">
          <h2>删除账户</h2>
          <p>账户删除后，当前及所有设备的会话将被撤销，业务数据不再可通过账户访问。此操作需要明确确认。</p>
          <label htmlFor="delete-confirmation">输入 DELETE 确认</label>
          <input id="delete-confirmation" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
          <button className="danger-button" disabled={isDeleting} onClick={() => void deleteAccount()} type="button">
            {isDeleting ? '正在删除…' : '删除账户'}
          </button>
        </article>
      </section>

      {message ? <p className="auth-message">{message}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </main>
  );
}
