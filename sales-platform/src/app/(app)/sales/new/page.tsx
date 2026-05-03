import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scopeWhere } from '@/lib/rbac';
import { NewSaleWizard } from './wizard';

export const dynamic = 'force-dynamic';

export default async function NewSalePage({ searchParams }: { searchParams: { clientId?: string } }) {
  const user = await requireUser();
  const where = scopeWhere(user) as any;

  const [clients, companies, productTypes] = await Promise.all([
    prisma.client.findMany({
      where: { ...where, deletedAt: null },
      select: { id: true, fullName: true, idNumber: true, phone: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.company.findMany({ select: { id: true, code: true, nameHe: true, kind: true }, orderBy: { nameHe: 'asc' } }),
    prisma.productType.findMany({
      select: { id: true, code: true, nameHe: true, category: true, supportsAccumulation: true, supportsMonthlyPremium: true },
      orderBy: { nameHe: 'asc' },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">עסקה חדשה</h1>
        <p className="text-sm text-white/60">הוסף לקוח, פריטי עסקה ופרמטרים — תחזית עמלה תחושב בזמן אמת</p>
      </header>
      <NewSaleWizard
        clients={clients}
        companies={companies}
        productTypes={productTypes}
        defaultClientId={searchParams.clientId}
      />
    </div>
  );
}
