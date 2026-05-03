import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scopeWhere } from '@/lib/rbac';
import { csvResponse } from '@/lib/csv';
import { COMMISSION_KIND_LABELS, EXPECTED_STATUS_LABELS } from '@/lib/labels';

export async function GET() {
  const user = await requireUser();
  const expected = await prisma.expectedCommission.findMany({
    where: scopeWhere(user) as any,
    include: {
      saleItem: { include: { sale: { include: { client: true } }, productType: true } },
      company: true,
    },
    orderBy: { dueMonth: 'desc' },
  });
  const rows = expected.map((e) => [
    e.dueMonth,
    e.saleItem.sale.client.fullName,
    e.saleItem.sale.client.idNumber ?? '',
    e.company.nameHe,
    e.saleItem.productType.nameHe,
    COMMISSION_KIND_LABELS[e.kind],
    Number(e.amount),
    Number(e.receivedAmount),
    Number(e.variance),
    EXPECTED_STATUS_LABELS[e.status],
  ]);
  return csvResponse(
    'commissions.csv',
    ['חודש','לקוח','ת"ז','חברה','מוצר','סוג עמלה','צפוי','התקבל','פער','סטטוס'],
    rows,
  );
}
