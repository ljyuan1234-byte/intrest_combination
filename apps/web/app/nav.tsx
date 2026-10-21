'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/', label: '首页', icon: '首' },
  { href: '/tasks', label: '待办', icon: '待' },
  { href: '/calendar', label: '日程', icon: '历' },
  { href: '/health', label: '健康', icon: '健' },
  { href: '/finance', label: '财务', icon: '财' },
] as const;

export function AppNav() {
  const pathname = usePathname();

  if (pathname === '/login') return null;

  return (
    <nav className="app-nav" aria-label="主导航">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? 'page' : undefined}
        >
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
