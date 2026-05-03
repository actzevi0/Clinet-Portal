/**
 * Reconciliation Engine — matches CommissionPayment rows against
 * ExpectedCommission rows.
 *
 * Strategies (highest confidence first):
 *   1. exact policyNumber + same month
 *   2. exact amount + same month + same company + same agent
 *   3. partial: a single payment splits across multiple expecteds
 *   4. fuzzy by client id_number (manual review suggested)
 */

import type { Prisma } from '@prisma/client';

type ExpectedRow = Prisma.ExpectedCommissionGetPayload<{
  include: { saleItem: { include: { sale: { include: { client: true } } } } };
}>;
type PaymentRow = Prisma.CommissionPaymentGetPayload<{}>;

export interface MatchProposal {
  expectedId: string;
  paymentId: string;
  matchedAmount: number;
  matchType: 'AUTO_EXACT' | 'AUTO_PARTIAL' | 'AUTO_FUZZY' | 'MANUAL';
  confidence: number;
  reason: string;
}

const EPSILON = 1.0; // ₪1 tolerance for floating point + rounding

const monthsAround = (m: string): string[] => {
  const [y, mm] = m.split('-').map(Number);
  const out: string[] = [];
  for (let d = -1; d <= 1; d++) {
    const dt = new Date(Date.UTC(y, mm - 1 + d, 1));
    out.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

export function proposeMatches(
  payments: PaymentRow[],
  expected: ExpectedRow[],
): MatchProposal[] {
  const proposals: MatchProposal[] = [];
  const remaining = new Map(expected.map((e) => [e.id, Number(e.amount) - Number(e.receivedAmount)]));

  for (const p of payments) {
    if (p.reconciled) continue;
    const candidates = expected.filter(
      (e) =>
        e.companyId === p.companyId &&
        e.userId === p.userId &&
        monthsAround(p.paymentMonth).includes(e.dueMonth) &&
        (remaining.get(e.id) ?? 0) > 0.01,
    );

    // 1) policy number match — strongest
    if (p.policyNumber) {
      const polMatch = candidates.find((c) => c.saleItem && (c.saleItem as any).policyNumber === p.policyNumber);
      if (polMatch) {
        const amount = Math.min(Number(p.amount), remaining.get(polMatch.id) ?? 0);
        proposals.push({
          expectedId: polMatch.id,
          paymentId: p.id,
          matchedAmount: amount,
          matchType: 'AUTO_EXACT',
          confidence: 1.0,
          reason: `policy ${p.policyNumber}`,
        });
        remaining.set(polMatch.id, (remaining.get(polMatch.id) ?? 0) - amount);
        continue;
      }
    }

    // 2) exact amount
    const exact = candidates.find((c) => Math.abs(Number(c.amount) - Number(p.amount)) <= EPSILON);
    if (exact) {
      proposals.push({
        expectedId: exact.id,
        paymentId: p.id,
        matchedAmount: Number(p.amount),
        matchType: 'AUTO_EXACT',
        confidence: 0.95,
        reason: 'exact amount + month + company',
      });
      remaining.set(exact.id, (remaining.get(exact.id) ?? 0) - Number(p.amount));
      continue;
    }

    // 3) partial: one payment covers multiple expecteds
    const sumCandidates = pickSubsetSum(candidates, Number(p.amount), remaining);
    if (sumCandidates && sumCandidates.length > 1) {
      let leftover = Number(p.amount);
      for (const c of sumCandidates) {
        const left = remaining.get(c.id) ?? 0;
        const matched = Math.min(left, leftover);
        proposals.push({
          expectedId: c.id,
          paymentId: p.id,
          matchedAmount: matched,
          matchType: 'AUTO_PARTIAL',
          confidence: 0.8,
          reason: 'subset-sum match',
        });
        remaining.set(c.id, left - matched);
        leftover -= matched;
        if (leftover <= 0.01) break;
      }
    }
  }

  return proposals;
}

/** Greedy subset-sum approximation; not optimal but deterministic and fast */
function pickSubsetSum(items: ExpectedRow[], target: number, remaining: Map<string, number>): ExpectedRow[] | null {
  const sorted = [...items].sort((a, b) => Number(b.amount) - Number(a.amount));
  const picked: ExpectedRow[] = [];
  let total = 0;
  for (const it of sorted) {
    const left = remaining.get(it.id) ?? 0;
    if (left <= 0) continue;
    if (total + left <= target + EPSILON) {
      picked.push(it);
      total += left;
      if (Math.abs(total - target) <= EPSILON) return picked;
    }
  }
  return Math.abs(total - target) <= EPSILON ? picked : null;
}

export interface ReconciliationBuckets {
  matched: ExpectedRow[];
  partial: ExpectedRow[];
  missing: ExpectedRow[];
  unmatched: PaymentRow[];
}

export function buildBuckets(
  payments: PaymentRow[],
  expected: ExpectedRow[],
): ReconciliationBuckets {
  const today = new Date();
  const todayMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth()+1).padStart(2,'0')}`;

  return {
    matched:   expected.filter((e) => e.status === 'RECEIVED'),
    partial:   expected.filter((e) => e.status === 'PARTIAL'),
    missing:   expected.filter((e) =>
      (e.status === 'PENDING' || e.status === 'MISSING') && e.dueMonth < todayMonth,
    ),
    unmatched: payments.filter((p) => !p.reconciled),
  };
}
