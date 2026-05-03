import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardTitle, Empty, Badge, Table, Th, Thead, Tr, Td, Select } from '@/components/ui';
import { fmtDate, fmtMoney, fmtMonth, monthKey } from '@/lib/format';
import Link from 'next/link';
import { RunMatchButton } from './run-button';

export const dynamic = 'force-dynamic';

export default async function ReconcilePage({ searchParams }: { searchParams: { month?: string } }) {
  const user = await requireUser();
  const month = searchParams.month ?? monthKey();

  const opts: string[] = [];
  const now = new Date();
  for (let d = -12; d <= 1; d++) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + d, 1));
    opts.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  const todayMonth = monthKey();
  const [matched, partial, missing, unmatched] = await Promise.all([
    prisma.expectedCommission.findMany({
      where: { tenantId: user.tenantId ?? '', dueMonth: month, status: 'RECEIVED' },
      include: { saleItem: { include: { sale: { include: { client: true } }, productType: true } }, company: true, matches: true },
      take: 200,
    }),
    prisma.expectedCommission.findMany({
      where: { tenantId: user.tenantId ?? '', dueMonth: month, status: 'PARTIAL' },
      include: { saleItem: { include: { sale: { include: { client: true } }, productType: true } }, company: true },
      take: 200,
    }),
    prisma.expectedCommission.findMany({
      where: {
        tenantId: user.tenantId ?? '',
        dueMonth: { lte: month },
        status: { in: ['PENDING', 'MISSING'] },
      },
      include: { saleItem: { include: { sale: { include: { client: true } }, productType: true } }, company: true },
      orderBy: { dueMonth: 'asc' },
      take: 200,
    }),
    prisma.commissionPayment.findMany({
      where: { tenantId: user.tenantId ?? '', paymentMonth: month, reconciled: false },
      include: { company: true },
    }),
  ]);

  const buckets = [
    { key: 'matched',   label: '✓ מאומת',     color: 'border-emerald-500/30 bg-emerald-500/5',  count: matched.length },
    { key: 'partial',   label: '⚠ חלקי',      color: 'border-amber-500/30 bg-amber-500/5',      count: partial.length },
    { key: 'missing',   label: '✗ חסר',       color: 'border-rose-500/30 bg-rose-500/5',        count: missing.length },
    { key: 'unmatched', label: '? לא מזוהה',   color: 'border-orange-500/30 bg-orange-500/5',    count: unmatched.length },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">התאמות עמלות</h1>
          <p className="text-sm text-white/60">{fmtMonth(month)} · התאמה אוטומטית + ידנית</p>
        </div>
        <div className="flex gap-2 items-center">
          <form>
            <Select name="month" defaultValue={month} className="w-44">
              {opts.map((o) => <option key={o} value={o}>{fmtMonth(o)}</option>)}
            </Select>
          </form>
          <RunMatchButton month={month} />
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {buckets.map((b) => (
          <div key={b.key} className={`rounded-xl border p-4 ${b.color}`}>
            <div className="text-xs text-white/70">{b.label}</div>
            <div className="text-2xl font-semibold mt-1">{b.count}</div>
          </div>
        ))}
      </section>

      {partial.length > 0 && (
        <Card>
          <CardTitle>חלקי ({partial.length})</CardTitle>
          <Table>
            <Thead>
              <tr><Th>לקוח</Th><Th>חברה / מוצר</Th><Th>חודש</Th><Th>צפוי</Th><Th>התקבל</Th><Th>חסר</Th></tr>
            </Thead>
            <tbody>
              {partial.map((e) => (
                <Tr key={e.id}>
                  <Td><Link href={`/sales/${e.saleItem.sale.id}`} className="hover:underline">{e.saleItem.sale.client.fullName}</Link></Td>
                  <Td className="text-xs">{e.company.nameHe} · {e.saleItem.productType.nameHe}</Td>
                  <Td>{e.dueMonth}</Td>
                  <Td>{fmtMoney(Number(e.amount))}</Td>
                  <Td>{fmtMoney(Number(e.receivedAmount))}</Td>
                  <Td className="text-amber-300">{fmtMoney(Number(e.amount) - Number(e.receivedAmount))}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {missing.length > 0 && (
        <Card>
          <CardTitle>חסר ({missing.length})</CardTitle>
          {missing.length === 0 ? <Empty title="—" /> : (
            <Table>
              <Thead>
                <tr><Th>לקוח</Th><Th>חברה / מוצר</Th><Th>חודש יעד</Th><Th>צפוי</Th><Th>איחור</Th></tr>
              </Thead>
              <tbody>
                {missing.map((e) => (
                  <Tr key={e.id}>
                    <Td><Link href={`/sales/${e.saleItem.sale.id}`} className="hover:underline">{e.saleItem.sale.client.fullName}</Link></Td>
                    <Td className="text-xs">{e.company.nameHe} · {e.saleItem.productType.nameHe}</Td>
                    <Td>{e.dueMonth}</Td>
                    <Td>{fmtMoney(Number(e.amount))}</Td>
                    <Td className="text-rose-400 text-xs">{daysSince(e.dueMonth)} ימים</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {unmatched.length > 0 && (
        <Card>
          <CardTitle>תשלומים לא מזוהים ({unmatched.length})</CardTitle>
          <Table>
            <Thead>
              <tr><Th>תאריך</Th><Th>חברה</Th><Th>סכום</Th><Th>מקור</Th></tr>
            </Thead>
            <tbody>
              {unmatched.map((p) => (
                <Tr key={p.id}>
                  <Td className="text-xs">{fmtDate(p.paymentDate)}</Td>
                  <Td>{p.company.nameHe}</Td>
                  <Td>{fmtMoney(Number(p.amount))}</Td>
                  <Td><Badge>{p.source}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {matched.length > 0 && (
        <Card>
          <CardTitle>מאומת ({matched.length})</CardTitle>
          <Table>
            <Thead>
              <tr><Th>לקוח</Th><Th>חברה</Th><Th>סכום</Th><Th>התאמות</Th></tr>
            </Thead>
            <tbody>
              {matched.slice(0, 50).map((e) => (
                <Tr key={e.id}>
                  <Td><Link href={`/sales/${e.saleItem.sale.id}`} className="hover:underline">{e.saleItem.sale.client.fullName}</Link></Td>
                  <Td>{e.company.nameHe}</Td>
                  <Td>{fmtMoney(Number(e.amount))}</Td>
                  <Td><Badge>{e.matches.length}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function daysSince(dueMonth: string): number {
  const [y, m] = dueMonth.split('-').map(Number);
  const due = new Date(Date.UTC(y, m, 0));
  return Math.floor((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24));
}
