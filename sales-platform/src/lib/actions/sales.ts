'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { evaluateCommission, generateSchedule, resolveBestRule } from '@/lib/commission-engine';
import type { CommissionFormula } from '@/lib/commission-engine/types';
import type { SaleStatus, TransferType } from '@prisma/client';

const ItemInputSchema = z.object({
  companyId: z.string().min(1),
  productTypeId: z.string().min(1),
  subKey: z.string().optional(),
  track: z.string().optional(),
  monthlyPremium: z.coerce.number().nonnegative().default(0),
  annualPremium: z.coerce.number().nonnegative().default(0),
  lumpSum: z.coerce.number().nonnegative().default(0),
  accumulatedAmount: z.coerce.number().nonnegative().default(0),
  recognitionFactor: z.coerce.number().min(0).max(2).default(1),
  insuranceCoverage: z.coerce.number().nonnegative().default(0),
  policyNumber: z.string().optional(),
  policyStartDate: z.string().optional(),
});
const NewSaleSchema = z.object({
  clientId: z.string().min(1),
  transferType: z.enum(['NEW_MONEY', 'AGENT_APPOINTMENT', 'CONSULTING_FEE']).optional(),
  notes: z.string().optional(),
  items: z.array(ItemInputSchema).min(1, 'לפחות פריט אחד'),
});

export async function createSale(input: unknown) {
  const user = await requireUser();
  if (!user.tenantId) throw new Error('no tenant');

  const parsed = NewSaleSchema.parse(input);
  const sale = await prisma.sale.create({
    data: {
      tenantId: user.tenantId,
      ownerUserId: user.id,
      clientId: parsed.clientId,
      transferType: parsed.transferType,
      notes: parsed.notes,
    },
  });

  for (const it of parsed.items) {
    const annualPremium = it.annualPremium || it.monthlyPremium * 12;
    const computed = await computeForItem({
      tenantId: user.tenantId,
      userId: user.id,
      companyId: it.companyId,
      productTypeId: it.productTypeId,
      track: it.track ?? null,
      subKey: it.subKey ?? null,
      transferType: parsed.transferType ?? null,
      effectiveDate: new Date(),
      inputs: {
        monthlyPremium: it.monthlyPremium,
        annualPremium,
        lumpSum: it.lumpSum,
        accumulatedAmount: it.accumulatedAmount,
        recognitionFactor: it.recognitionFactor,
        insuranceCoverage: it.insuranceCoverage,
        policyStartDate: it.policyStartDate ? new Date(it.policyStartDate) : undefined,
        transferType: parsed.transferType,
      },
    });

    const item = await prisma.saleItem.create({
      data: {
        saleId: sale.id,
        tenantId: user.tenantId,
        companyId: it.companyId,
        productTypeId: it.productTypeId,
        track: it.track,
        monthlyPremium: it.monthlyPremium,
        annualPremium,
        lumpSum: it.lumpSum,
        accumulatedAmount: it.accumulatedAmount,
        recognitionFactor: it.recognitionFactor,
        insuranceCoverage: it.insuranceCoverage,
        policyNumber: it.policyNumber,
        policyStartDate: it.policyStartDate ? new Date(it.policyStartDate) : null,
        expectedScopeCommission: computed?.scopeAmount ?? 0,
        expectedRecurringCommission: computed?.recurringMonthlyAmount ?? 0,
        ruleIdUsed: computed?.ruleId ?? null,
        computedAt: new Date(),
      },
    });

    if (computed && computed.schedule.length > 0) {
      await prisma.expectedCommission.createMany({
        data: computed.schedule.map((s) => ({
          tenantId: user.tenantId!,
          saleItemId: item.id,
          userId: user.id,
          companyId: it.companyId,
          dueMonth: s.dueMonth,
          kind: s.kind,
          amount: s.amount,
        })),
      });
    }
  }

  // recompute sale aggregates
  await refreshSaleTotals(sale.id);
  await prisma.activity.create({
    data: {
      tenantId: user.tenantId,
      saleId: sale.id,
      clientId: parsed.clientId,
      type: 'SYSTEM',
      subject: 'עסקה נוצרה',
      occurredAt: new Date(),
      createdById: user.id,
    },
  });

  revalidatePath('/sales');
  revalidatePath('/sales/pipeline');
  redirect(`/sales/${sale.id}`);
}

export async function changeSaleStatus(saleId: string, status: SaleStatus) {
  const user = await requireUser();
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, tenantId: user.tenantId ?? '' },
  });
  if (!sale) throw new Error('not found');
  await prisma.sale.update({
    where: { id: saleId },
    data: {
      status,
      closedAt: ['CANCELLED','REJECTED','COMMISSION_RECEIVED','PAID_UP'].includes(status) ? new Date() : null,
    },
  });
  await prisma.activity.create({
    data: {
      tenantId: user.tenantId!,
      saleId,
      type: 'STATUS_CHANGE',
      subject: `סטטוס שונה ל: ${status}`,
      createdById: user.id,
      occurredAt: new Date(),
    },
  });
  revalidatePath('/sales');
  revalidatePath('/sales/pipeline');
  revalidatePath(`/sales/${saleId}`);
}

export async function refreshSaleTotals(saleId: string) {
  const items = await prisma.saleItem.findMany({ where: { saleId } });
  const scope = items.reduce((s, i) => s + Number(i.expectedScopeCommission), 0);
  const recurring = items.reduce((s, i) => s + Number(i.expectedRecurringCommission), 0);
  await prisma.sale.update({
    where: { id: saleId },
    data: { totalExpectedScope: scope, totalExpectedRecurring: recurring },
  });
}

interface ComputeArgs {
  tenantId: string;
  userId: string;
  companyId: string;
  productTypeId: string;
  track: string | null;
  subKey: string | null;
  transferType: TransferType | null;
  effectiveDate: Date;
  inputs: Parameters<typeof evaluateCommission>[1];
}

export async function computeForItem(args: ComputeArgs) {
  const agreements = await prisma.commissionAgreement.findMany({
    where: { tenantId: args.tenantId, companyId: args.companyId, status: 'active' },
    include: { rules: true },
  });
  const best = resolveBestRule(agreements as any, {
    tenantId: args.tenantId,
    userId: args.userId,
    companyId: args.companyId,
    productTypeId: args.productTypeId,
    effectiveDate: args.effectiveDate,
    track: args.track,
    subKey: args.subKey,
    transferType: args.transferType ?? undefined,
  });
  if (!best) return null;
  const formula = best.rule.formula as unknown as CommissionFormula;
  const evaluated = evaluateCommission(formula, args.inputs);

  const schedule = args.inputs.policyStartDate
    ? generateSchedule(evaluated, args.inputs.policyStartDate, formula).map((s) => ({
        ...s,
        kind: s.kind as any,
      }))
    : [];

  return {
    ruleId: best.rule.id,
    scopeAmount: evaluated.scopeAmount,
    recurringMonthlyAmount: evaluated.recurringMonthlyAmount,
    breakdown: evaluated.breakdown,
    schedule,
  };
}
