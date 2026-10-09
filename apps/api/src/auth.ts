import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '@life/database';
import { auditLogs, loginChallenges, sessions, users } from '@life/database/schema';
import type { AppConfig } from './config.js';

const SESSION_COOKIE = 'life_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;
const CHALLENGE_DURATION_MS = 1000 * 60 * 10;

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createToken(): string {
  return randomBytes(32).toString('base64url');
}

function getClientIp(request: FastifyRequest): string | null {
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

export async function createLoginChallenge(
  db: Database,
  request: FastifyRequest,
  email: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = createToken();
  const expiresAt = new Date(Date.now() + CHALLENGE_DURATION_MS);

  await db.insert(loginChallenges).values({
    email,
    tokenHash: hashToken(token),
    expiresAt,
  });

  await writeAuditLog(db, request, 'auth.login_challenge_created', undefined, { email });

  return { token, expiresAt };
}

export async function consumeLoginChallenge(
  db: Database,
  request: FastifyRequest,
  token: string,
): Promise<CurrentUser | null> {
  const now = new Date();
  const [challenge] = await db
    .select()
    .from(loginChallenges)
    .where(
      and(
        eq(loginChallenges.tokenHash, hashToken(token)),
        isNull(loginChallenges.consumedAt),
        gt(loginChallenges.expiresAt, now),
      ),
    )
    .limit(1);

  if (!challenge) {
    await writeAuditLog(db, request, 'auth.login_challenge_rejected');
    return null;
  }

  const [user] = await db
    .insert(users)
    .values({ email: challenge.email })
    .onConflictDoUpdate({
      target: users.email,
      set: { updatedAt: now },
    })
    .returning();

  await db
    .update(loginChallenges)
    .set({ consumedAt: now })
    .where(and(eq(loginChallenges.id, challenge.id), isNull(loginChallenges.consumedAt)));

  await writeAuditLog(db, request, 'auth.login_challenge_consumed', user.id);
  return user;
}

export async function createSession(
  db: Database,
  reply: FastifyReply,
  config: AppConfig,
  user: CurrentUser,
): Promise<void> {
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
}

export async function getCurrentUser(db: Database, request: FastifyRequest): Promise<CurrentUser | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;

  const [result] = await db
    .select({
      id: users.id,
      email: users.email,
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
  const token = request.cookies[SESSION_COOKIE];

  if (token) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)));
  }

  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    path: '/',
  });
}
