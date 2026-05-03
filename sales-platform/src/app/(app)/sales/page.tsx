import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scopeWhere } from '@/lib/rbac';
import { Card, Empty, Table, Th, Thead, Tr, Td, Badge, Select } from '@/components/ui';
import { fmtDate, fmtMoney } from '@/lib/format';
import { SALE_STATUS_COLORS, SALE_STATUS_LABELS } from '@/lib/labels';
import { Plus } from 'lucide-react';

export const dynamic = 'force-dynamic';

const statuses = Object.keys(SALE_STATUS_LABELS);

export default async function SalesListPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  const user = await requireUser();
  const where = scopeWhere(user) as any;
  const sales = await prisma.sale.findMany({
    where: {
      ...where,
      deletedAt: null,
      ...(searchParams.status && statuses.includes(searchParams.status) && { status: searchParams.status as any }),
      ...(searchParams.q && {
        OR: [
          { client: { fullName: { contains: searchParams.q, mode: 'insensitive' } } },
          { client: { idNumber: { contains: searchParams.q } } },
          { items: { some: { policyNumber: { contains: searchParams.q } } } },
        ],
      }),
    },
    include: {
      client: true,
      owner: true,
      items: { include: { company: true, productType: true }, take: 3 },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">מכירות</h1>
          <p className="text-sm text-white/60">{sales.length} עסקאות</p>
        </div>
        <div className="flex gap-2 items-center">
          <form className="flex gap-2 items-center">
            <Select name="status" defaultValue={searchParams.status ?? ''} className="w-44">
              <option value="">כל הסטטוסים</option>
              {Object.entries(SALE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <button type="submit" className="rounded-lg bg-white/5 hover:bg-white/10 px-3 h-10 text-sm">החל</button>
          </form>
          <Link href="/sales/new" className="inline-flex items-center gap-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 text-sm font-medium">
            <Plus className="h-4 w-4" />עסקה חדשה
          </Link>
        </div>
      </header>

      {sales.length === 0 ? (
        <Empty title="אין עסקאות תואמות" />
      ) : (
        <Card>
          <Table>
            <Thead>
              <tr>
                <Th>תאריך</Th>
                <Th>לקוח</Th>
                <Th>סטטוס</Th>
                <Th>פריטים</Th>
                <Th>היקף</Th>
                <Th>שוטפת</Th>
                <Th>סוכן</Th>
              </tr>
            </Thead>
            <tbody>
              {sales.map((s) => (
                <Tr key={s.id}>
                  <Td>{fmtDate(s.createdAt)}</Td>
                  <Td>
                    <Link href={`/sales/${s.id}`} className="font-medium hover:underline">
                      {s.client.fullName}
                    </Link>
                    {s.client.idNumber && <div className="text-[11px] text-white/40 font-mono">{s.client.idNumber}</div>}
                  </Td>
                  <Td>
                    <Badge>
                      <span className={`h-1.5 w-1.5 rounded-full ${SALE_STATUS_COLORS[s.status]}`} />
                      {SALE_STATUS_LABELS[s.status]}
                    </Badge>
                  </Td>
                  <Td className="text-xs">
                    {s.items.map((i) => (
                      <div key={i.id}>{i.company.nameHe} · {i.productType.nameHe}</div>
                    ))}
                  </Td>
                  <Td>{fmtMoney(Number(s.totalExpectedScope))}</Td>
                  <Td>{fmtMoney(Number(s.totalExpectedRecurring))}</Td>
                  <Td className="text-xs text-white/60">{s.owner.fullName}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
