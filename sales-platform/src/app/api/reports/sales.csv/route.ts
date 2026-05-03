import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scopeWhere } from '@/lib/rbac';
import { csvResponse } from '@/lib/csv';
import { SALE_STATUS_LABELS } from '@/lib/labels';

export async function GET() {
  const user = await requireUser();
  const sales = await prisma.sale.findMany({
    where: { ...(scopeWhere(user) as any), deletedAt: null },
    include: {
      client: true,
      owner: true,
      items: { include: { company: true, productType: true } },
    },
  });

  const rows: any[][] = [];
  for (const s of sales) {
    for (const it of s.items) {
      rows.push([
        s.createdAt.toISOString().slice(0, 10),
        s.client.fullName,
        s.client.idNumber ?? '',
        s.owner.fullName,
        SALE_STATUS_LABELS[s.status],
        it.company.nameHe,
        it.productType.nameHe,
        it.policyNumber ?? '',
        Number(it.monthlyPremium),
        Number(it.annualPremium),
        Number(it.accumulatedAmount),
        Number(it.expectedScopeCommission),
        Number(it.expectedRecurringCommission),
      ]);
    }
  }
  return csvResponse(
    'sales.csv',
    ['תאריך','לקוח','ת"ז','סוכן','סטטוס','חברה','מוצר','מספר פוליסה','פרמיה חודשית','פרמיה שנתית','צבירה','עמלת היקף','עמלה שוטפת'],
    rows,
  );
}
