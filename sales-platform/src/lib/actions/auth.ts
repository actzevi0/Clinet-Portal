'use server';

import { redirect } from 'next/navigation';
import { login as doLogin, logout as doLogout } from '@/lib/auth';
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginState = { error: string | null };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) return { error: 'נתונים לא תקינים' };
  try {
    await doLogin(parsed.data.email, parsed.data.password);
  } catch {
    return { error: 'דוא"ל או סיסמה שגויים' };
  }
  redirect('/dashboard');
}

export async function logoutAction() {
  await doLogout();
  redirect('/login');
}
