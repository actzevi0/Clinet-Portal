import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardTitle, Badge, Empty, Table, Thead, Th, Tr, Td } from '@/components/ui';
import { fmtDate, fmtMoney, fmtMonth } from '@/lib/format';
import { COMMISSION_KIND_LABELS, EXPECTED_STATUS_LABELS, SALE_STATUS_COLORS, SALE_STATUS_LABELS, ACTIVITY_TYPE_LABELS } from '@/lib/labels';
import { StatusChanger } from './status-changer';

export const dynamic = 'force-dynamic';

export default async function SaleDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const sale = await prisma.sale.findFirst({
    where: { id: params.id, tenantId: user.tenantId ?? '' },
    include: {
      client: true,
      owner: true,
      items: {
        include: {
          company: true,
          productType: true,
          expectedCommissions: { orderBy: { dueMonth: 'asc' }, take: 24 },
        },
      },
      activities: { orderBy: { occurredAt: 'desc' }, take: 30 },
    },
  });
  if (!sale) notFound();

  const allExpected = sale.items.flatMap((i) => i.expectedCommissions);
  const totalExpectedNext12 = allExpected.slice(0, 12).reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/sales" className="text-xs text-white/50 hover:text-white">← חזרה למכירות</Link>
        <div className="mt-2 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              <Link href={`/clients/${sale.client.id}`} className="hover:underline">{sale.client.fullName}</Link>
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge>
                <span className={`h-1.5 w-1.5 rounded-full ${SALE_STATUS_COLORS[sale.status]}`} />
                {SALE_STATUS_LABELS[sale.status]}
              </Badge>
              {sale.client.idNumber && <Badge>ת"ז {sale.client.idNumber}</Badge>}
              <Badge>נוצרה: {fmtDate(sale.createdAt)}</Badge>
              <Badge>סוכן: {sale.owner.fullName}</Badge>
            </div>
          </div>
          <StatusChanger saleId={sale.id} currentStatus={sale.status} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardTitle>היקף צפוי</CardTitle>
          <div className="text-2xl font-semibold">{fmtMoney(Number(sale.totalExpectedScope))}</div>
        </Card>
        <Card>
          <CardTitle>שוטפת חודשית</CardTitle>
          <div className="text-2xl font-semibold">{fmtMoney(Number(sale.totalExpectedRecurring))}</div>
        </Card>
        <Card>
          <CardTitle>צפוי 12 חודשים הבאים</CardTitle>
          <div className="text-2xl font-semibold">{fmtMoney(totalExpectedNext12)}</div>
        </Card>
      </div>

      <Card>
        <CardTitle>פריטי עסקה</CardTitle>
        {sale.items.length === 0 ? (
          <Empty title="אין פריטים" />
        ) : (
          <div className="space-y-4">
            {sale.items.map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 p-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div>
                    <div className="font-medium">{item.company.nameHe} · {item.productType.nameHe}</div>
                    <div className="text-xs text-white/50 mt-0.5">
                      {item.policyNumber && <span>פוליסה {item.policyNumber} · </span>}
                      {item.policyStartDate && <span>תחילה {fmtDate(item.policyStartDate)}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge>היקף {fmtMoney(Number(item.expectedScopeCommission))}</Badge>
                    <Badge>שוטפת {fmtMoney(Number(item.expectedRecurringCommission))}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {Number(item.monthlyPremium) > 0 && (
                    <div><span className="text-white/40">פרמיה חודשית: </span>{fmtMoney(Number(item.monthlyPremium))}</div>
                  )}
                  {Number(item.annualPremium) > 0 && (
                    <div><span className="text-white/40">שנתית: </span>{fmtMoney(Number(item.annualPremium))}</div>
                  )}
                  {Number(item.accumulatedAmount) > 0 && (
                    <div><span className="text-white/40">צבירה: </span>{fmtMoney(Number(item.accumulatedAmount))}</div>
                  )}
                  {Number(item.recognitionFactor) !== 1 && (
                    <div><span className="text-white/40">דנח: </span>{Number(item.recognitionFactor).toFixed(2)}</div>
                  )}
                </div>
                {item.expectedCommissions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <div className="text-xs text-white/50 mb-2">לוח עמלות צפוי (24 חודשים)</div>
                    <div className="grid grid-cols-6 md:grid-cols-12 gap-1">
                      {item.expectedCommissions.map((e) => (
                        <div
                          key={e.id}
                          title={`${fmtMonth(e.dueMonth)}: ${COMMISSION_KIND_LABELS[e.kind]} ${fmtMoney(Number(e.amount))}`}
                          className={`text-center text-[10px] py-1 rounded ${e.kind === 'SCOPE' ? 'bg-brand-500/30' : 'bg-emerald-500/15'}`}
                        >
                          {e.dueMonth.split('-')[1]}/{e.dueMonth.split('-')[0].slice(2)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>פעילות</CardTitle>
        {sale.activities.length === 0 ? (
          <Empty title="אין פעילות עדיין" />
        ) : (
          <ul className="space-y-2">
            {sale.activities.map((a) => (
              <li key={a.id} className="text-sm flex gap-3 border-r-2 border-brand-500/30 pr-3">
                <div className="text-xs text-white/40 w-32 shrink-0">{fmtDate(a.occurredAt)}</div>
                <div>
                  <div className="text-xs text-white/50">{ACTIVITY_TYPE_LABELS[a.type]}</div>
                  <div>{a.subject}</div>
                  {a.body && <div className="text-xs text-white/50 mt-0.5">{a.body}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {sale.notes && (
        <Card>
          <CardTitle>הערות</CardTitle>
          <p className="text-sm whitespace-pre-wrap">{sale.notes}</p>
        </Card>
      )}
    </div>
  );
}
