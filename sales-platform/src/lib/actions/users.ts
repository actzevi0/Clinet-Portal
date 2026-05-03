'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { hashPassword, requireRole } from '@/lib/auth';

const Schema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN','MANAGER','AGENT','VIEWER']),
});

export async function createUser(formData: FormData) {
  const admin = await requireRole(['ADMIN','SUPERADMIN']);
  if (!admin.tenantId) throw new Error('no tenant');
  const data = Schema.parse(Object.fromEntries(formData.entries()));
  const passwordHash = await hashPassword(data.password);
  await prisma.user.create({
    data: {
      tenantId: admin.tenantId,
      email: data.email.toLowerCase(),
      fullName: data.fullName,
      passwordHash,
      role: data.role,
    },
  });
  revalidatePath('/settings/team');
}
