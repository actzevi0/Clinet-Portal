'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createClient, type ClientFormState } from '@/lib/actions/clients';
import { Button, Card, Field, Input, Textarea } from '@/components/ui';
import Link from 'next/link';

export default function NewClientPage() {
  const [state, action] = useFormState<ClientFormState, FormData>(createClient, { error: null });
  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <Link href="/clients" className="text-xs text-white/50 hover:text-white">← חזרה ללקוחות</Link>
        <h1 className="text-2xl font-bold mt-2">לקוח חדש</h1>
      </header>

      <Card>
        <form action={action} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="שם מלא *">
              <Input name="fullName" required autoFocus />
            </Field>
            <Field label='ת"ז' hint="9 ספרות">
              <Input name="idNumber" inputMode="numeric" />
            </Field>
            <Field label="טלפון">
              <Input name="phone" inputMode="tel" />
            </Field>
            <Field label='דוא"ל'>
              <Input name="email" type="email" />
            </Field>
            <Field label="תאריך לידה">
              <Input name="birthDate" type="date" />
            </Field>
            <Field label="עיסוק">
              <Input name="occupation" />
            </Field>
            <Field label="כתובת">
              <Input name="address" />
            </Field>
            <Field label="מקור ליד">
              <Input name="leadSource" placeholder="המלצה / גוגל / WhatsApp / ..." />
            </Field>
          </div>
          <Field label="הערות">
            <Textarea name="notes" rows={3} />
          </Field>
          {state?.error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
              {state.error}
            </div>
          )}
          <div className="flex gap-2">
            <SubmitBtn />
            <Link href="/clients" className="inline-flex items-center justify-center px-4 h-10 rounded-lg text-sm bg-white/5 hover:bg-white/10">ביטול</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'שומר...' : 'שמור לקוח'}</Button>;
}
