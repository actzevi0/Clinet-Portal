/**
 * Auth — cookie-based sessions backed by the Session table.
 * No NextAuth dependency to keep the surface small and explicit.
 */

import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { prisma } from './db';
import type { User } from '@prisma/client';

const COOKIE = 'sp_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export async function login(email: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || user.deletedAt || user.status !== 'active') {
    throw new Error('Invalid credentials');
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw new Error('Invalid credentials');

  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });

  return user;
}

export async function logout(): Promise<void> {
  const c = cookies().get(COOKIE);
  if (c?.value) {
    await prisma.session.updateMany({
      where: { token: c.value },
      data: { revoked: true },
    }).catch(() => {});
  }
  cookies().delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const c = cookies().get(COOKIE);
  if (!c?.value) return null;
  const session = await prisma.session.findUnique({
    where: { token: c.value },
    include: { user: true },
  });
  if (!session || session.revoked || session.expiresAt < new Date()) return null;
  if (session.user.deletedAt || session.user.status !== 'active') return null;
  return session.user;
}

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  return u;
}

export async function requireRole(roles: User['role'][]): Promise<User> {
  const u = await requireUser();
  if (!roles.includes(u.role)) redirect('/dashboard');
  return u;
}
