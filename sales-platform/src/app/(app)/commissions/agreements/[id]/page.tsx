import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardTitle, Badge, Empty } from '@/components/ui';
import { fmtDate, fmtMoney } from '@/lib/format';
import type { CommissionFormula } from '@/lib/commission-engine/types';

export const dynamic = 'force-dynamic';

export default async function AgreementDetail({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const agreement = await prisma.commissionAgreement.findFirst({
    where: { id: params.id, tenantId: user.tenantId ?? '' },
    include: {
      company: true,
      user: true,
      rules: { include: { productType: true }, orderBy: { priority: 'desc' } },
    },
  });
  if (!agreement) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/commissions/agreements" className="text-xs text-white/50 hover:text-white">← חזרה להסכמים</Link>
        <h1 className="text-2xl font-bold mt-2">{agreement.name}</h1>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge>{agreement.company.nameHe}</Badge>
          <Badge>{agreement.user ? agreement.user.fullName : 'כל הצוות'}</Badge>
          <Badge>{fmtDate(agreement.validFrom)} → {agreement.validTo ? fmtDate(agreement.validTo) : '∞'}</Badge>
          <Badge className={agreement.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : ''}>{agreement.status}</Badge>
        </div>
        {agreement.notes && <p className="text-sm text-white/60 mt-3">{agreement.notes}</p>}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">חוקי עמלה ({agreement.rules.length})</h2>
        {agreement.rules.length === 0 ? (
          <Empty title="אין חוקים" />
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {agreement.rules.map((r) => {
              const f = r.formula as unknown as CommissionFormula;
              return (
                <Card key={r.id}>
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="mb-0">{r.productType.nameHe}</CardTitle>
                    <div className="flex gap-1">
                      {r.subKey && <Badge>{r.subKey}</Badge>}
                      {r.transferType && <Badge>{r.transferType}</Badge>}
                    </div>
                  </div>
                  {f.description && <p className="text-xs text-white/50 mb-3">{f.description}</p>}
                  <FormulaDisplay formula={f} />
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FormulaDisplay({ formula }: { formula: CommissionFormula }) {
  return (
    <div className="space-y-2 text-xs">
      {formula.scope && (
        <div className="rounded-lg bg-brand-500/10 p-2.5">
          <div className="font-semibold text-brand-200 mb-1">היקף (חד-פעמי)</div>
          {formula.scope.components?.map((c, i) => (
            <div key={i} className="text-white/70 flex justify-between">
              <span>{labelFor(c.base)} × {(c.rate * 100).toFixed(2)}%</span>
              {c.multiplier && <span className="text-white/40">× דנח</span>}
            </div>
          ))}
          {formula.scope.flatAmount !== undefined && formula.scope.flatAmount > 0 && (
            <div className="text-white/70">סכום קבוע {fmtMoney(formula.scope.flatAmount)}</div>
          )}
          {formula.scope.flatTiers && formula.scope.flatTiers.length > 0 && (
            <div className="text-white/70">
              מדרגות לפי צבירה:
              {formula.scope.flatTiers.map((t, i) => (
                <div key={i} className="text-[10px] mr-2">
                  {t.minAccumulation.toLocaleString()}–{t.maxAccumulation?.toLocaleString() ?? '∞'} → {fmtMoney(t.amount)}
                </div>
              ))}
            </div>
          )}
          {formula.scope.supplementToAnnualPremiumPct !== undefined && (
            <div className="text-amber-300 mt-1">⤴ השלמה ל-{(formula.scope.supplementToAnnualPremiumPct * 100).toFixed(0)}% מפרמיה שנתית</div>
          )}
          {formula.scope.minAmount !== undefined && (
            <div className="text-amber-300 mt-1">רצפה {fmtMoney(formula.scope.minAmount)}</div>
          )}
        </div>
      )}
      {formula.recurring && (
        <div className="rounded-lg bg-emerald-500/10 p-2.5">
          <div className="font-semibold text-emerald-200 mb-1">שוטפת</div>
          {formula.recurring.components?.map((c, i) => (
            <div key={i} className="text-white/70">
              {labelFor(c.base)} × {(c.rate * 100).toFixed(2)}%
              {formula.recurring?.ratePeriod === 'annual' && <span className="text-white/40"> /שנה</span>}
            </div>
          ))}
          {formula.recurring.durationMonths === null && <div className="text-white/40 text-[10px]">לכל החיים</div>}
        </div>
      )}
      {formula.clawback?.enabled && (
        <div className="rounded-lg bg-rose-500/10 p-2.5">
          <div className="font-semibold text-rose-200 mb-1">מתווה ביטולים</div>
          <div className="flex gap-2">
            {formula.clawback.schedule.map((s) => (
              <span key={s.year} className="text-white/70">
                שנה {s.year}: {(s.pct * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const labelFor = (base: string) => ({
  annual_premium: 'פרמיה שנתית',
  monthly_premium: 'פרמיה חודשית',
  accumulated_amount: 'צבירה',
  lump_sum: 'הפקדה חד-פעמית',
  insurance_coverage: 'סכום ביטוח',
}[base] ?? base);
