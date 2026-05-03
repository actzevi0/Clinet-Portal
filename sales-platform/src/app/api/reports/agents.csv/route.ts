import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { csvResponse } from '@/lib/csv';

export async function GET() {
  const user = await requireUser();
  if (!user.tenantId) return new Response('unauthorized', { status: 401 });

  const users = await prisma.user.findMany({
    where: { tenantId: user.tenantId, deletedAt: null },
    include: { sales: true },
  });
  const rows = users.map((u) => {
    const closed = u.sales.filter((s) => ['SETTLED','COMMISSION_RECEIVED'].includes(s.status));
    return [
      u.fullName,
      u.email,
      u.role,
      u.sales.length,
      closed.length,
      closed.reduce((s, x) => s + Number(x.totalExpectedScope), 0),
      closed.reduce((s, x) => s + Number(x.totalExpectedRecurring), 0),
    ];
  });
  return csvResponse('agents.csv', ['שם','אימייל','תפקיד','עסקאות','עסקאות סגורות','היקף סגור','שוטפת'], rows);
}
