'use client';

import { useEffect } from 'react';

/**
 * 只注册一个极简 service worker，让浏览器把站点识别为可安装 PWA。
 * 不缓存 API 或登录态页面，避免把私人数据写进缓存。
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA 注册失败不影响正常网页使用。
    });
  }, []);

  return null;
}
