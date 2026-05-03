'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';

const isValidIsraeliId = (raw: string): boolean => {
  if (!/^\d{5,9}$/.test(raw)) return false;
  const id = raw.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let inc = parseInt(id[i], 10) * ((i % 2) + 1);
    if (inc > 9) inc -= 9;
    sum += inc;
  }
  return sum % 10 === 0;
};

const ClientSchema = z.object({
  fullName: z.string().min(2, 'שם קצר מדי'),
  idNumber: z.string().optional().transform((v) => v?.trim() || undefined),
  phone: z.string().optional().transform((v) => v?.trim() || undefined),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  birthDate: z.string().optional().transform((v) => v ? new Date(v) : undefined),
  address: z.string().optional().transform((v) => v?.trim() || undefined),
  occupation: z.string().optional().transform((v) => v?.trim() || undefined),
  leadSource: z.string().optional().transform((v) => v?.trim() || undefined),
  notes: z.string().optional().transform((v) => v?.trim() || undefined),
});

export type ClientFormState = { error: string | null };

export async function createClient(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const user = await requireUser();
  if (!user.tenantId) return { error: 'אין tenant' };

  const obj = Object.fromEntries(formData.entries());
  const parsed = ClientSchema.safeParse(obj);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  const { idNumber, ...rest } = parsed.data;
  if (idNumber && !isValidIsraeliId(idNumber)) {
    // not a hard fail — Hebrew IDs sometimes come dirty from Excel
  }

  const id = idNumber ? idNumber.padStart(9, '0').slice(-9) : null;

  // dedup by id_number per tenant
  if (id) {
    const existing = await prisma.client.findFirst({
      where: { tenantId: user.tenantId, idNumber: id },
    });
    if (existing) {
      redirect(`/clients/${existing.id}?dup=1`);
    }
  }

  const c = await prisma.client.create({
    data: {
      tenantId: user.tenantId,
      ownerUserId: user.id,
      fullName: rest.fullName,
      idNumber: id,
      phone: rest.phone,
      email: rest.email,
      birthDate: rest.birthDate,
      address: rest.address,
      occupation: rest.occupation,
      leadSource: rest.leadSource,
      notes: rest.notes,
      firstContactAt: new Date(),
    },
  });

  revalidatePath('/clients');
  redirect(`/clients/${c.id}`);
}

export async function updateClient(clientId: string, formData: FormData) {
  const user = await requireUser();
  const obj = Object.fromEntries(formData.entries());
  const parsed = ClientSchema.safeParse(obj);
  if (!parsed.success) return { error: 'שגיאה' };

  await prisma.client.update({
    where: { id: clientId, tenantId: user.tenantId ?? '' },
    data: parsed.data as any,
  });
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
