import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardTitle, Badge, Empty, Table, Thead, Th, Tr, Td } from '@/components/ui';
import { fmtDate, fmtMoney } from '@/lib/format';
import { SALE_STATUS_COLORS, SALE_STATUS_LABELS } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const client = await prisma.client.findFirst({
    where: { id: params.id, tenantId: user.tenantId ?? '' },
    include: {
      sales: {
        include: {
          items: { include: { company: true, productType: true } },
          owner: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      activities: { orderBy: { occurredAt: 'desc' }, take: 20 },
    },
  });
  if (!client) notFound();

  const totalScope = client.sales.reduce((s, sa) => s + Number(sa.totalExpectedScope), 0);
  const totalRecurring = client.sales.reduce((s, sa) => s + Number(sa.totalExpectedRecurring), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/clients" className="text-xs text-white/50 hover:text-white">← חזרה ללקוחות</Link>
        <h1 className="text-2xl font-bold mt-2">{client.fullName}</h1>
        <div className="flex flex-wrap gap-2 mt-2">
          {client.idNumber && <Badge>ת"ז {client.idNumber}</Badge>}
          {client.phone && <Badge>{client.phone}</Badge>}
          {client.email && <Badge>{client.email}</Badge>}
          {client.leadSource && <Badge>מקור: {client.leadSource}</Badge>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardTitle>היקף כולל</CardTitle>
          <div className="text-2xl font-semibold">{fmtMoney(totalScope)}</div>
        </Card>
        <Card>
          <CardTitle>שוטפת חודשית</CardTitle>
          <div className="text-2xl font-semibold">{fmtMoney(totalRecurring)}</div>
        </Card>
        <Card>
          <CardTitle>עסקאות</CardTitle>
          <div className="text-2xl font-semibold">{client.sales.length}</div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <CardTitle className="mb-0">עסקאות</CardTitle>
          <Link href={`/sales/new?clientId=${client.id}`} className="text-sm text-brand-300 hover:text-brand-100">+ עסקה חדשה</Link>
        </div>
        {client.sales.length === 0 ? (
          <Empty title="אין עסקאות עדיין" />
        ) : (
          <Table>
            <Thead>
              <tr><Th>תאריך</Th><Th>סטטוס</Th><Th>פריטים</Th><Th>היקף צפוי</Th><Th>שוטפת</Th><Th>סוכן</Th></tr>
            </Thead>
            <tbody>
              {client.sales.map((s) => (
                <Tr key={s.id}>
                  <Td>{fmtDate(s.createdAt)}</Td>
                  <Td>
                    <Link href={`/sales/${s.id}`} className="hover:underline">
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${SALE_STATUS_COLORS[s.status]}`} />
                        {SALE_STATUS_LABELS[s.status]}
                      </span>
                    </Link>
                  </Td>
                  <Td className="text-xs">
                    {s.items.map((i) => `${i.company.nameHe} · ${i.productType.nameHe}`).join(' · ')}
                  </Td>
                  <Td>{fmtMoney(Number(s.totalExpectedScope))}</Td>
                  <Td>{fmtMoney(Number(s.totalExpectedRecurring))}</Td>
                  <Td className="text-xs text-white/60">{s.owner?.fullName ?? '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {client.notes && (
        <Card>
          <CardTitle>הערות</CardTitle>
          <p className="text-sm whitespace-pre-wrap">{client.notes}</p>
        </Card>
      )}
    </div>
  );
}
