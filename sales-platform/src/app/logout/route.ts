import { logout } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST() {
  await logout();
  return NextResponse.redirect(new URL('/login', process.env.AUTH_URL ?? 'http://localhost:3001'));
}
