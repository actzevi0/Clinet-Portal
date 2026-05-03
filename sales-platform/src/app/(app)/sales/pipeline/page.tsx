import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scopeWhere } from '@/lib/rbac';
import { PipelineBoard } from './board';
import { PIPELINE_COLUMNS } from '@/lib/labels';
import { Plus } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const user = await requireUser();
  const where = scopeWhere(user) as any;

  const sales = await prisma.sale.findMany({
    where: {
      ...where,
      deletedAt: null,
      status: { in: PIPELINE_COLUMNS.map((c) => c.status) },
    },
    include: {
      client: { select: { id: true, fullName: true, idNumber: true } },
      items: { include: { company: { select: { nameHe: true } }, productType: { select: { nameHe: true } } }, take: 3 },
    },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  });

  return (
    <div className="space-y-4 h-[calc(100vh-3rem)] flex flex-col">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">פייפליין</h1>
          <p className="text-sm text-white/60">{sales.length} עסקאות פתוחות · גרור כדי לשנות סטטוס</p>
        </div>
        <Link href="/sales/new" className="inline-flex items-center gap-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 text-sm font-medium">
          <Plus className="h-4 w-4" />עסקה חדשה
        </Link>
      </header>

      <PipelineBoard
        sales={sales.map((s) => ({
          id: s.id,
          status: s.status,
          clientName: s.client.fullName,
          clientIdNumber: s.client.idNumber,
          totalScope: Number(s.totalExpectedScope),
          totalRecurring: Number(s.totalExpectedRecurring),
          items: s.items.map((i) => ({ companyName: i.company.nameHe, productName: i.productType.nameHe })),
          updatedAt: s.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
