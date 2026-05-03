import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scopeWhere } from '@/lib/rbac';
import { csvResponse } from '@/lib/csv';
import { SALE_STATUS_LABELS } from '@/lib/labels';

export async function GET() {
  const user = await requireUser();
  const sales = await prisma.sale.findMany({
    where: { ...(scopeWhere(user) as any), deletedAt: null, status: { notIn: ['CANCELLED','REJECTED'] } },
    include: { client: true, owner: true },
    orderBy: { updatedAt: 'desc' },
  });
  const rows = sales.map((s) => [
    s.createdAt.toISOString().slice(0, 10),
    s.client.fullName,
    s.client.idNumber ?? '',
    SALE_STATUS_LABELS[s.status],
    s.owner.fullName,
    Number(s.totalExpectedScope),
    Number(s.totalExpectedRecurring),
  ]);
  return csvResponse('pipeline.csv', ['נוצרה','לקוח','ת"ז','סטטוס','סוכן','היקף צפוי','שוטפת'], rows);
}
