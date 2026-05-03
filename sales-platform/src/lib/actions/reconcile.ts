'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { proposeMatches } from '@/lib/reconciliation-engine';

/** Run automated matching for the given month */
export async function runAutoMatch(month: string) {
  const user = await requireUser();
  if (!user.tenantId) throw new Error('no tenant');

  const payments = await prisma.commissionPayment.findMany({
    where: { tenantId: user.tenantId, paymentMonth: month, reconciled: false },
  });
  const expected = await prisma.expectedCommission.findMany({
    where: { tenantId: user.tenantId, status: { in: ['PENDING', 'PARTIAL', 'MISSING'] } },
    include: { saleItem: { include: { sale: { include: { client: true } } } } },
  });

  const proposals = proposeMatches(payments as any, expected as any);
  let created = 0;
  for (const m of proposals) {
    const existing = await prisma.commissionMatch.findUnique({
      where: { expectedId_paymentId: { expectedId: m.expectedId, paymentId: m.paymentId } },
    }).catch(() => null);
    if (existing) continue;

    await prisma.$transaction(async (tx) => {
      await tx.commissionMatch.create({
        data: {
          expectedId: m.expectedId,
          paymentId: m.paymentId,
          matchedAmount: m.matchedAmount,
          matchType: m.matchType,
          confidence: m.confidence,
          matchedByUserId: user.id,
        },
      });
      const exp = await tx.expectedCommission.findUnique({ where: { id: m.expectedId } });
      if (!exp) return;
      const newReceived = Number(exp.receivedAmount) + m.matchedAmount;
      const newStatus = Math.abs(newReceived - Number(exp.amount)) < 1
        ? 'RECEIVED'
        : newReceived > 0
        ? 'PARTIAL'
        : exp.status;
      await tx.expectedCommission.update({
        where: { id: m.expectedId },
        data: {
          receivedAmount: newReceived,
          status: newStatus as any,
          variance: newReceived - Number(exp.amount),
        },
      });

      // mark payment reconciled if fully matched
      const matches = await tx.commissionMatch.findMany({ where: { paymentId: m.paymentId } });
      const sumMatched = matches.reduce((s, x) => s + Number(x.matchedAmount), 0);
      const pmt = await tx.commissionPayment.findUnique({ where: { id: m.paymentId } });
      if (pmt && Math.abs(sumMatched - Number(pmt.amount)) < 1) {
        await tx.commissionPayment.update({
          where: { id: m.paymentId },
          data: { reconciled: true, reconciledAt: new Date() },
        });
      }
    });
    created++;
  }

  revalidatePath('/commissions/reconcile');
  revalidatePath('/commissions/expected');
  revalidatePath('/commissions/payments');
  return { proposals: proposals.length, created };
}

export async function manualMatch(expectedId: string, paymentId: string, amount: number) {
  const user = await requireUser();
  await prisma.$transaction(async (tx) => {
    await tx.commissionMatch.create({
      data: {
        expectedId, paymentId,
        matchedAmount: amount,
        matchType: 'MANUAL',
        confidence: 1,
        matchedByUserId: user.id,
      },
    });
    const exp = await tx.expectedCommission.findUnique({ where: { id: expectedId } });
    if (!exp) return;
    const newReceived = Number(exp.receivedAmount) + amount;
    const newStatus = Math.abs(newReceived - Number(exp.amount)) < 1 ? 'RECEIVED' : 'PARTIAL';
    await tx.expectedCommission.update({
      where: { id: expectedId },
      data: { receivedAmount: newReceived, status: newStatus as any, variance: newReceived - Number(exp.amount) },
    });
  });
  revalidatePath('/commissions/reconcile');
}
