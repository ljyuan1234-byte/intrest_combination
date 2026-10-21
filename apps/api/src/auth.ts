import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '@life/database';
import { auditLogs, sessions, users } from '@life/database/schema';
import type { AppConfig } from './config.js';

const SESSION_COOKIE = 'life_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

export type CurrentUser = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
};

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Web 客户端只通过 HttpOnly Cookie 携带会话。
 * 不再支持 Authorization: Bearer，避免在纯 Web 产品中保留第二套凭证入口。
 */
function resolveSessionToken(request: FastifyRequest): string | null {
  return request.cookies[SESSION_COOKIE] ?? null;
}

export function getClientIp(request: FastifyRequest): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(',')[0]?.trim() ?? request.ip ?? null;
}

export async function writeAuditLog(
  db: Database,
  request: FastifyRequest,
  action: string,
  userId?: string,
  metadata: Record<string, string | number | boolean> = {},
): Promise<void> {
  await db.insert(auditLogs).values({
    userId,
    action,
    requestId: request.id,
    ipAddress: getClientIp(request),
    metadata,
  });
}

/**
 * 创建 Web 会话，并下发 HttpOnly、SameSite=Lax 的 Cookie。
 * 明文 token 只存在于 Set-Cookie 响应头中，数据库仅保存 SHA-256 哈希。
 */
export async function createSession(
  db: Database,
  reply: FastifyReply,
  config: AppConfig,
  user: Pick<CurrentUser, 'id'>,
): Promise<{ token: string; expiresAt: Date }> {
  const token = createToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
  });

  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });

  return { token, expiresAt };
}

export async function getCurrentUser(db: Database, request: FastifyRequest): Promise<CurrentUser | null> {
  const token = resolveSessionToken(request);
  if (!token) return null;

  const [result] = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      displayName: users.displayName,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  return result ?? null;
}

export async function revokeCurrentSession(
  db: Database,
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
): Promise<void> {
  const token = resolveSessionToken(request);

  if (token) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)));
  }

  if (request.cookies[SESSION_COOKIE]) {
    reply.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      path: '/',
    });
  }
}
