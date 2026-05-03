'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { monthKey } from '@/lib/format';

const Schema = z.object({
  companyId: z.string().min(1),
  paymentDate: z.string().min(1),
  amount: z.coerce.number().positive(),
  note: z.string().optional(),
});

export async function recordManualPayment(formData: FormData) {
  const user = await requireUser();
  if (!user.tenantId) throw new Error('no tenant');
  const data = Schema.parse(Object.fromEntries(formData.entries()));
  const date = new Date(data.paymentDate);
  await prisma.commissionPayment.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      companyId: data.companyId,
      paymentDate: date,
      paymentMonth: monthKey(date),
      amount: data.amount,
      source: 'MANUAL',
      rawPayload: data.note ? { note: data.note } : undefined,
    },
  });
  revalidatePath('/commissions/payments');
}

export async function deletePayment(id: string) {
  const user = await requireUser();
  await prisma.commissionPayment.delete({
    where: { id, tenantId: user.tenantId ?? '' },
  });
  revalidatePath('/commissions/payments');
}
