/**
 * Live commission preview — used by the new-sale wizard form.
 * Pure read-only; takes the form snapshot and returns what the engine
 * would compute against the current rules.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { computeForItem } from '@/lib/actions/sales';

const Body = z.object({
  companyId: z.string(),
  productTypeId: z.string(),
  subKey: z.string().nullish(),
  track: z.string().nullish(),
  transferType: z.enum(['NEW_MONEY','AGENT_APPOINTMENT','CONSULTING_FEE']).nullish(),
  monthlyPremium: z.number().nonnegative().default(0),
  annualPremium: z.number().nonnegative().default(0),
  lumpSum: z.number().nonnegative().default(0),
  accumulatedAmount: z.number().nonnegative().default(0),
  recognitionFactor: z.number().min(0).max(2).default(1),
  insuranceCoverage: z.number().nonnegative().default(0),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user.tenantId) return NextResponse.json({ error: 'no tenant' }, { status: 400 });
  const body = Body.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.message }, { status: 400 });

  const data = body.data;
  const annualPremium = data.annualPremium || data.monthlyPremium * 12;

  const result = await computeForItem({
    tenantId: user.tenantId,
    userId: user.id,
    companyId: data.companyId,
    productTypeId: data.productTypeId,
    track: data.track ?? null,
    subKey: data.subKey ?? null,
    transferType: data.transferType ?? null,
    effectiveDate: new Date(),
    inputs: {
      monthlyPremium: data.monthlyPremium,
      annualPremium,
      lumpSum: data.lumpSum,
      accumulatedAmount: data.accumulatedAmount,
      recognitionFactor: data.recognitionFactor,
      insuranceCoverage: data.insuranceCoverage,
    },
  });

  if (!result) {
    return NextResponse.json({
      hasRule: false,
      message: 'אין הסכם עמלה תואם לצירוף חברה×מוצר עבור הסוכן הזה',
      scopeAmount: 0,
      recurringMonthlyAmount: 0,
      breakdown: [],
    });
  }
  return NextResponse.json({
    hasRule: true,
    ruleId: result.ruleId,
    scopeAmount: result.scopeAmount,
    recurringMonthlyAmount: result.recurringMonthlyAmount,
    breakdown: result.breakdown,
  });
}
