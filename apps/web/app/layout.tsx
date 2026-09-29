import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: '日常助手',
  description: '个人云端生活助手',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
