'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { HealthAdvice, HealthProfile, HealthRecord } from '@life/contracts';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const metrics = [
  { id: 'water', label: '饮水', unit: 'ml', placeholder: '例如：500' },
  { id: 'sleep', label: '睡眠', unit: 'min', placeholder: '例如：480' },
  { id: 'steps', label: '步数', unit: 'count', placeholder: '例如：8000' },
  { id: 'exercise', label: '锻炼', unit: 'min', placeholder: '例如：30' },
  { id: 'weight', label: '体重', unit: 'kg', placeholder: '例如：65.5' },
] as const;

type ProfileForm = {
  heightCm: string;
  birthYear: string;
  sex: 'male' | 'female' | 'other' | '';
  weightKg: string;
  targetWeightKg: string;
  activityLevel: 'low' | 'medium' | 'high';
  goal: string;
  allergies: string;
  dietaryPreferences: string;
  exerciseLimitations: string;
  availableTime: string;
};

const emptyProfileForm: ProfileForm = {
  heightCm: '',
  birthYear: '',
  sex: '',
  weightKg: '',
  targetWeightKg: '',
  activityLevel: 'medium',
  goal: '',
  allergies: '',
  dietaryPreferences: '',
  exerciseLimitations: '',
  availableTime: '',
};

function today() {
  return new Intl.DateTimeFormat('sv-SE').format(new Date());
}

function metricLabel(metric: HealthRecord['metric']) {
  return metrics.find((item) => item.id === metric)?.label ?? '饮食记录';
}

function profileToForm(profile: HealthProfile | null): ProfileForm {
  if (!profile) return emptyProfileForm;

  return {
    heightCm: profile.heightCm?.toString() ?? '',
    birthYear: profile.birthYear?.toString() ?? '',
    sex: profile.sex ?? '',
    weightKg: profile.weightKg?.toString() ?? '',
    targetWeightKg: profile.targetWeightKg?.toString() ?? '',
    activityLevel: profile.activityLevel,
    goal: profile.goal ?? '',
    allergies: profile.allergies ?? '',
    dietaryPreferences: profile.dietaryPreferences ?? '',
    exerciseLimitations: profile.exerciseLimitations ?? '',
    availableTime: profile.availableTime ?? '',
  };
}

export default function HealthPage() {
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [advice, setAdvice] = useState<HealthAdvice | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm);
  const [showProfile, setShowProfile] = useState(false);
  const [metric, setMetric] = useState<(typeof metrics)[number]['id']>('water');
  const [value, setValue] = useState('');
  const [localDate, setLocalDate] = useState(today);
  const [dietNote, setDietNote] = useState('');
  const [isDietNote, setIsDietNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

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
      const [recordData, adviceData, profileData] = await Promise.all([
        request('/api/v1/health/records'),
        request('/api/v1/health/advice'),
        request('/api/v1/health/profile'),
      ]);
      setRecords(recordData.records);
      setAdvice(adviceData);
      setProfileForm(profileToForm(profileData.profile));
    } catch (requestError) {
      if (requestError instanceof Error && requestError.message !== '需要登录。') setError(requestError.message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSaving(true);

    try {
      const selected = metrics.find((item) => item.id === metric);
      const payload = isDietNote
        ? { metric: 'diet_note', valueText: dietNote, unit: 'text', localDate }
        : { metric, valueNumber: Number(value), unit: selected?.unit, localDate };

      const data = await request('/api/v1/health/records', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setRecords((current) => [data.record, ...current]);
      setValue('');
      setDietNote('');
      setMessage('健康记录已保存。');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法保存健康记录。');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSavingProfile(true);

    try {
      const data = await request('/api/v1/health/profile', {
        method: 'PUT',
        body: JSON.stringify({
          heightCm: profileForm.heightCm ? Number(profileForm.heightCm) : null,
          birthYear: profileForm.birthYear ? Number(profileForm.birthYear) : null,
          sex: profileForm.sex || null,
          weightKg: profileForm.weightKg ? Number(profileForm.weightKg) : null,
          targetWeightKg: profileForm.targetWeightKg ? Number(profileForm.targetWeightKg) : null,
          activityLevel: profileForm.activityLevel,
          goal: profileForm.goal || null,
          allergies: profileForm.allergies || null,
          dietaryPreferences: profileForm.dietaryPreferences || null,
          exerciseLimitations: profileForm.exerciseLimitations || null,
          availableTime: profileForm.availableTime || null,
        }),
      });
      setProfileForm(profileToForm(data.profile));
      setMessage('健康档案已保存。建议会在安全范围内参考你主动填写的信息。');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法保存健康档案。');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function deleteRecord(record: HealthRecord) {
    setError(null);

    try {
      await request(`/api/v1/health/records/${record.id}`, { method: 'DELETE' });
      setRecords((current) => current.filter((item) => item.id !== record.id));
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法删除健康记录。');
    }
  }

  return (
    <main className="health-shell">
      <header className="tasks-header">
        <div>
          <p className="eyebrow">HEALTH</p>
          <h1>健康记录</h1>
          <p className="lede">手动记录日常数据，获得仅供生活方式参考的提示。</p>
        </div>
        <div className="header-actions">
          <a className="text-link" href="/health/chat">健康对话</a>
          <a className="text-link" href="/health/agent">健康 Agent</a>
          <a className="text-link" href="/">返回首页</a>
        </div>
      </header>

      {advice ? (
        <section className="health-advice-card">
          <p className="eyebrow">TODAY’S SIGNAL</p>
          <h2>今日建议</h2>
          <p>{advice.suggestion}</p>
          <small>{advice.dataRange}</small>
          <small>{advice.disclaimer}</small>
        </section>
      ) : null}

      <section className="health-profile-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">OPTIONAL PROFILE</p>
            <h2>健康档案</h2>
          </div>
          <button className="text-button" onClick={() => setShowProfile((current) => !current)} type="button">
            {showProfile ? '收起' : '编辑'}
          </button>
        </div>
        <p className="data-copy">档案完全由你主动填写，仅在生成日常生活方式提示时按需参考，不能用于医疗诊断。</p>

        {showProfile ? (
          <form className="profile-form" onSubmit={saveProfile}>
            <label htmlFor="profile-height">身高（厘米，可选）</label>
            <input id="profile-height" inputMode="decimal" min="1" onChange={(event) => setProfileForm((current) => ({ ...current, heightCm: event.target.value }))} type="number" value={profileForm.heightCm} />
            <label htmlFor="profile-birth-year">出生年份（可选）</label>
            <input id="profile-birth-year" inputMode="numeric" min="1900" onChange={(event) => setProfileForm((current) => ({ ...current, birthYear: event.target.value }))} type="number" value={profileForm.birthYear} />
            <label htmlFor="profile-sex">性别（用于热量估算）</label>
            <select id="profile-sex" onChange={(event) => setProfileForm((current) => ({ ...current, sex: event.target.value as ProfileForm['sex'] }))} value={profileForm.sex}>
              <option value="">未填写</option>
              <option value="male">男</option>
              <option value="female">女</option>
              <option value="other">其他</option>
            </select>
            <label htmlFor="profile-weight">当前体重（kg，可选）</label>
            <input id="profile-weight" inputMode="decimal" min="1" onChange={(event) => setProfileForm((current) => ({ ...current, weightKg: event.target.value }))} type="number" value={profileForm.weightKg} />
            <label htmlFor="profile-target-weight">目标体重（kg，可选）</label>
            <input id="profile-target-weight" inputMode="decimal" min="1" onChange={(event) => setProfileForm((current) => ({ ...current, targetWeightKg: event.target.value }))} type="number" value={profileForm.targetWeightKg} />
            <label htmlFor="profile-activity">日常活动量</label>
            <select id="profile-activity" onChange={(event) => setProfileForm((current) => ({ ...current, activityLevel: event.target.value as ProfileForm['activityLevel'] }))} value={profileForm.activityLevel}>
              <option value="low">低（久坐为主）</option>
              <option value="medium">中（每周活动 2–3 次）</option>
              <option value="high">高（每周活动 4 次以上）</option>
            </select>
            <label htmlFor="profile-goal">目标（可选）</label>
            <input id="profile-goal" maxLength={300} onChange={(event) => setProfileForm((current) => ({ ...current, goal: event.target.value }))} placeholder="例如：保持规律作息" value={profileForm.goal} />
            <label htmlFor="profile-time">可用时间（可选）</label>
            <input id="profile-time" maxLength={300} onChange={(event) => setProfileForm((current) => ({ ...current, availableTime: event.target.value }))} placeholder="例如：工作日晚间 30 分钟" value={profileForm.availableTime} />
            <label htmlFor="profile-allergies">过敏源（可选）</label>
            <textarea id="profile-allergies" maxLength={500} onChange={(event) => setProfileForm((current) => ({ ...current, allergies: event.target.value }))} value={profileForm.allergies} />
            <label htmlFor="profile-preferences">饮食偏好/忌口（可选）</label>
            <textarea id="profile-preferences" maxLength={500} onChange={(event) => setProfileForm((current) => ({ ...current, dietaryPreferences: event.target.value }))} value={profileForm.dietaryPreferences} />
            <label htmlFor="profile-limitations">运动限制（可选）</label>
            <textarea id="profile-limitations" maxLength={500} onChange={(event) => setProfileForm((current) => ({ ...current, exerciseLimitations: event.target.value }))} value={profileForm.exerciseLimitations} />
            <button className="primary-button" disabled={isSavingProfile} type="submit">{isSavingProfile ? '保存中…' : '保存健康档案'}</button>
          </form>
        ) : null}
      </section>

      <section className="health-grid">
        <article className="task-create-card">
          <h2>新增健康记录</h2>
          <form className="health-form" onSubmit={createRecord}>
            <label className="health-toggle">
              <input checked={!isDietNote} name="entry-type" onChange={() => setIsDietNote(false)} type="radio" />
              数值指标
            </label>
            <label className="health-toggle">
              <input checked={isDietNote} name="entry-type" onChange={() => setIsDietNote(true)} type="radio" />
              饮食备注
            </label>

            {!isDietNote ? (
              <>
                <label htmlFor="health-metric">指标</label>
                <select id="health-metric" onChange={(event) => setMetric(event.target.value as (typeof metrics)[number]['id'])} value={metric}>
                  {metrics.map((item) => <option key={item.id} value={item.id}>{item.label}（{item.unit}）</option>)}
                </select>
                <label htmlFor="health-value">数值</label>
                <input id="health-value" inputMode="decimal" min="0" onChange={(event) => setValue(event.target.value)} placeholder={metrics.find((item) => item.id === metric)?.placeholder} required step="any" type="number" value={value} />
              </>
            ) : (
              <>
                <label htmlFor="diet-note">饮食备注</label>
                <textarea id="diet-note" maxLength={1000} onChange={(event) => setDietNote(event.target.value)} placeholder="例如：午餐吃了米饭、蔬菜和鸡肉。" required value={dietNote} />
              </>
            )}

            <label htmlFor="health-date">本地日期</label>
            <input id="health-date" onChange={(event) => setLocalDate(event.target.value)} required type="date" value={localDate} />
            <button className="primary-button" disabled={isSaving} type="submit">{isSaving ? '保存中…' : '保存记录'}</button>
          </form>
        </article>

        <article className="health-disclaimer">
          <h2>使用说明</h2>
          <p>记录饮水、睡眠、活动等数据以帮助你回顾习惯。</p>
          <p>本模块不提供医疗诊断、处方、停药建议或紧急情况判断。</p>
          <p>如果身体不适或遇到紧急情况，请及时联系专业医疗服务。</p>
        </article>
      </section>

      {message ? <p className="auth-message">{message}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <section className="health-records">
        <div className="panel-heading">
          <h2>最近记录</h2>
          <span>{records.length} 条记录</span>
        </div>
        {records.length === 0 ? <p className="lede">还没有健康记录，从饮水或睡眠开始试试。</p> : records.map((record) => (
          <article className="health-row" key={record.id}>
            <div>
              <strong>{metricLabel(record.metric)}</strong>
              <p>{record.localDate} · {record.valueText ?? `${record.valueNumber} ${record.unit}`}</p>
            </div>
            <button className="text-button task-delete" onClick={() => void deleteRecord(record)} type="button">删除</button>
          </article>
        ))}
      </section>
    </main>
  );
}
