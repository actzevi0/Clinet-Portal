/**
 * Forecast Engine — pure aggregation over expected commissions and pipeline.
 *
 *   weightedPipeline = Σ over open sales: probability(status) × (totalScope + totalRecurring × 12)
 *   runRate          = avg of last 3 months of received payments
 *   ltv              = scopePaid + recurringMonthlyAmount × horizon
 */

import { prisma } from '@/lib/db';
import { SALE_STATUS_PROBABILITY } from '@/lib/labels';

export interface ForecastMonth {
  month: string;
  expectedScope: number;
  expectedRecurring: number;
  expectedTotal: number;
  weightedPipeline: number;
  actualReceived: number;
}

export async function buildForecast(opts: {
  tenantId: string;
  userId?: string;
  months: number;
}): Promise<ForecastMonth[]> {
  const now = new Date();
  const months: string[] = [];
  for (let i = 0; i < opts.months; i++) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    months.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  const where: any = { tenantId: opts.tenantId };
  if (opts.userId) where.userId = opts.userId;

  const [expected, payments, openSales] = await Promise.all([
    prisma.expectedCommission.findMany({
      where: { ...where, dueMonth: { in: months } },
      select: { dueMonth: true, kind: true, amount: true },
    }),
    prisma.commissionPayment.findMany({
      where: { ...where, paymentMonth: { in: months } },
      select: { paymentMonth: true, amount: true },
    }),
    prisma.sale.findMany({
      where: {
        tenantId: opts.tenantId,
        ...(opts.userId && { ownerUserId: opts.userId }),
        deletedAt: null,
        status: { in: ['LEAD','CONTACTED','DOCS_PENDING','SUBMITTED','IN_COMPANY','ISSUED'] },
      },
      select: { status: true, totalExpectedScope: true, totalExpectedRecurring: true },
    }),
  ]);

  const weightedPipeline = openSales.reduce((s, sale) => {
    const p = SALE_STATUS_PROBABILITY[sale.status] ?? 0;
    return s + p * (Number(sale.totalExpectedScope) + Number(sale.totalExpectedRecurring) * 12);
  }, 0);

  return months.map((m) => {
    const exp = expected.filter((e) => e.dueMonth === m);
    const expectedScope = exp.filter((e) => e.kind === 'SCOPE').reduce((s, e) => s + Number(e.amount), 0);
    const expectedRecurring = exp.filter((e) => e.kind === 'RECURRING').reduce((s, e) => s + Number(e.amount), 0);
    const actualReceived = payments.filter((p) => p.paymentMonth === m).reduce((s, p) => s + Number(p.amount), 0);

    return {
      month: m,
      expectedScope,
      expectedRecurring,
      expectedTotal: expectedScope + expectedRecurring,
      weightedPipeline: weightedPipeline / opts.months, // distributed across forecast horizon
      actualReceived,
    };
  });
}

export async function runRate(tenantId: string, userId?: string): Promise<number> {
  const now = new Date();
  const months: string[] = [];
  for (let i = -3; i < 0; i++) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    months.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const r = await prisma.commissionPayment.aggregate({
    where: { tenantId, ...(userId && { userId }), paymentMonth: { in: months } },
    _sum: { amount: true },
  });
  return Number(r._sum.amount ?? 0) / 3;
}
