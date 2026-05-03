import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scopeWhere } from '@/lib/rbac';
import { Card, Empty, Input, Table, Th, Thead, Tr, Td, Badge } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { Plus, Search } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const user = await requireUser();
  const where = scopeWhere(user) as any;
  const q = (searchParams.q ?? '').trim();

  const clients = await prisma.client.findMany({
    where: {
      ...where,
      deletedAt: null,
      ...(q && {
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { idNumber: { contains: q } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
        ],
      }),
    },
    include: { _count: { select: { sales: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">לקוחות</h1>
          <p className="text-sm text-white/60">{clients.length} לקוחות</p>
        </div>
        <div className="flex gap-2 items-center">
          <form className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input name="q" defaultValue={q} placeholder="חיפוש לקוח..." className="pr-9 w-64" />
          </form>
          <Link href="/clients/new" className="inline-flex items-center gap-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 text-sm font-medium">
            <Plus className="h-4 w-4" />לקוח חדש
          </Link>
        </div>
      </header>

      {clients.length === 0 ? (
        <Empty
          title={q ? 'לא נמצאו לקוחות תואמים' : 'אין לקוחות עדיין'}
          hint={q ? 'נסה חיפוש אחר' : 'צור לקוח ידנית או ייבא מאקסל'}
          cta={!q && (
            <div className="flex gap-2 justify-center">
              <Link href="/import" className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm">ייבוא</Link>
              <Link href="/clients/new" className="rounded-lg bg-brand-500 hover:bg-brand-600 px-4 py-2 text-sm">לקוח חדש</Link>
            </div>
          )}
        />
      ) : (
        <Card>
          <Table>
            <Thead>
              <tr>
                <Th>שם</Th>
                <Th>ת"ז</Th>
                <Th>טלפון</Th>
                <Th>דוא"ל</Th>
                <Th>עסקאות</Th>
                <Th>נוסף</Th>
              </tr>
            </Thead>
            <tbody>
              {clients.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <Link href={`/clients/${c.id}`} className="font-medium hover:underline">{c.fullName}</Link>
                  </Td>
                  <Td className="font-mono text-xs">{c.idNumber ?? '—'}</Td>
                  <Td className="text-xs">{c.phone ?? '—'}</Td>
                  <Td className="text-xs">{c.email ?? '—'}</Td>
                  <Td><Badge>{c._count.sales}</Badge></Td>
                  <Td className="text-xs text-white/60">{fmtDate(c.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
