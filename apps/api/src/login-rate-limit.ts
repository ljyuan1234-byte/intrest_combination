const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

type Attempt = {
  failures: number;
  resetAt: number;
};

const attempts = new Map<string, Attempt>();

function current(key: string): Attempt | null {
  const entry = attempts.get(key);
  if (!entry) return null;
  if (entry.resetAt <= Date.now()) {
    attempts.delete(key);
    return null;
  }
  return entry;
}

/** 登录失败限流：同一 IP + 标识符在 15 分钟内最多 8 次失败。 */
export function isLoginBlocked(key: string): boolean {
  const entry = current(key);
  return Boolean(entry && entry.failures >= MAX_FAILURES);
}

export function recordLoginFailure(key: string): void {
  const entry = current(key);
  if (entry) {
    entry.failures += 1;
    return;
  }

  attempts.set(key, { failures: 1, resetAt: Date.now() + WINDOW_MS });
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}

/** 定期清理过期条目，避免进程内 Map 无限增长。 */
export function pruneLoginAttempts(): void {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
}
