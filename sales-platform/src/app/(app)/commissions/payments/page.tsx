import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scopeWhere } from '@/lib/rbac';
import { Card, CardTitle, Empty, Table, Th, Thead, Tr, Td, Badge, Select, Field, Input, Button } from '@/components/ui';
import { fmtDate, fmtMoney, fmtMonth, monthKey } from '@/lib/format';
import Link from 'next/link';
import { recordManualPayment } from '@/lib/actions/payments';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage({ searchParams }: { searchParams: { month?: string } }) {
  const user = await requireUser();
  const where = scopeWhere(user) as any;
  const month = searchParams.month ?? monthKey();

  const opts: string[] = [];
  const now = new Date();
  for (let d = -12; d <= 0; d++) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + d, 1));
    opts.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  const [payments, companies, total] = await Promise.all([
    prisma.commissionPayment.findMany({
      where: { ...where, paymentMonth: month },
      include: { company: true, matches: { include: { expected: true } } },
      orderBy: { paymentDate: 'desc' },
    }),
    prisma.company.findMany({ orderBy: { nameHe: 'asc' } }),
    prisma.commissionPayment.aggregate({
      where: { ...where, paymentMonth: month },
      _sum: { amount: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">תשלומים שהתקבלו</h1>
        <p className="text-sm text-white/60">{fmtMonth(month)} · {fmtMoney(Number(total._sum.amount ?? 0))}</p>
      </header>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-4">
          <form className="flex gap-2 items-center">
            <Select name="month" defaultValue={month} className="w-44">
              {opts.map((o) => <option key={o} value={o}>{fmtMonth(o)}</option>)}
            </Select>
            <button type="submit" className="rounded-lg bg-white/5 hover:bg-white/10 px-3 h-10 text-sm">החל</button>
          </form>

          {payments.length === 0 ? (
            <Empty title="אין תשלומים מתועדים החודש" hint="ניתן לקלוט ידנית או דרך webhook" />
          ) : (
            <Card>
              <Table>
                <Thead>
                  <tr><Th>תאריך</Th><Th>חברה</Th><Th>סכום</Th><Th>מקור</Th><Th>שויך?</Th></tr>
                </Thead>
                <tbody>
                  {payments.map((p) => (
                    <Tr key={p.id}>
                      <Td className="text-xs">{fmtDate(p.paymentDate)}</Td>
                      <Td>{p.company.nameHe}</Td>
                      <Td className="font-medium">{fmtMoney(Number(p.amount))}</Td>
                      <Td><Badge>{p.source}</Badge></Td>
                      <Td>
                        {p.reconciled ? (
                          <Badge className="bg-emerald-500/20 text-emerald-200">{p.matches.length} התאמות</Badge>
                        ) : (
                          <Link href="/commissions/reconcile" className="text-xs text-amber-300 hover:underline">בצע התאמה</Link>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>

        <Card>
          <CardTitle>הזנה ידנית</CardTitle>
          <form action={recordManualPayment} className="space-y-3">
            <Field label="חברה">
              <Select name="companyId" required>
                <option value="">—</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.nameHe}</option>)}
              </Select>
            </Field>
            <Field label="תאריך תשלום">
              <Input name="paymentDate" type="date" required defaultValue={new Date().toISOString().slice(0,10)} />
            </Field>
            <Field label="סכום">
              <Input name="amount" type="number" step="0.01" required />
            </Field>
            <Field label="הערה">
              <Input name="note" />
            </Field>
            <Button type="submit" className="w-full">הוסף תשלום</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
