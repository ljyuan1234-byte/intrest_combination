'use client';

import { FormEvent, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? '无法生成登录凭证。');
      }

      setMessage('登录凭证已生成。开发环境请从 API 的结构化日志中复制一次性凭证。');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法连接认证服务。');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? '登录失败。');
      }

      window.location.assign('/');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法验证登录凭证。');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">PERSONAL OPERATING SYSTEM</p>
        <h1>登录你的生活助手</h1>
        <p className="lede">使用邮箱一次性凭证登录。系统不会保存密码。</p>

        <form className="auth-form" onSubmit={requestLogin}>
          <label htmlFor="email">邮箱</label>
          <input
            id="email"
            autoComplete="email"
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
          <button className="primary-button" disabled={isSubmitting} type="submit">
            生成登录凭证
          </button>
        </form>

        <form className="auth-form auth-form-secondary" onSubmit={verifyLogin}>
          <label htmlFor="token">一次性凭证</label>
          <input
            id="token"
            autoComplete="one-time-code"
            onChange={(event) => setToken(event.target.value)}
            placeholder="粘贴登录凭证"
            required
            type="text"
            value={token}
          />
          <button className="text-button" disabled={isSubmitting} type="submit">
            验证并登录
          </button>
        </form>

        {message ? <p className="auth-message">{message}</p> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
