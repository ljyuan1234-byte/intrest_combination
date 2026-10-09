'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Expense, ExpenseCategory, FinanceSummary } from '@life/contracts';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function currentMonth() {
  return new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit' }).format(new Date());
}

function dateToday() {
  return new Intl.DateTimeFormat('sv-SE').format(new Date());
}

function formatMoney(amountMinor: number, currency = 'CNY') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(amountMinor / 100);
}

export default function FinancePage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [month, setMonth] = useState(currentMonth);
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(dateToday);
  const [categoryId, setCategoryId] = useState('');
  const [merchant, setMerchant] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
    setIsLoading(true);
    setError(null);

    try {
      const [categoryData, expenseData, summaryData] = await Promise.all([
        request('/api/v1/finance/categories'),
        request('/api/v1/finance/expenses'),
        request(`/api/v1/finance/summary?month=${month}`),
      ]);
      setCategories(categoryData.categories);
      setExpenses(expenseData.expenses);
      setSummary(summaryData);
    } catch (requestError) {
      if (requestError instanceof Error && requestError.message !== '需要登录。') setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [month]);

  const visibleExpenses = useMemo(
    () => expenses.filter((expense) => expense.occurredOn.startsWith(month)).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)),
    [expenses, month],
  );

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryName.trim()) return;

    try {
      const data = await request('/api/v1/finance/categories', {
        method: 'POST',
        body: JSON.stringify({ name: categoryName, color: '#5c83a6' }),
      });
      setCategories((current) => [...current, data.category].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryId(data.category.id);
      setCategoryName('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法创建分类。');
    }
  }

  async function createExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError('请输入大于零的金额。');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const data = await request('/api/v1/finance/expenses', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          amountMinor,
          currency: 'CNY',
          occurredOn,
          categoryId: categoryId || null,
          merchant: merchant || null,
        }),
      });
      setExpenses((current) => [data.expense, ...current]);
      setAmount('');
      setMerchant('');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法保存消费。');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteExpense(expense: Expense) {
    try {
      await request(`/api/v1/finance/expenses/${expense.id}`, { method: 'DELETE' });
      setExpenses((current) => current.filter((item) => item.id !== expense.id));
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法删除消费。');
    }
  }

  return (
    <main className="finance-shell">
      <header className="tasks-header">
        <div>
          <p className="eyebrow">FINANCE</p>
          <h1>手动记账</h1>
          <p className="lede">记录日常消费，查看本月的分类汇总。</p>
        </div>
        <a className="text-link" href="/">返回首页</a>
      </header>

      <section className="finance-summary-card">
        <label htmlFor="finance-month">统计月份</label>
        <input id="finance-month" onChange={(event) => setMonth(event.target.value)} type="month" value={month} />
        <strong>{formatMoney(summary?.totalMinor ?? 0, summary?.currency)}</strong>
        <span>本月已记录消费</span>
      </section>

      <section className="finance-grid">
        <article className="task-create-card">
          <h2>记录一笔消费</h2>
          <form className="finance-form" onSubmit={createExpense}>
            <label htmlFor="expense-amount">金额（元）</label>
            <input id="expense-amount" inputMode="decimal" min="0.01" onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required step="0.01" type="number" value={amount} />
            <label htmlFor="expense-date">日期</label>
            <input id="expense-date" onChange={(event) => setOccurredOn(event.target.value)} required type="date" value={occurredOn} />
            <label htmlFor="expense-category">分类</label>
            <select id="expense-category" onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>
              <option value="">未分类</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <label htmlFor="expense-merchant">商户（可选）</label>
            <input id="expense-merchant" maxLength={120} onChange={(event) => setMerchant(event.target.value)} placeholder="例如：便利店" value={merchant} />
            <button className="primary-button" disabled={isSaving} type="submit">{isSaving ? '保存中…' : '保存消费'}</button>
          </form>
        </article>

        <article className="task-create-card">
          <h2>消费分类</h2>
          <form className="category-form" onSubmit={createCategory}>
            <input maxLength={60} onChange={(event) => setCategoryName(event.target.value)} placeholder="例如：餐饮" value={categoryName} />
            <button className="text-button" type="submit">添加</button>
          </form>
          <div className="category-list">
            {categories.length === 0 ? <p>尚未创建分类。</p> : categories.map((category) => <span key={category.id}><i style={{ backgroundColor: category.color }} />{category.name}</span>)}
          </div>
        </article>
      </section>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {isLoading ? <p className="lede">正在加载消费记录…</p> : null}

      {!isLoading ? (
        <section className="finance-records">
          <div className="panel-heading">
            <h2>{month} 消费明细</h2>
            <span>{visibleExpenses.length} 笔记录</span>
          </div>
          {visibleExpenses.length === 0 ? <p className="lede">本月还没有消费记录。</p> : visibleExpenses.map((expense) => (
            <article className="expense-row" key={expense.id}>
              <div>
                <strong>{expense.merchant || '未命名消费'}</strong>
                <p>{expense.occurredOn} · {categories.find((category) => category.id === expense.categoryId)?.name ?? '未分类'}</p>
              </div>
              <b>{formatMoney(expense.amountMinor, expense.currency)}</b>
              <button className="text-button task-delete" onClick={() => void deleteExpense(expense)} type="button">删除</button>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
