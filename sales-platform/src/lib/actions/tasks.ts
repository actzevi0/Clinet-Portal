'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import type { TaskStatus, TaskPriority } from '@prisma/client';

const Schema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  dueAt: z.string().optional(),
  priority: z.enum(['LOW','NORMAL','HIGH','URGENT']).default('NORMAL'),
  saleId: z.string().optional(),
  clientId: z.string().optional(),
});

export async function createTask(formData: FormData) {
  const user = await requireUser();
  if (!user.tenantId) throw new Error('no tenant');
  const data = Schema.parse(Object.fromEntries(formData.entries()));
  await prisma.task.create({
    data: {
      tenantId: user.tenantId,
      assigneeId: user.id,
      createdById: user.id,
      title: data.title,
      description: data.description,
      priority: data.priority,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      saleId: data.saleId || null,
      clientId: data.clientId || null,
    },
  });
  revalidatePath('/tasks');
}

export async function updateTaskStatus(id: string, status: TaskStatus) {
  const user = await requireUser();
  await prisma.task.update({
    where: { id, tenantId: user.tenantId ?? '' },
    data: {
      status,
      completedAt: status === 'DONE' ? new Date() : null,
    },
  });
  revalidatePath('/tasks');
}
