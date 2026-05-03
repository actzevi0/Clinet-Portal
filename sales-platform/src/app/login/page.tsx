'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from '@/lib/actions/auth';
import { Button, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const [state, formAction] = useFormState<LoginState, FormData>(loginAction, { error: null });

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Sales Platform</h1>
          <p className="text-sm opacity-60 mt-1">CRM + תחזית עמלות</p>
        </div>
        <form action={formAction} className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
          <Field label='דוא"ל'>
            <Input name="email" type="email" autoComplete="email" required defaultValue="tzvi@talpiot-demo.co.il" />
          </Field>
          <Field label="סיסמה">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          {state?.error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
              {state.error}
            </div>
          )}
          <SubmitBtn />
          <p className="text-xs text-white/40 text-center pt-2">
            דמו: <code>tzvi@talpiot-demo.co.il</code> / <code>ChangeMe!2026</code>
          </p>
        </form>
      </div>
    </div>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'מתחבר...' : 'התחברות'}
    </Button>
  );
}
