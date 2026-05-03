import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardTitle, Empty, Table, Th, Thead, Tr, Td, Badge } from '@/components/ui';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AgreementsPage() {
  const user = await requireUser();
  const agreements = await prisma.commissionAgreement.findMany({
    where: { tenantId: user.tenantId ?? '' },
    include: {
      company: true,
      user: true,
      _count: { select: { rules: true } },
    },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">הסכמי עמלות</h1>
        <p className="text-sm text-white/60">{agreements.length} הסכמים</p>
      </header>

      {agreements.length === 0 ? (
        <Empty title="אין הסכמים עדיין" hint="הרץ db:seed כדי לטעון את הסכם פמילי אופיס" />
      ) : (
        <Card>
          <Table>
            <Thead>
              <tr>
                <Th>שם</Th>
                <Th>חברה</Th>
                <Th>ייעוד</Th>
                <Th>תוקף</Th>
                <Th>חוקים</Th>
                <Th>סטטוס</Th>
              </tr>
            </Thead>
            <tbody>
              {agreements.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <Link href={`/commissions/agreements/${a.id}`} className="font-medium hover:underline">{a.name}</Link>
                  </Td>
                  <Td>{a.company.nameHe}</Td>
                  <Td>{a.user ? a.user.fullName : 'כל הצוות'}</Td>
                  <Td className="text-xs">
                    {fmtDate(a.validFrom)}
                    {a.validTo ? ` → ${fmtDate(a.validTo)}` : ' → ∞'}
                  </Td>
                  <Td><Badge>{a._count.rules}</Badge></Td>
                  <Td>
                    <Badge className={a.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-500/20'}>
                      {a.status}
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
