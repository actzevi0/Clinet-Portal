import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Kpi } from '@/components/kpi';
import { fmtMoney, fmtNumber, monthKey } from '@/lib/format';
import { Card, CardTitle, Table, Thead, Th, Tr, Td, Empty, Badge } from '@/components/ui';
import { SALE_STATUS_COLORS, SALE_STATUS_LABELS } from '@/lib/labels';
import { scopeWhere } from '@/lib/rbac';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  const where = scopeWhere(user) as any;

  const month = monthKey();
  const monthStart = new Date(`${month}-01T00:00:00Z`);
  const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));

  // Run queries in parallel
  const [
    salesCountThisMonth,
    salesAggThisMonth,
    expectedThisMonth,
    expectedNextMonth,
    pipelineOpen,
    pipelineByStatus,
    topCompanies,
    topProducts,
    receivedThisMonth,
  ] = await Promise.all([
    prisma.sale.count({
      where: { ...where, createdAt: { gte: monthStart, lt: nextMonth } },
    }),
    prisma.saleItem.aggregate({
      where: { sale: where, createdAt: { gte: monthStart, lt: nextMonth } },
      _sum: { monthlyPremium: true, expectedScopeCommission: true, expectedRecurringCommission: true },
    }),
    prisma.expectedCommission.aggregate({
      where: { ...where, dueMonth: month },
      _sum: { amount: true },
    }),
    prisma.expectedCommission.aggregate({
      where: { ...where, dueMonth: nextMonthKey(month) },
      _sum: { amount: true },
    }),
    prisma.sale.count({
      where: { ...where, status: { in: ['LEAD', 'CONTACTED', 'DOCS_PENDING', 'SUBMITTED', 'IN_COMPANY'] } },
    }),
    prisma.sale.groupBy({
      by: ['status'],
      where,
      _count: true,
    }),
    prisma.saleItem.groupBy({
      by: ['companyId'],
      where: { sale: where },
      _sum: { expectedScopeCommission: true },
      orderBy: { _sum: { expectedScopeCommission: 'desc' } },
      take: 5,
    }),
    prisma.saleItem.groupBy({
      by: ['productTypeId'],
      where: { sale: where },
      _count: true,
      orderBy: { _count: { productTypeId: 'desc' } },
      take: 5,
    }),
    prisma.commissionPayment.aggregate({
      where: { ...where, paymentMonth: month },
      _sum: { amount: true },
    }),
  ]);

  const companyIds = topCompanies.map((c) => c.companyId);
  const productIds = topProducts.map((p) => p.productTypeId);
  const [companies, productTypes] = await Promise.all([
    prisma.company.findMany({ where: { id: { in: companyIds } } }),
    prisma.productType.findMany({ where: { id: { in: productIds } } }),
  ]);
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const productById = new Map(productTypes.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">לוח ראשי</h1>
          <p className="text-sm text-white/60">סקירה עסקית כללית · {month}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/sales/new" className="inline-flex items-center gap-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 text-sm font-medium">
            עסקה חדשה
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="מכירות החודש" value={fmtNumber(salesCountThisMonth)} accent="brand" />
        <Kpi label="פרמיה חודשית מצטברת" value={fmtMoney(Number(salesAggThisMonth._sum.monthlyPremium ?? 0))} />
        <Kpi
          label="היקף עמלות צפוי החודש"
          value={fmtMoney(Number(expectedThisMonth._sum.amount ?? 0))}
          sub={`חודש הבא: ${fmtMoney(Number(expectedNextMonth._sum.amount ?? 0))}`}
        />
        <Kpi
          label="עמלות שהתקבלו החודש"
          value={fmtMoney(Number(receivedThisMonth._sum.amount ?? 0))}
          accent="success"
          sub={`עסקאות פתוחות: ${pipelineOpen}`}
        />
      </section>

      <section className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardTitle>סטטוס פייפליין</CardTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {pipelineByStatus.length === 0 ? (
              <div className="col-span-4">
                <Empty
                  title="אין מכירות עדיין"
                  hint="התחל עם ייבוא נתונים מאקסל או צור עסקה ידנית"
                  cta={
                    <div className="flex gap-2 justify-center">
                      <Link href="/import" className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm">ייבוא מאקסל</Link>
                      <Link href="/sales/new" className="rounded-lg bg-brand-500 hover:bg-brand-600 px-4 py-2 text-sm">עסקה חדשה</Link>
                    </div>
                  }
                />
              </div>
            ) : pipelineByStatus.map((p) => (
              <Link
                key={p.status}
                href={`/sales?status=${p.status}`}
                className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${SALE_STATUS_COLORS[p.status]}`} />
                  <span className="text-xs text-white/60">{SALE_STATUS_LABELS[p.status]}</span>
                </div>
                <div className="text-xl font-semibold mt-1">{p._count}</div>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>חברות מובילות</CardTitle>
          {topCompanies.length === 0 ? (
            <p className="text-sm text-white/50">אין נתונים</p>
          ) : (
            <ul className="space-y-2">
              {topCompanies.map((c) => (
                <li key={c.companyId} className="flex items-center justify-between text-sm">
                  <span>{companyById.get(c.companyId)?.nameHe ?? '—'}</span>
                  <Badge>{fmtMoney(Number(c._sum.expectedScopeCommission ?? 0))}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <Card>
        <CardTitle>מוצרים מובילים</CardTitle>
        {topProducts.length === 0 ? (
          <p className="text-sm text-white/50">אין נתונים</p>
        ) : (
          <Table>
            <Thead>
              <tr><Th>מוצר</Th><Th>כמות עסקאות</Th></tr>
            </Thead>
            <tbody>
              {topProducts.map((p) => (
                <Tr key={p.productTypeId}>
                  <Td>{productById.get(p.productTypeId)?.nameHe ?? '—'}</Td>
                  <Td>{p._count}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function nextMonthKey(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}
