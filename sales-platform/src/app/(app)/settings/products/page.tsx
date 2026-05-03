import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, Table, Th, Thead, Tr, Td, Badge } from '@/components/ui';
import { PRODUCT_CATEGORY_LABELS } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  await requireUser();
  const products = await prisma.productType.findMany({
    where: { tenantId: null },
    include: { _count: { select: { rules: true, saleItems: true } } },
    orderBy: { nameHe: 'asc' },
  });
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">סוגי מוצר</h1>
        <p className="text-sm text-white/60">{products.length} מוצרים בקטלוג</p>
      </header>
      <Card>
        <Table>
          <Thead>
            <tr><Th>שם</Th><Th>קוד</Th><Th>קטגוריה</Th><Th>תומך פרמיה</Th><Th>תומך צבירה</Th><Th>חוקי עמלה</Th><Th>שימוש</Th></tr>
          </Thead>
          <tbody>
            {products.map((p) => (
              <Tr key={p.id}>
                <Td className="font-medium">{p.nameHe}</Td>
                <Td className="font-mono text-xs">{p.code}</Td>
                <Td><Badge>{PRODUCT_CATEGORY_LABELS[p.category as keyof typeof PRODUCT_CATEGORY_LABELS] ?? p.category}</Badge></Td>
                <Td>{p.supportsMonthlyPremium ? '✓' : '—'}</Td>
                <Td>{p.supportsAccumulation ? '✓' : '—'}</Td>
                <Td><Badge>{p._count.rules}</Badge></Td>
                <Td><Badge>{p._count.saleItems}</Badge></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
