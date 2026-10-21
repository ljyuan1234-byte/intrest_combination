export type Identity =
  | { kind: 'email'; email: string; value: string }
  | { kind: 'phone'; phone: string; value: string };

/**
 * 把用户输入的邮箱或手机号归一化成稳定的登录标识。
 *
 * - 邮箱统一小写；
 * - 手机号统一为 E.164，中国大陆 11 位手机号自动补 +86；
 * - 允许空格、括号和短横线，方便用户直接粘贴。
 */
export function parseIdentity(raw: string): Identity | null {
  const value = raw.trim();
  if (!value) return null;

  if (value.includes('@')) {
    const email = value.toLowerCase();
    if (email.length > 320) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return { kind: 'email', email, value: email };
  }

  let digits = value.replace(/[\s()-]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;

  if (!digits.startsWith('+')) {
    digits = /^1\d{10}$/.test(digits) ? `+86${digits}` : `+${digits}`;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(digits)) return null;
  return { kind: 'phone', phone: digits, value: digits };
}
