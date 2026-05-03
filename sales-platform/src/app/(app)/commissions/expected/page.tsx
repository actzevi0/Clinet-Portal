import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scopeWhere } from '@/lib/rbac';
import { Card, Empty, Badge, Table, Th, Thead, Tr, Td, Select } from '@/components/ui';
import { fmtMoney, fmtMonth, monthKey } from '@/lib/format';
import { COMMISSION_KIND_LABELS, EXPECTED_STATUS_LABELS } from '@/lib/labels';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ExpectedCommissionsPage({ searchParams }: { searchParams: { month?: string; status?: string } }) {
  const user = await requireUser();
  const where = scopeWhere(user) as any;
  const month = searchParams.month ?? monthKey();

  // generate month options: -3..+12
  const opts: string[] = [];
  const now = new Date();
  for (let d = -3; d <= 12; d++) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + d, 1));
    opts.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  const expected = await prisma.expectedCommission.findMany({
    where: {
      ...where,
      dueMonth: month,
      ...(searchParams.status && { status: searchParams.status as any }),
    },
    include: {
      saleItem: {
        include: {
          sale: { include: { client: true } },
          productType: true,
        },
      },
      company: true,
    },
    orderBy: { amount: 'desc' },
  });

  const totals = expected.reduce(
    (acc, e) => {
      acc.count++;
      acc.amount += Number(e.amount);
      acc.received += Number(e.receivedAmount);
      acc.byStatus[e.status] = (acc.byStatus[e.status] ?? 0) + Number(e.amount);
      return acc;
    },
    { count: 0, amount: 0, received: 0, byStatus: {} as Record<string, number> },
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">עמלות צפויות</h1>
        <p className="text-sm text-white/60">{fmtMonth(month)}</p>
      </header>

      <form className="flex gap-2 items-center">
        <Select name="month" defaultValue={month} className="w-44">
          {opts.map((o) => <option key={o} value={o}>{fmtMonth(o)}</option>)}
        </Select>
        <Select name="status" defaultValue={searchParams.status ?? ''} className="w-44">
          <option value="">כל הסטטוסים</option>
          {Object.entries(EXPECTED_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <button type="submit" className="rounded-lg bg-white/5 hover:bg-white/10 px-3 h-10 text-sm">החל</button>
      </form>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">סך צפוי</div>
          <div className="text-xl font-semibold">{fmtMoney(totals.amount)}</div>
          <div className="text-xs text-white/40 mt-0.5">{totals.count} שורות</div>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="text-xs text-white/60">התקבל בפועל</div>
          <div className="text-xl font-semibold">{fmtMoney(totals.received)}</div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="text-xs text-white/60">פער</div>
          <div className="text-xl font-semibold">{fmtMoney(totals.amount - totals.received)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">השלמה</div>
          <div className="text-xl font-semibold">
            {totals.amount > 0 ? `${((totals.received / totals.amount) * 100).toFixed(0)}%` : '—'}
          </div>
        </div>
      </div>

      {expected.length === 0 ? (
        <Empty title="אין שורות עמלה צפויה לחודש זה" />
      ) : (
        <Card>
          <Table>
            <Thead>
              <tr>
                <Th>סוג</Th>
                <Th>לקוח</Th>
                <Th>חברה / מוצר</Th>
                <Th>צפוי</Th>
                <Th>התקבל</Th>
                <Th>סטטוס</Th>
              </tr>
            </Thead>
            <tbody>
              {expected.map((e) => (
                <Tr key={e.id}>
                  <Td>
                    <Badge className={
                      e.kind === 'SCOPE' ? 'bg-brand-500/20 text-brand-200' :
                      e.kind === 'RECURRING' ? 'bg-emerald-500/20 text-emerald-200' :
                      e.kind === 'CLAWBACK' ? 'bg-rose-500/20 text-rose-200' : ''
                    }>{COMMISSION_KIND_LABELS[e.kind]}</Badge>
                  </Td>
                  <Td>
                    <Link href={`/sales/${e.saleItem.sale.id}`} className="hover:underline">{e.saleItem.sale.client.fullName}</Link>
                  </Td>
                  <Td className="text-xs">{e.company.nameHe} · {e.saleItem.productType.nameHe}</Td>
                  <Td>{fmtMoney(Number(e.amount))}</Td>
                  <Td>{fmtMoney(Number(e.receivedAmount))}</Td>
                  <Td>
                    <Badge className={
                      e.status === 'RECEIVED' ? 'bg-emerald-500/20 text-emerald-200' :
                      e.status === 'PARTIAL'  ? 'bg-amber-500/20 text-amber-200' :
                      e.status === 'MISSING'  ? 'bg-rose-500/20 text-rose-200' :
                      e.status === 'DISPUTED' ? 'bg-orange-500/20 text-orange-200' : ''
                    }>
                      {EXPECTED_STATUS_LABELS[e.status]}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
