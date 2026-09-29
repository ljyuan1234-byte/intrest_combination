import { dashboardSchema } from '@life/contracts';

async function getDashboard() {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/dashboard`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('无法连接助手服务');
  }

  return dashboardSchema.parse(await response.json());
}

export default async function HomePage() {
  const dashboard = await getDashboard();

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">PERSONAL OPERATING SYSTEM</p>
          <h1>把今天过得更清楚。</h1>
          <p className="lede">一个围绕日程、健康和消费记录构建的个人云端助手。</p>
        </div>
        <div className="date-chip">{dashboard.date}</div>
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
          <button className="primary-button" type="button">记录一条数据</button>
        </article>

        <article className="panel modules-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">MODULES</p>
              <h2>你的工具箱</h2>
            </div>
            <button className="text-button" type="button">管理</button>
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
