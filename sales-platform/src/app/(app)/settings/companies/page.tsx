import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, Table, Th, Thead, Tr, Td, Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  await requireUser();
  const companies = await prisma.company.findMany({
    where: { tenantId: null },
    include: { _count: { select: { agreements: true } } },
    orderBy: { nameHe: 'asc' },
  });
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">חברות</h1>
        <p className="text-sm text-white/60">קטלוג גלובלי · {companies.length} חברות</p>
      </header>
      <Card>
        <Table>
          <Thead>
            <tr><Th>שם</Th><Th>קוד</Th><Th>סוג</Th><Th>הסכמים</Th></tr>
          </Thead>
          <tbody>
            {companies.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium">{c.nameHe}</Td>
                <Td className="font-mono text-xs">{c.code}</Td>
                <Td><Badge>{c.kind === 'INSURANCE' ? 'ביטוח' : c.kind === 'INVESTMENT_HOUSE' ? 'בית השקעות' : 'בנק'}</Badge></Td>
                <Td><Badge>{c._count.agreements}</Badge></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
