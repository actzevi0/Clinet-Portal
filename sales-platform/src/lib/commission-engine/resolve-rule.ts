/**
 * Rule resolution — given a sale item, find the most-specific applicable
 * commission rule from the agreements active at the sale's effective date.
 *
 * Specificity (highest priority wins):
 *   1. user-specific agreement > tenant-wide agreement
 *   2. transferType match > null
 *   3. track match > null
 *   4. subKey match > null
 *   5. higher rule.priority value
 */

import type { CommissionRule, CommissionAgreement } from '@prisma/client';

export interface ResolveContext {
  tenantId: string;
  userId: string;
  companyId: string;
  productTypeId: string;
  effectiveDate: Date;
  track?: string | null;
  subKey?: string | null;
  transferType?: 'NEW_MONEY' | 'AGENT_APPOINTMENT' | 'CONSULTING_FEE' | null;
}

export interface AgreementWithRules extends CommissionAgreement {
  rules: CommissionRule[];
}

export function resolveBestRule(
  agreements: AgreementWithRules[],
  ctx: ResolveContext,
): { agreement: AgreementWithRules; rule: CommissionRule } | null {
  const candidates: { agreement: AgreementWithRules; rule: CommissionRule; score: number }[] = [];

  for (const a of agreements) {
    if (a.tenantId !== ctx.tenantId) continue;
    if (a.companyId !== ctx.companyId) continue;
    if (a.status !== 'active') continue;
    if (a.userId && a.userId !== ctx.userId) continue;
    if (ctx.effectiveDate < a.validFrom) continue;
    if (a.validTo && ctx.effectiveDate > a.validTo) continue;

    for (const r of a.rules) {
      if (!r.active) continue;
      if (r.productTypeId !== ctx.productTypeId) continue;
      if (r.subKey && r.subKey !== ctx.subKey) continue;
      if (r.track && r.track !== ctx.track) continue;
      if (r.transferType && r.transferType !== ctx.transferType) continue;

      let score = r.priority;
      if (a.userId === ctx.userId) score += 1000;
      if (r.subKey === ctx.subKey && r.subKey) score += 100;
      if (r.track === ctx.track && r.track) score += 50;
      if (r.transferType === ctx.transferType && r.transferType) score += 25;

      candidates.push({ agreement: a, rule: r, score });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return { agreement: candidates[0].agreement, rule: candidates[0].rule };
}
