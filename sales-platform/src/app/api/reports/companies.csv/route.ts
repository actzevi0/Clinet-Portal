import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scopeWhere } from '@/lib/rbac';
import { csvResponse } from '@/lib/csv';

export async function GET() {
  const user = await requireUser();
  const items = await prisma.saleItem.findMany({
    where: { sale: scopeWhere(user) as any },
    include: { company: true, productType: true },
  });
  const grouped = new Map<string, { name: string; count: number; scope: number; recurring: number; categories: Set<string> }>();
  for (const it of items) {
    const e = grouped.get(it.companyId) ?? { name: it.company.nameHe, count: 0, scope: 0, recurring: 0, categories: new Set() };
    e.count++;
    e.scope += Number(it.expectedScopeCommission);
    e.recurring += Number(it.expectedRecurringCommission);
    e.categories.add(it.productType.category);
    grouped.set(it.companyId, e);
  }
  const rows = [...grouped.values()].map((c) => [c.name, c.count, c.scope, c.recurring, [...c.categories].join(',')]);
  return csvResponse('companies.csv', ['חברה','עסקאות','עמלת היקף','עמלה שוטפת','קטגוריות'], rows);
}
