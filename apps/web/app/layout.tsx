import type { Metadata, Viewport } from 'next';
import { AppNav } from './nav';
import { PwaRegister } from './pwa-register';
import './styles.css';

export const metadata: Metadata = {
  title: '日常助手',
  description: '个人云端生活助手',
  applicationName: '日常助手',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    title: '日常助手',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#17242b',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <PwaRegister />
        <AppNav />
        {children}
      </body>
    </html>
  );
}
