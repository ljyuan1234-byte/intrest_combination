'use client';

import { FormEvent, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Mode = 'login' | 'register';

export function LoginForm() {
  const [mode, setMode] = useState<Mode>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
    setPassword('');
    setConfirmPassword('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (mode === 'register') {
      if (password.length < 8) {
        setError('密码至少需要 8 位。');
        return;
      }
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致。');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const endpoint = mode === 'register' ? '/api/v1/auth/register' : '/api/v1/auth/login';
      const body =
        mode === 'register'
          ? {
              identifier,
              password,
              displayName: displayName.trim() || null,
            }
          : { identifier, password };

      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? (mode === 'register' ? '注册失败。' : '登录失败。'));
      }

      setMessage(mode === 'register' ? '注册成功，正在进入助手…' : '登录成功，正在进入助手…');
      window.location.assign('/');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法连接认证服务。');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">PERSONAL OPERATING SYSTEM</p>
        <h1>{mode === 'login' ? '登录你的生活助手' : '创建你的生活助手'}</h1>
        <p className="lede">
          {mode === 'login'
            ? '使用注册时的邮箱或手机号登录。'
            : '使用邮箱或手机号注册，密码至少 8 位。'}
        </p>

        <div className="auth-tabs" role="tablist" aria-label="登录或注册">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
            role="tab"
            aria-selected={mode === 'login'}
            type="button"
          >
            登录
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            onClick={() => switchMode('register')}
            role="tab"
            aria-selected={mode === 'register'}
            type="button"
          >
            注册
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="identifier">邮箱或手机号</label>
          <input
            id="identifier"
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect="off"
            inputMode="email"
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="you@example.com 或 13800138000"
            required
            type="text"
            value={identifier}
          />

          {mode === 'register' ? (
            <>
              <label htmlFor="display-name">昵称（可选）</label>
              <input
                id="display-name"
                autoComplete="nickname"
                maxLength={120}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="例如：小助手"
                type="text"
                value={displayName}
              />
            </>
          ) : null}

          <label htmlFor="password">密码</label>
          <input
            id="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 8 : 1}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === 'register' ? '至少 8 位' : '输入密码'}
            required
            type="password"
            value={password}
          />

          {mode === 'register' ? (
            <>
              <label htmlFor="confirm-password">确认密码</label>
              <input
                id="confirm-password"
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入密码"
                required
                type="password"
                value={confirmPassword}
              />
            </>
          ) : null}

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>

        {message ? <p className="auth-message">{message}</p> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}

        <p className="auth-switch">
          {mode === 'login' ? '还没有账号？' : '已经有账号？'}
          <button onClick={() => switchMode(mode === 'login' ? 'register' : 'login')} type="button">
            {mode === 'login' ? '注册' : '去登录'}
          </button>
        </p>
      </section>
    </main>
  );
}
